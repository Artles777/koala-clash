import {
  formatRouteExcludeAddress,
  normalizeEndpointHost,
  normalizeIpList,
  normalizeRouteExcludeAddresses
} from './route-exclude-utils'
import { DirectTunBypassConfig, parseDirectRules } from './direct-tun-bypass'

export type LearnedProcessBypassConfidence = 'runtime_connection'
export type LearnedProcessBypassStatus =
  | 'inactive'
  | 'observing'
  | 'active'
  | 'stale'
  | 'unsupported'
export type LearnedProcessRuleEffectiveMode =
  | 'true_bypass'
  | 'partial_bypass'
  | 'learned_bypass'
  | 'direct_only'
  | 'unsupported'

export interface LearnedProcessBypassEntry {
  processName: string
  observedIp: string
  observedAt: number
  ttlExpiresAt: number
  sourceConfidence: LearnedProcessBypassConfidence
  platform: string
  active: boolean
  learnedFromRuntime: boolean
  notes?: string
}

export interface LearnedProcessBypassWarning {
  code:
    | 'feature_disabled'
    | 'tun_disabled'
    | 'unsupported_platform'
    | 'no_process_direct_rules'
    | 'no_observed_ips'
    | 'stale_observed_ips'
  message: string
  processName?: string
}

export interface LearnedProcessBypassResolution {
  enabled: boolean
  supportedOnPlatform: boolean
  platform: string
  status: LearnedProcessBypassStatus
  active: boolean
  ruleCount: number
  processCount: number
  entryCount: number
  expiredCount: number
  resolvedAddressCount: number
  routeExcludeAddresses: string[]
  entries: LearnedProcessBypassEntry[]
  warnings: LearnedProcessBypassWarning[]
  ruleModes: Array<{
    rule: string
    processName: string
    effectiveMode: LearnedProcessRuleEffectiveMode
    learnedEntryCount: number
  }>
  resolvedAt: number
}

export interface ResolveLearnedProcessBypassOptions<T extends DirectTunBypassConfig> {
  config: T
  enabled: boolean
  entries: LearnedProcessBypassEntry[]
  platform: string
  supportedPlatforms?: string[]
  now?: () => number
}

export interface LearnedProcessBypassInjectionResult<T extends DirectTunBypassConfig> {
  config: T
  injected: boolean
  routeExcludeAddresses: string[]
  reason?:
    | 'tun_disabled'
    | 'feature_disabled'
    | 'unsupported_platform'
    | 'bypass_not_resolved'
    | 'no_exclude_addresses'
}

const defaultSupportedPlatforms = ['darwin', 'linux', 'win32']

