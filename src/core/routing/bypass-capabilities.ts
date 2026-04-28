import type { DirectTunBypassConfig, DirectTunBypassResolution } from './direct-tun-bypass'
import { parseDirectRules, type ParsedDirectRule } from './direct-tun-bypass'
import type {
  LearnedProcessBypassResolution,
  LearnedProcessRuleEffectiveMode
} from './learned-process-bypass'

export type EffectiveBypassMode =
  | 'true_bypass'
  | 'partial_bypass'
  | 'learned_bypass'
  | 'direct_only'
  | 'unsupported'

export type BypassPlatformSupport = 'supported' | 'degraded' | 'unsupported'

export type NativeProcessBypassStatus =
  | 'disabled'
  | 'unsupported'
  | 'available'
  | 'active'
  | 'blocked'

export type NativeProcessBypassMechanism = 'linux-cgroup-fwmark' | 'windows-wfp-service'
export type NativeProcessBypassPlatformMode =
  | 'linux_native'
  | 'windows_wfp_service'
  | 'windows_scaffold'
  | 'macos_fallback_only'
  | 'unsupported'
export type LinuxNativeProcessBypassPrerequisiteStatus =
  | 'supported'
  | 'missing_prerequisites'
  | 'insufficient_privileges'
  | 'not_linux'
  | 'not_windows'
  | 'partially_supported'
  | 'windows_service_missing'
  | 'implementation_pending'
  | 'fallback_only'
export type LinuxNativeProcessBypassIssueCode =
  | 'not_linux'
  | 'not_windows'
  | 'cgroup_v2_missing'
  | 'nft_missing'
  | 'ip_missing'
  | 'insufficient_privileges'
  | 'cgroup_not_writable'
  | 'windows_wfp_service_missing'
  | 'windows_controller_missing'
  | 'windows_admin_required'
  | 'windows_data_plane_pending'
  | 'windows_data_plane_inactive'
  | 'windows_apply_failed'
  | 'windows_cleanup_failed'
  | 'macos_native_bypass_unsupported'
  | 'no_process_names'
  | 'no_matching_processes'
  | 'cgroup_creation_failed'
  | 'nft_apply_failed'
  | 'policy_route_apply_failed'
  | 'process_binding_failed'
  | 'process_reconcile_failed'
  | 'cleanup_failed'

export interface LinuxNativeProcessBypassIssue {
  code: LinuxNativeProcessBypassIssueCode
  message: string
}

export interface NativeProcessBypassCapability {
  enabled: boolean
  platform: string
  supportedOnPlatform: boolean
  active: boolean
  status: NativeProcessBypassStatus
  mechanism?: NativeProcessBypassMechanism
  requiresPrivileges: boolean
  requiresService: boolean
  platformMode?: NativeProcessBypassPlatformMode
  nativeDataPlaneActive?: boolean
  fallbackOnly?: boolean
  fallbackReason?: string
  diagnosticsReason: string
  diagnostics: string[]
  activeProcesses: string[]
  prerequisiteStatus?: LinuxNativeProcessBypassPrerequisiteStatus
  prerequisiteIssues?: LinuxNativeProcessBypassIssue[]
  boundPids?: number[]
  trackedPids?: number[]
  newlyBoundPidCount?: number
  deadPidCleanupCount?: number
  lastReconcileAt?: number
  reconcileActive?: boolean
  reconcileErrors?: string[]
  appliedAt?: number
  windowsServiceAvailable?: boolean
  windowsControllerAvailable?: boolean
  windowsSessionId?: string
  windowsAppliedProcessCount?: number
}

export interface RuleBypassCapability {
  rule: string
  ruleType: string
  value?: string
  target: string
  effectiveBypassMode: EffectiveBypassMode
  platformSupport: BypassPlatformSupport
  requiresPrivileges: boolean
  requiresNativeBypass: boolean
  diagnosticsReason: string
  diagnosticsMessage: string
}

