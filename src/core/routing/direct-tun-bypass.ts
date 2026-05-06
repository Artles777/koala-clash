import {
  formatRouteExcludeAddress,
  normalizeEndpointHost,
  normalizeIpList,
  normalizeRouteExcludeAddresses
} from './route-exclude-utils'

export type DirectExcludeMode = 'conservative' | 'full_supported_types'
export type DirectExcludeOverallStatus = 'active' | 'partial' | 'blocked' | 'inactive'
export type DirectTunBypassStatus = 'disabled' | 'not_required' | 'resolved' | 'partial' | 'failed'

export type DirectTunBypassWarningCode =
  | 'feature_disabled'
  | 'tun_disabled'
  | 'no_direct_rules'
  | 'domain_resolution_failed'
  | 'domain_suffix_apex_only'
  | 'domain_route_is_ip_based'
  | 'domain_keyword_unsupported'
  | 'process_name_unsupported'
  | 'process_path_unsupported'
  | 'rule_type_unsupported'
  | 'invalid_ip_cidr'

export interface DirectTunBypassWarning {
  code: DirectTunBypassWarningCode
  rule?: string
  ruleType?: string
  value?: string
  message: string
}

export interface UnsupportedDirectTunBypassRule {
  rule: string
  ruleType: string
  value?: string
  reasonCode: DirectTunBypassWarningCode
  message: string
}

export type DirectTunBypassResolvedRuleCoverage =
  | 'exact_route_exclude'
  | 'resolved_ip_route_exclude'
  | 'partial_resolved_ip_route_exclude'

export interface ResolvedDirectTunBypassRule {
  rule: string
  ruleType: string
  value?: string
  routeExcludeAddresses: string[]
  coverage: DirectTunBypassResolvedRuleCoverage
}

export interface DirectTunBypassResolution {
  enabled: boolean
  mode: DirectExcludeMode
  tunEnabled: boolean
  status: DirectTunBypassStatus
  directExcludeOverallStatus: DirectExcludeOverallStatus
  active: boolean
  directRuleCount: number
  excludableRuleCount: number
  supportedRuleCount: number
  unsupportedRuleCount: number
  partialRuleCount: number
  failedRuleCount: number
  resolvedAddressCount: number
  routeExcludeAddresses: string[]
  resolvedRules: ResolvedDirectTunBypassRule[]
  warnings: DirectTunBypassWarning[]
  unsupportedRules: UnsupportedDirectTunBypassRule[]
  resolvedAt: number
}

export interface DirectTunBypassConfig {
  tun?: {
    enable?: boolean
    'route-exclude-address'?: string[]
    [key: string]: unknown
  }
  rules?: unknown[]
  [key: string]: unknown
}

export interface DirectTunBypassLookupResult {
  address: string
  family?: number
}

export type DirectTunBypassLookup = (hostname: string) => Promise<DirectTunBypassLookupResult[]>

export interface ResolveDirectTunBypassOptions<T extends DirectTunBypassConfig> {
  config: T
  enabled: boolean
  mode?: DirectExcludeMode
  lookup?: DirectTunBypassLookup
  now?: () => number
}

export interface DirectTunBypassInjectionResult<T extends DirectTunBypassConfig> {
  config: T
  injected: boolean
  routeExcludeAddresses: string[]
  reason?: 'tun_disabled' | 'feature_disabled' | 'bypass_not_resolved' | 'no_exclude_addresses'
}

export interface ParsedDirectRule {
  raw: string
  type: string
  value?: string
  target: string
}

