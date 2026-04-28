import {
  formatRouteExcludeAddress,
  normalizeEndpointHost,
  normalizeIpList,
  normalizeRouteExcludeAddresses
} from './amnezia-helper-tun-bypass'

export type DirectTunBypassStatus = 'disabled' | 'not_required' | 'resolved' | 'partial' | 'failed'

export type DirectTunBypassWarningCode =
  | 'feature_disabled'
  | 'tun_disabled'
  | 'no_direct_rules'
  | 'domain_resolution_failed'
  | 'domain_suffix_apex_only'
  | 'domain_route_is_ip_based'
  | 'domain_keyword_unsupported'
  | 'process_name_preset_applied'
  | 'process_name_unsupported'
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

export interface DirectTunBypassResolution {
  enabled: boolean
  tunEnabled: boolean
  status: DirectTunBypassStatus
  active: boolean
  directRuleCount: number
  supportedRuleCount: number
  unsupportedRuleCount: number
  resolvedAddressCount: number
  routeExcludeAddresses: string[]
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

export interface DirectProcessTunBypassPreset {
  id: string
  processNames: string[]
  routeExcludeAddresses: string[]
}

export const TELEGRAM_DIRECT_TUN_BYPASS_PRESET: DirectProcessTunBypassPreset = {
  id: 'telegram',
  processNames: ['telegram', 'telegram desktop'],
  routeExcludeAddresses: [
    '91.105.192.0/23',
    '91.108.4.0/22',
    '91.108.8.0/21',
    '91.108.16.0/21',
    '91.108.56.0/22',
    '95.161.64.0/20',
    '149.154.160.0/20',
    '185.76.151.0/24',
    '2001:67c:4e8::/48',
    '2001:b28:f23c::/47',
    '2001:b28:f23f::/48',
    '2a0a:f280:203::/48'
  ]
}

export const DIRECT_PROCESS_TUN_BYPASS_PRESETS: DirectProcessTunBypassPreset[] = [
  TELEGRAM_DIRECT_TUN_BYPASS_PRESET
]

export async function resolveDirectTunBypass<T extends DirectTunBypassConfig>(
  options: ResolveDirectTunBypassOptions<T>
): Promise<DirectTunBypassResolution> {
  const tunEnabled = options.config.tun?.enable === true
  const now = options.now ?? Date.now

  if (!options.enabled) {
    return createResolution({
      enabled: false,
      tunEnabled,
      status: 'disabled',
      warnings: [
        {
          code: 'feature_disabled',
          message: 'DIRECT rule TUN bypass compatibility is disabled.'
        }
      ],
      now
    })
  }

  if (!tunEnabled) {
    return createResolution({
      enabled: true,
      tunEnabled: false,
      status: 'not_required',
      warnings: [
        {
          code: 'tun_disabled',
          message: 'TUN is disabled, so DIRECT rule bypass injection is not required.'
        }
      ],
      now
    })
  }

  const directRules = parseDirectRules(options.config.rules)
  if (directRules.length === 0) {
    return createResolution({
      enabled: true,
      tunEnabled: true,
      status: 'not_required',
      warnings: [
        {
          code: 'no_direct_rules',
          message: 'No DIRECT rules were found for TUN bypass compatibility.'
        }
      ],
      now
    })
  }

  const warnings: DirectTunBypassWarning[] = []
  const unsupportedRules: UnsupportedDirectTunBypassRule[] = []
  const routeExcludeAddresses: string[] = []
  let supportedRuleCount = 0

  for (const rule of directRules) {
    switch (rule.type) {
      case 'IP-CIDR': {
        supportedRuleCount += 1
        const cidr = normalizeCidr(rule.value ?? '')
        if (cidr) {
          routeExcludeAddresses.push(cidr)
        } else {
          warnings.push(createRuleWarning('invalid_ip_cidr', rule, 'Invalid IP-CIDR DIRECT rule.'))
        }
        break
      }
      case 'DOMAIN':
      case 'DOMAIN-SUFFIX': {
        supportedRuleCount += 1
        const hostname = normalizeDomainValue(rule.value ?? '')
        if (!hostname || !options.lookup) {
          warnings.push(
            createRuleWarning(
              'domain_resolution_failed',
              rule,
              `Could not resolve ${rule.type} DIRECT rule for TUN bypass.`
            )
          )
          break
        }

        if (rule.type === 'DOMAIN-SUFFIX') {
          warnings.push(
            createRuleWarning(
              'domain_suffix_apex_only',
              rule,
              'DOMAIN-SUFFIX DIRECT bypass resolves only the suffix apex; subdomains may need explicit DOMAIN or IP-CIDR rules.'
            )
          )
        }

        try {
          const results = await options.lookup(hostname)
          const ips = normalizeIpList(results.map((result) => result.address))
          if (ips.length === 0) {
            warnings.push(
              createRuleWarning(
                'domain_resolution_failed',
                rule,
                `No IP addresses were resolved for ${hostname}.`
              )
            )
          } else {
            routeExcludeAddresses.push(...ips.map(formatRouteExcludeAddress))
            warnings.push(
              createRuleWarning(
                'domain_route_is_ip_based',
                rule,
                'Domain DIRECT bypass is injected as IP route exclusions and may affect other hosts sharing the same resolved IPs.'
              )
            )
          }
        } catch (error) {
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
            'DOMAIN-KEYWORD cannot be safely translated into deterministic TUN route exclusions.'
          )
        )
        break
      case 'PROCESS-NAME':
        {
          const preset = findProcessTunBypassPreset(rule.value ?? '')
          if (preset) {
            supportedRuleCount += 1
            routeExcludeAddresses.push(...preset.routeExcludeAddresses)
            warnings.push(
              createRuleWarning(
                'process_name_preset_applied',
                rule,
                `PROCESS-NAME DIRECT uses the built-in ${preset.id} TUN bypass preset. This excludes known service IP ranges, not the process itself.`
              )
            )
            break
          }

          unsupportedRules.push(
            createUnsupportedRule(
              'process_name_unsupported',
              rule,
              'PROCESS-NAME DIRECT selects Mihomo DIRECT but cannot exclude the process from TUN routing without a known address preset.'
            )
          )
        }
        break
      case 'PROCESS-NAME-REGEX':
        unsupportedRules.push(
          createUnsupportedRule(
            'process_name_unsupported',
            rule,
            'PROCESS-NAME-REGEX DIRECT selects Mihomo DIRECT but cannot be translated into deterministic TUN route exclusions.'
          )
        )
        break
      default:
        unsupportedRules.push(
          createUnsupportedRule(
            'rule_type_unsupported',
            rule,
            `${rule.type} DIRECT rules are not supported by the TUN bypass compatibility layer.`
          )
        )
    }
  }

  warnings.push(...unsupportedRules.map(unsupportedToWarning))
  const normalizedRouteExcludeAddresses = normalizeRouteExcludeAddresses(routeExcludeAddresses)
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
    tunEnabled: true,
    status,
    active: hasResolved,
    directRuleCount: directRules.length,
    supportedRuleCount,
    unsupportedRuleCount: unsupportedRules.length,
    resolvedAddressCount: normalizedRouteExcludeAddresses.length,
    routeExcludeAddresses: normalizedRouteExcludeAddresses,
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

function findProcessTunBypassPreset(value: string): DirectProcessTunBypassPreset | undefined {
  const normalized = normalizeProcessName(value)
  if (!normalized) return undefined
  return DIRECT_PROCESS_TUN_BYPASS_PRESETS.find((preset) =>
    preset.processNames.some((processName) => normalizeProcessName(processName) === normalized)
  )
}

function normalizeProcessName(value: string): string {
  return value.trim().toLowerCase()
}

function normalizeDomainValue(value: string): string {
  return value
    .trim()
    .replace(/^\+\./, '')
    .replace(/^\*\./, '')
    .replace(/^\./, '')
    .toLowerCase()
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
  tunEnabled: boolean
  status: DirectTunBypassStatus
  warnings?: DirectTunBypassWarning[]
  now: () => number
}): DirectTunBypassResolution {
  return {
    enabled: input.enabled,
    tunEnabled: input.tunEnabled,
    status: input.status,
    active: false,
    directRuleCount: 0,
    supportedRuleCount: 0,
    unsupportedRuleCount: 0,
    resolvedAddressCount: 0,
    routeExcludeAddresses: [],
    warnings: input.warnings ?? [],
    unsupportedRules: [],
    resolvedAt: input.now()
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