export interface BypassCapabilitySummary {
  trueBypassRuleCount: number
  partialBypassRuleCount: number
  learnedBypassRuleCount: number
  directOnlyRuleCount: number
  unsupportedRuleCount: number
  processDirectRuleCount: number
}

export interface BypassCapabilityReport {
  platform: string
  tunEnabled: boolean
  nativeProcessBypass: NativeProcessBypassCapability
  rules: RuleBypassCapability[]
  summary: BypassCapabilitySummary
  warnings: string[]
  evaluatedAt: number
}

export interface EvaluateBypassCapabilitiesOptions<T extends DirectTunBypassConfig> {
  config: T
  platform: string
  nativeProcessBypass: NativeProcessBypassCapability
  directTunBypass?: DirectTunBypassResolution
  learnedProcessBypass?: LearnedProcessBypassResolution
  now?: () => number
}

export function evaluateBypassCapabilities<T extends DirectTunBypassConfig>(
  options: EvaluateBypassCapabilitiesOptions<T>
): BypassCapabilityReport {
  const now = options.now ?? Date.now
  const tunEnabled = options.config.tun?.enable === true
  const rules = parseDirectRules(options.config.rules).map((rule) =>
    classifyRule(rule, {
      tunEnabled,
      directTunBypass: options.directTunBypass,
      learnedProcessBypass: options.learnedProcessBypass,
      nativeProcessBypass: options.nativeProcessBypass
    })
  )
  const warnings = collectWarnings(rules, options.nativeProcessBypass)

  return {
    platform: options.platform,
    tunEnabled,
    nativeProcessBypass: cloneNativeProcessBypass(options.nativeProcessBypass),
    rules,
    summary: summarizeRules(rules),
    warnings,
    evaluatedAt: now()
  }
}

function classifyRule(
  rule: ParsedDirectRule,
  context: {
    tunEnabled: boolean
    nativeProcessBypass: NativeProcessBypassCapability
    directTunBypass?: DirectTunBypassResolution
    learnedProcessBypass?: LearnedProcessBypassResolution
  }
): RuleBypassCapability {
  if (!context.tunEnabled) {
    return createRuleCapability(rule, {
      effectiveBypassMode: 'direct_only',
      platformSupport: 'supported',
      requiresPrivileges: false,
      requiresNativeBypass: false,
      diagnosticsReason: 'tun_disabled',
      diagnosticsMessage: 'TUN is disabled; DIRECT keeps normal Mihomo behavior.'
    })
  }

  switch (rule.type) {
    case 'IP-CIDR':
    case 'IP-CIDR6':
      return classifyAddressBackedRule(rule, context.directTunBypass)
    case 'DOMAIN':
    case 'DOMAIN-SUFFIX':
      return classifyDomainBackedRule(rule, context.directTunBypass)
    case 'PROCESS-NAME':
      return classifyProcessNameRule(
        rule,
        context.nativeProcessBypass,
        context.learnedProcessBypass
      )
    default:
      return createRuleCapability(rule, {
        effectiveBypassMode: 'unsupported',
        platformSupport: 'unsupported',
        requiresPrivileges: false,
        requiresNativeBypass: false,
        diagnosticsReason: 'rule_type_unsupported',
        diagnosticsMessage: `${rule.type} DIRECT cannot be translated into a TUN bypass capability.`
      })
  }
}