export async function resolveDirectTunBypass<T extends DirectTunBypassConfig>(
  options: ResolveDirectTunBypassOptions<T>
): Promise<DirectTunBypassResolution> {
  const tunEnabled = options.config.tun?.enable === true
  const now = options.now ?? Date.now
  const mode = options.mode ?? 'conservative'

  if (!options.enabled) {
    return createResolution({
      enabled: false,
      mode,
      tunEnabled,
      status: 'disabled',
      warnings: [
        {
          code: 'feature_disabled',
          message: 'DIRECT exclude compatibility is disabled.'
        }
      ],
      now
    })
  }

  if (!tunEnabled) {
    return createResolution({
      enabled: true,
      mode,
      tunEnabled: false,
      status: 'not_required',
      warnings: [
        {
          code: 'tun_disabled',
          message: 'TUN is disabled, so DIRECT exclude injection is not required.'
        }
      ],
      now
    })
  }

  const directRules = parseDirectRules(options.config.rules)
  if (directRules.length === 0) {
    return createResolution({
      enabled: true,
      mode,
      tunEnabled: true,
      status: 'not_required',
      warnings: [
        {
          code: 'no_direct_rules',
          message: 'No DIRECT rules were found for DIRECT exclude compatibility.'
        }
      ],
      now
    })
  }

  const warnings: DirectTunBypassWarning[] = []
  const unsupportedRules: UnsupportedDirectTunBypassRule[] = []
  const routeExcludeAddresses: string[] = []
  const resolvedRules: ResolvedDirectTunBypassRule[] = []
  let supportedRuleCount = 0
  let partialRuleCount = 0
  let failedRuleCount = 0

  for (const rule of directRules) {
    switch (rule.type) {
      case 'IP-CIDR':
      case 'IP-CIDR6': {
        supportedRuleCount += 1
        const cidr = normalizeCidr(rule.value ?? '')
        if (cidr) {
          routeExcludeAddresses.push(cidr)
          resolvedRules.push({
            rule: rule.raw,
            ruleType: rule.type,
            value: rule.value,
            routeExcludeAddresses: [cidr],
            coverage: 'exact_route_exclude'
          })
        } else {
          failedRuleCount += 1
          warnings.push(createRuleWarning('invalid_ip_cidr', rule, 'Invalid IP-CIDR DIRECT rule.'))
        }
        break
      }
      case 'DOMAIN':
      case 'DOMAIN-SUFFIX': {
        supportedRuleCount += 1
        const hostname = normalizeDomainValue(rule.value ?? '')
        if (!hostname || !options.lookup) {
          failedRuleCount += 1
          warnings.push(
            createRuleWarning(
              'domain_resolution_failed',
              rule,
              `Could not resolve ${rule.type} DIRECT rule for DIRECT exclude.`
            )
          )
          break
        }

        if (rule.type === 'DOMAIN-SUFFIX') {
          partialRuleCount += 1
          warnings.push(
            createRuleWarning(
              'domain_suffix_apex_only',
              rule,
              'DOMAIN-SUFFIX DIRECT exclude resolves only the suffix apex; subdomains need explicit DOMAIN or IP-CIDR rules for true bypass.'
            )
          )
        }

        try {
          const results = await options.lookup(hostname)
          const ips = normalizeIpList(results.map((result) => result.address))
          if (ips.length === 0) {
            failedRuleCount += 1
            warnings.push(
              createRuleWarning(
                'domain_resolution_failed',
                rule,
                `No IP addresses were resolved for ${hostname}.`
              )
            )
          } else {
            const ruleRouteExcludeAddresses = ips.map(formatRouteExcludeAddress)
            routeExcludeAddresses.push(...ruleRouteExcludeAddresses)
            resolvedRules.push({
              rule: rule.raw,
              ruleType: rule.type,
              value: rule.value,
              routeExcludeAddresses: ruleRouteExcludeAddresses,
              coverage:
                rule.type === 'DOMAIN-SUFFIX'
                  ? 'partial_resolved_ip_route_exclude'
                  : 'resolved_ip_route_exclude'
            })
            if (rule.type === 'DOMAIN-SUFFIX') {
              warnings.push(
                createRuleWarning(
                  'domain_route_is_ip_based',
                  rule,
                  'DOMAIN-SUFFIX DIRECT exclude is injected as IP route exclusions for the suffix apex only.'
                )
              )
            }
          }
        } catch (error) {
          failedRuleCount += 1
          warnings.push(
            createRuleWarning(
              'domain_resolution_failed',
              rule,
              `Failed to resolve ${hostname}: ${stringifyError(error)}`
            )
          )
        }
        break
      }
      case 'DOMAIN-KEYWORD':
        unsupportedRules.push(
          createUnsupportedRule(
            'domain_keyword_unsupported',
            rule,
            'DOMAIN-KEYWORD DIRECT cannot be safely translated into deterministic TUN route exclusions.'
          )
        )
        break
      case 'PROCESS-NAME':
      case 'PROCESS-NAME-WILDCARD':
      case 'PROCESS-NAME-REGEX':
        unsupportedRules.push(
          createUnsupportedRule(
            'process_name_unsupported',
            rule,
            `${rule.type} DIRECT selects Mihomo DIRECT but cannot exclude a desktop process from TUN at the route layer.`
          )
        )
        break
      case 'PROCESS-PATH':
      case 'PROCESS-PATH-WILDCARD':
      case 'PROCESS-PATH-REGEX':
        unsupportedRules.push(
          createUnsupportedRule(
            'process_path_unsupported',
            rule,
            `${rule.type} DIRECT selects Mihomo DIRECT but cannot be translated into route-exclude-address.`
          )
        )
        break
      default:
        unsupportedRules.push(
          createUnsupportedRule(
            'rule_type_unsupported',
            rule,
            `${rule.type} DIRECT rules are not supported by the DIRECT exclude layer.`
          )
        )
    }
  }

  warnings.push(...unsupportedRules.map(unsupportedToWarning))
  const normalizedRouteExcludeAddresses = normalizeRouteExcludeAddresses(routeExcludeAddresses)
  const normalizedResolvedRules = resolvedRules
    .map((rule) => ({
      ...rule,
      routeExcludeAddresses: normalizeRouteExcludeAddresses(rule.routeExcludeAddresses)
    }))
    .filter((rule) => rule.routeExcludeAddresses.length > 0)
  const hasResolved = normalizedRouteExcludeAddresses.length > 0
  const hasWarnings = warnings.length > 0
  const status: DirectTunBypassStatus = hasResolved
    ? hasWarnings
      ? 'partial'
      : 'resolved'
    : supportedRuleCount > 0 || unsupportedRules.length > 0
      ? 'failed'
      : 'not_required'

  return {
    enabled: true,
    mode,
    tunEnabled: true,
    status,
    directExcludeOverallStatus: mapStatusToOverallStatus(status),
    active: hasResolved,
    directRuleCount: directRules.length,
    excludableRuleCount: supportedRuleCount,
    supportedRuleCount,
    unsupportedRuleCount: unsupportedRules.length,
    partialRuleCount,
    failedRuleCount,
    resolvedAddressCount: normalizedRouteExcludeAddresses.length,
    routeExcludeAddresses: normalizedRouteExcludeAddresses,
    resolvedRules: normalizedResolvedRules,
    warnings,
    unsupportedRules,
    resolvedAt: now()
  }
}