export function resolveLearnedProcessBypass<T extends DirectTunBypassConfig>(
  options: ResolveLearnedProcessBypassOptions<T>
): LearnedProcessBypassResolution {
  const now = options.now ?? Date.now
  const resolvedAt = now()
  const platform = options.platform
  const supportedOnPlatform = (options.supportedPlatforms ?? defaultSupportedPlatforms).includes(
    platform
  )

  if (!options.enabled) {
    return createResolution({
      enabled: false,
      supportedOnPlatform,
      platform,
      status: 'inactive',
      warnings: [
        {
          code: 'feature_disabled',
          message: 'Learned process-to-IP bypass is disabled.'
        }
      ],
      resolvedAt
    })
  }

  if (!supportedOnPlatform) {
    return createResolution({
      enabled: true,
      supportedOnPlatform: false,
      platform,
      status: 'unsupported',
      warnings: [
        {
          code: 'unsupported_platform',
          message: `Learned process-to-IP bypass is not supported on ${platform}.`
        }
      ],
      resolvedAt
    })
  }

  if (!options.config.tun?.enable) {
    return createResolution({
      enabled: true,
      supportedOnPlatform,
      platform,
      status: 'inactive',
      warnings: [
        {
          code: 'tun_disabled',
          message: 'TUN is disabled, so learned process bypass is not required.'
        }
      ],
      resolvedAt
    })
  }

  const processRules = parseDirectRules(options.config.rules).filter(
    (rule) => rule.type === 'PROCESS-NAME' && Boolean(rule.value?.trim())
  )
  if (processRules.length === 0) {
    return createResolution({
      enabled: true,
      supportedOnPlatform,
      platform,
      status: 'inactive',
      warnings: [
        {
          code: 'no_process_direct_rules',
          message: 'No PROCESS-NAME DIRECT rules were found for learned bypass.'
        }
      ],
      resolvedAt
    })
  }

  const processNames = new Set(processRules.map((rule) => normalizeProcessName(rule.value ?? '')))
  const matchingEntries = options.entries
    .filter((entry) => processNames.has(normalizeProcessName(entry.processName)))
    .map((entry) => normalizeEntry(entry, resolvedAt))
    .filter((entry): entry is LearnedProcessBypassEntry => Boolean(entry))
  const activeEntries = matchingEntries.filter((entry) => entry.active)
  const expiredCount = matchingEntries.length - activeEntries.length
  const routeExcludeAddresses = normalizeRouteExcludeAddresses(
    activeEntries.map((entry) => formatRouteExcludeAddress(entry.observedIp))
  )
  const warnings: LearnedProcessBypassWarning[] = []

  if (activeEntries.length === 0 && expiredCount > 0) {
    warnings.push({
      code: 'stale_observed_ips',
      message: 'Observed process destination IPs exist, but all learned entries are expired.'
    })
  } else if (activeEntries.length === 0) {
    warnings.push({
      code: 'no_observed_ips',
      message:
        'PROCESS-NAME DIRECT rules exist, but no destination IPs have been observed for those processes yet.'
    })
  }

  const ruleModes = processRules.map((rule) => {
    const processName = rule.value?.trim() ?? ''
    const learnedEntryCount = activeEntries.filter(
      (entry) => normalizeProcessName(entry.processName) === normalizeProcessName(processName)
    ).length
    return {
      rule: rule.raw,
      processName,
      effectiveMode: learnedEntryCount > 0 ? 'learned_bypass' : 'direct_only',
      learnedEntryCount
    } satisfies LearnedProcessBypassResolution['ruleModes'][number]
  })

  const status: LearnedProcessBypassStatus =
    routeExcludeAddresses.length > 0 ? 'active' : expiredCount > 0 ? 'stale' : 'observing'

  return {
    enabled: true,
    supportedOnPlatform,
    platform,
    status,
    active: routeExcludeAddresses.length > 0,
    ruleCount: processRules.length,
    processCount: new Set(activeEntries.map((entry) => normalizeProcessName(entry.processName)))
      .size,
    entryCount: activeEntries.length,
    expiredCount,
    resolvedAddressCount: routeExcludeAddresses.length,
    routeExcludeAddresses,
    entries: activeEntries,
    warnings,
    ruleModes,
    resolvedAt
  }
}

export function injectLearnedProcessBypass<T extends DirectTunBypassConfig>(
  config: T,
  resolution?: LearnedProcessBypassResolution
): LearnedProcessBypassInjectionResult<T> {
  if (!config.tun?.enable) {
    return { config, injected: false, routeExcludeAddresses: [], reason: 'tun_disabled' }
  }
  if (!resolution?.enabled) {
    return { config, injected: false, routeExcludeAddresses: [], reason: 'feature_disabled' }
  }
  if (!resolution.supportedOnPlatform) {
    return { config, injected: false, routeExcludeAddresses: [], reason: 'unsupported_platform' }
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

function normalizeEntry(
  entry: LearnedProcessBypassEntry,
  now: number
): LearnedProcessBypassEntry | undefined {
  const observedIp = normalizeEndpointHost(entry.observedIp)
  if (!normalizeIpList([observedIp]).length) return undefined
  return {
    ...entry,
    processName: entry.processName.trim(),
    observedIp,
    active: entry.ttlExpiresAt > now
  }
}

function createResolution(input: {
  enabled: boolean
  supportedOnPlatform: boolean
  platform: string
  status: LearnedProcessBypassStatus
  warnings?: LearnedProcessBypassWarning[]
  resolvedAt: number
}): LearnedProcessBypassResolution {
  return {
    enabled: input.enabled,
    supportedOnPlatform: input.supportedOnPlatform,
    platform: input.platform,
    status: input.status,
    active: false,
    ruleCount: 0,
    processCount: 0,
    entryCount: 0,
    expiredCount: 0,
    resolvedAddressCount: 0,
    routeExcludeAddresses: [],
    entries: [],
    warnings: input.warnings ?? [],
    ruleModes: [],
    resolvedAt: input.resolvedAt
  }
}

function normalizeProcessName(value: string): string {
  return value.trim().toLowerCase()
}