function classifyAddressBackedRule(
  rule: ParsedDirectRule,
  directTunBypass?: DirectTunBypassResolution
): RuleBypassCapability {
  const unsupported = directTunBypass?.unsupportedRules.some((unsupportedRule) =>
    sameRule(unsupportedRule.rule, rule.raw)
  )
  if (unsupported) {
    return createRuleCapability(rule, {
      effectiveBypassMode: 'unsupported',
      platformSupport: 'unsupported',
      requiresPrivileges: false,
      requiresNativeBypass: false,
      diagnosticsReason: 'address_rule_invalid',
      diagnosticsMessage:
        'This DIRECT address rule could not be converted to route-exclude-address.'
    })
  }

  if (directTunBypass?.active) {
    return createRuleCapability(rule, {
      effectiveBypassMode: 'true_bypass',
      platformSupport: 'supported',
      requiresPrivileges: false,
      requiresNativeBypass: false,
      diagnosticsReason: 'address_route_excluded',
      diagnosticsMessage: 'This DIRECT rule is covered by runtime TUN route exclusions.'
    })
  }

  return createRuleCapability(rule, {
    effectiveBypassMode: 'direct_only',
    platformSupport: 'degraded',
    requiresPrivileges: false,
    requiresNativeBypass: false,
    diagnosticsReason: 'address_bypass_not_active',
    diagnosticsMessage:
      'This DIRECT rule is TUN-excludable, but no active runtime route exclusion is present.'
  })
}

function classifyDomainBackedRule(
  rule: ParsedDirectRule,
  directTunBypass?: DirectTunBypassResolution
): RuleBypassCapability {
  const unsupported = directTunBypass?.unsupportedRules.some((unsupportedRule) =>
    sameRule(unsupportedRule.rule, rule.raw)
  )
  if (unsupported) {
    return createRuleCapability(rule, {
      effectiveBypassMode: 'unsupported',
      platformSupport: 'unsupported',
      requiresPrivileges: false,
      requiresNativeBypass: false,
      diagnosticsReason: 'domain_rule_unsupported',
      diagnosticsMessage: 'This DIRECT domain rule is not supported by deterministic TUN excludes.'
    })
  }

  if (directTunBypass?.active && directTunBypass.status === 'partial') {
    return createRuleCapability(rule, {
      effectiveBypassMode: 'partial_bypass',
      platformSupport: 'degraded',
      requiresPrivileges: false,
      requiresNativeBypass: false,
      diagnosticsReason: 'domain_route_excluded_partially',
      diagnosticsMessage:
        'This DIRECT domain rule uses resolved IP route exclusions; coverage may be partial.'
    })
  }

  if (directTunBypass?.active) {
    return createRuleCapability(rule, {
      effectiveBypassMode: 'true_bypass',
      platformSupport: 'supported',
      requiresPrivileges: false,
      requiresNativeBypass: false,
      diagnosticsReason: 'domain_route_excluded',
      diagnosticsMessage: 'This DIRECT domain rule is covered by resolved runtime route exclusions.'
    })
  }

  return createRuleCapability(rule, {
    effectiveBypassMode: 'direct_only',
    platformSupport: 'degraded',
    requiresPrivileges: false,
    requiresNativeBypass: false,
    diagnosticsReason: 'domain_bypass_not_resolved',
    diagnosticsMessage:
      'This DIRECT domain rule has not been resolved into active TUN route exclusions.'
  })
}

function classifyProcessNameRule(
  rule: ParsedDirectRule,
  nativeProcessBypass: NativeProcessBypassCapability,
  learnedProcessBypass?: LearnedProcessBypassResolution
): RuleBypassCapability {
  const processName = rule.value ?? ''
  if (
    nativeProcessBypass.active &&
    nativeProcessBypass.activeProcesses.some((active) => sameProcessName(active, processName))
  ) {
    return createRuleCapability(rule, {
      effectiveBypassMode: 'true_bypass',
      platformSupport: 'supported',
      requiresPrivileges: true,
      requiresNativeBypass: true,
      diagnosticsReason: 'native_process_bypass_active',
      diagnosticsMessage: 'This PROCESS-NAME DIRECT rule is covered by native process bypass.'
    })
  }

  const learnedMode = findLearnedProcessMode(processName, learnedProcessBypass)
  if (learnedMode === 'learned_bypass') {
    return createRuleCapability(rule, {
      effectiveBypassMode: 'learned_bypass',
      platformSupport: nativeProcessBypass.supportedOnPlatform ? 'degraded' : 'unsupported',
      requiresPrivileges: false,
      requiresNativeBypass: false,
      diagnosticsReason: nativeProcessBypass.supportedOnPlatform
        ? 'native_unavailable_fell_back_to_learned'
        : 'native_unsupported_fell_back_to_learned',
      diagnosticsMessage:
        'This PROCESS-NAME DIRECT rule uses learned destination IPs as a best-effort TUN exclusion.'
    })
  }

  return createRuleCapability(rule, {
    effectiveBypassMode: 'direct_only',
    platformSupport: nativeProcessBypass.supportedOnPlatform ? 'degraded' : 'unsupported',
    requiresPrivileges: nativeProcessBypass.requiresPrivileges,
    requiresNativeBypass: true,
    diagnosticsReason: nativeProcessBypass.supportedOnPlatform
      ? 'native_process_bypass_not_active'
      : 'native_process_bypass_unsupported',
    diagnosticsMessage: nativeProcessBypass.supportedOnPlatform
      ? 'Native process bypass is not active and no learned destination IPs are available.'
      : 'Native process bypass is not supported on this platform; learned bypass may still observe IPs.'
  })
}