export function injectDirectTunBypass<T extends DirectTunBypassConfig>(
  config: T,
  resolution?: DirectTunBypassResolution
): DirectTunBypassInjectionResult<T> {
  if (!config.tun?.enable) {
    return { config, injected: false, routeExcludeAddresses: [], reason: 'tun_disabled' }
  }
  if (!resolution?.enabled) {
    return { config, injected: false, routeExcludeAddresses: [], reason: 'feature_disabled' }
  }
  if (!resolution.active) {
    return { config, injected: false, routeExcludeAddresses: [], reason: 'bypass_not_resolved' }
  }

  const routeExcludeAddresses = normalizeRouteExcludeAddresses(resolution.routeExcludeAddresses)
  if (routeExcludeAddresses.length === 0) {
    return { config, injected: false, routeExcludeAddresses: [], reason: 'no_exclude_addresses' }
  }

  const existing = Array.isArray(config.tun['route-exclude-address'])
    ? config.tun['route-exclude-address']
    : []
  const merged = normalizeRouteExcludeAddresses([...existing, ...routeExcludeAddresses])

  return {
    config: {
      ...config,
      tun: {
        ...config.tun,
        'route-exclude-address': merged
      }
    } as T,
    injected: true,
    routeExcludeAddresses
  }
}

export function parseDirectRules(rules: unknown[] | undefined): ParsedDirectRule[] {
  if (!Array.isArray(rules)) return []

  return rules
    .map((rule) => (typeof rule === 'string' ? parseRule(rule) : undefined))
    .filter((rule): rule is ParsedDirectRule => Boolean(rule && rule.target === 'DIRECT'))
}

function parseRule(rule: string): ParsedDirectRule | undefined {
  const parts = rule.split(',').map((part) => part.trim())
  if (parts.length < 2 || !parts[0]) return undefined

  const type = normalizeRuleType(parts[0])
  if (type === 'MATCH') {
    return {
      raw: rule,
      type,
      target: normalizeTarget(parts[1])
    }
  }

  if (parts.length < 3) return undefined
  return {
    raw: rule,
    type,
    value: parts[1],
    target: normalizeTarget(parts[2])
  }
}

function normalizeRuleType(type: string): string {
  return type.trim().toUpperCase()
}

function normalizeTarget(target: string): string {
  return target.trim().toUpperCase()
}

function normalizeDomainValue(value: string): string {
  return value.trim().replace(/^\+\./, '').replace(/^\*\./, '').replace(/^\./, '').toLowerCase()
}

function normalizeCidr(value: string): string | undefined {
  const trimmed = value.trim()
  if (isIpv4Cidr(trimmed) || isIpv6Cidr(trimmed)) return trimmed
  const host = normalizeEndpointHost(trimmed)
  if (isIpv4Address(host)) return `${host}/32`
  if (isIpv6Address(host)) return `${host}/128`
  return undefined
}

function isIpv4Cidr(value: string): boolean {
  const [ip, prefix, ...rest] = value.split('/')
  if (rest.length > 0 || !isIpv4Address(ip) || !/^\d{1,2}$/.test(prefix ?? '')) return false
  const prefixNumber = Number(prefix)
  return Number.isInteger(prefixNumber) && prefixNumber >= 0 && prefixNumber <= 32
}

function isIpv6Cidr(value: string): boolean {
  const [ip, prefix, ...rest] = value.split('/')
  if (rest.length > 0 || !isIpv6Address(ip) || !/^\d{1,3}$/.test(prefix ?? '')) return false
  const prefixNumber = Number(prefix)
  return Number.isInteger(prefixNumber) && prefixNumber >= 0 && prefixNumber <= 128
}

function isIpv4Address(value: string): boolean {
  const parts = value.split('.')
  if (parts.length !== 4) return false
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false
    const octet = Number(part)
    return Number.isInteger(octet) && octet >= 0 && octet <= 255
  })
}

function isIpv6Address(value: string): boolean {
  return value.includes(':') && /^[0-9a-fA-F:.]+$/.test(value)
}

function createResolution(input: {
  enabled: boolean
  mode: DirectExcludeMode
  tunEnabled: boolean
  status: DirectTunBypassStatus
  warnings?: DirectTunBypassWarning[]
  now: () => number
}): DirectTunBypassResolution {
  return {
    enabled: input.enabled,
    mode: input.mode,
    tunEnabled: input.tunEnabled,
    status: input.status,
    directExcludeOverallStatus: mapStatusToOverallStatus(input.status),
    active: false,
    directRuleCount: 0,
    excludableRuleCount: 0,
    supportedRuleCount: 0,
    unsupportedRuleCount: 0,
    partialRuleCount: 0,
    failedRuleCount: 0,
    resolvedAddressCount: 0,
    routeExcludeAddresses: [],
    resolvedRules: [],
    warnings: input.warnings ?? [],
    unsupportedRules: [],
    resolvedAt: input.now()
  }
}

function mapStatusToOverallStatus(status: DirectTunBypassStatus): DirectExcludeOverallStatus {
  switch (status) {
    case 'resolved':
      return 'active'
    case 'partial':
      return 'partial'
    case 'failed':
      return 'blocked'
    case 'disabled':
    case 'not_required':
      return 'inactive'
  }
}

function createRuleWarning(
  code: DirectTunBypassWarningCode,
  rule: ParsedDirectRule,
  message: string
): DirectTunBypassWarning {
  return {
    code,
    rule: rule.raw,
    ruleType: rule.type,
    value: rule.value,
    message
  }
}

function createUnsupportedRule(
  reasonCode: DirectTunBypassWarningCode,
  rule: ParsedDirectRule,
  message: string
): UnsupportedDirectTunBypassRule {
  return {
    rule: rule.raw,
    ruleType: rule.type,
    value: rule.value,
    reasonCode,
    message
  }
}

function unsupportedToWarning(rule: UnsupportedDirectTunBypassRule): DirectTunBypassWarning {
  return {
    code: rule.reasonCode,
    rule: rule.rule,
    ruleType: rule.ruleType,
    value: rule.value,
    message: rule.message
  }
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