function findLearnedProcessMode(
  processName: string,
  learnedProcessBypass?: LearnedProcessBypassResolution
): LearnedProcessRuleEffectiveMode | undefined {
  return learnedProcessBypass?.ruleModes.find((mode) =>
    sameProcessName(mode.processName, processName)
  )?.effectiveMode
}

function createRuleCapability(
  rule: ParsedDirectRule,
  capability: Omit<RuleBypassCapability, 'rule' | 'ruleType' | 'value' | 'target'>
): RuleBypassCapability {
  return {
    rule: rule.raw,
    ruleType: rule.type,
    value: rule.value,
    target: rule.target,
    ...capability
  }
}

function summarizeRules(rules: RuleBypassCapability[]): BypassCapabilitySummary {
  return {
    trueBypassRuleCount: countRules(rules, 'true_bypass'),
    partialBypassRuleCount: countRules(rules, 'partial_bypass'),
    learnedBypassRuleCount: countRules(rules, 'learned_bypass'),
    directOnlyRuleCount: countRules(rules, 'direct_only'),
    unsupportedRuleCount: countRules(rules, 'unsupported'),
    processDirectRuleCount: rules.filter((rule) => rule.ruleType === 'PROCESS-NAME').length
  }
}

function collectWarnings(
  rules: RuleBypassCapability[],
  nativeProcessBypass: NativeProcessBypassCapability
): string[] {
  const warnings = new Set<string>()
  if (!nativeProcessBypass.supportedOnPlatform) {
    warnings.add('Native process bypass is not supported on this platform.')
  } else if (!nativeProcessBypass.active && nativeProcessBypass.enabled) {
    warnings.add('Native process bypass is enabled but not active yet.')
  }

  for (const rule of rules) {
    if (rule.effectiveBypassMode === 'direct_only' && rule.ruleType === 'PROCESS-NAME') {
      warnings.add('Some PROCESS-NAME DIRECT rules remain plain Mihomo DIRECT only.')
    }
    if (rule.effectiveBypassMode === 'learned_bypass') {
      warnings.add('Some PROCESS-NAME DIRECT rules use learned IPs, not true native bypass.')
    }
  }
  return [...warnings]
}

function countRules(rules: RuleBypassCapability[], mode: EffectiveBypassMode): number {
  return rules.filter((rule) => rule.effectiveBypassMode === mode).length
}

function cloneNativeProcessBypass(
  capability: NativeProcessBypassCapability
): NativeProcessBypassCapability {
  return {
    ...capability,
    diagnostics: [...capability.diagnostics],
    activeProcesses: [...capability.activeProcesses],
    prerequisiteIssues: capability.prerequisiteIssues?.map((issue) => ({ ...issue })),
    boundPids: capability.boundPids ? [...capability.boundPids] : undefined,
    trackedPids: capability.trackedPids ? [...capability.trackedPids] : undefined,
    reconcileErrors: capability.reconcileErrors ? [...capability.reconcileErrors] : undefined
  }
}

function sameRule(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}

function sameProcessName(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}
