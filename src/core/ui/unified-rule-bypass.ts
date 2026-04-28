import type {
  EffectiveBypassMode,
  NativeProcessBypassPlatformMode
} from '../routing/bypass-capabilities'
import type { UnifiedRuleItem } from './unified-ui'

export type UnifiedRuleBypassUiMode = EffectiveBypassMode | 'fallback_only'
export type UnifiedRuleBypassTone = 'info' | 'warning' | 'danger' | 'neutral'

export interface UnifiedRuleBypassContext {
  platform?: string
  tunEnabled?: boolean
  directTunBypassActive?: boolean
  directTunBypassStatus?: 'disabled' | 'not_required' | 'resolved' | 'partial' | 'failed'
  directExcludeOverallStatus?: 'active' | 'partial' | 'blocked' | 'inactive'
  learnedBypassActive?: boolean
  learnedBypassOverallStatus?: 'inactive' | 'observing' | 'active' | 'stale' | 'unsupported'
  learnedBypassEntryCount?: number
  nativeProcessBypassActive?: boolean
  nativeProcessBypassPlatformMode?: NativeProcessBypassPlatformMode
  nativeProcessBypassNativeDataPlaneActive?: boolean
  nativeProcessBypassFallbackOnly?: boolean
  nativeProcessBypassWindowsServiceAvailable?: boolean
  nativeProcessBypassWindowsControllerAvailable?: boolean
  nativeProcessBypassMacosControllerAvailable?: boolean
  nativeProcessBypassMacosUserApprovalRequired?: boolean
  processDirectEffectiveBypassMode?: EffectiveBypassMode
}

export interface UnifiedRuleBypassPresentation {
  mode: UnifiedRuleBypassUiMode
  labelKey: string
  hintKey: string
  tone: UnifiedRuleBypassTone
  reasonCode: string
}

type RuleBypassInput = Pick<UnifiedRuleItem, 'type' | 'target'>

export function getUnifiedRuleBypassPresentation(
  rule: RuleBypassInput,
  context: UnifiedRuleBypassContext
): UnifiedRuleBypassPresentation | undefined {
  if (rule.target !== 'DIRECT') return undefined

  const ruleType = rule.type.trim().toUpperCase()
  if (context.tunEnabled !== true) {
    return createBypassPresentation('direct_only', 'direct_tun_disabled')
  }

  switch (ruleType) {
    case 'IP-CIDR':
    case 'IP-CIDR6':
      return getAddressRulePresentation(context, 'address')
    case 'DOMAIN':
      return getAddressRulePresentation(context, 'domain')
    case 'DOMAIN-SUFFIX':
      return getDomainSuffixPresentation(context)
    case 'PROCESS-NAME':
      return getProcessNamePresentation(context)
    case 'DOMAIN-KEYWORD':
      return createBypassPresentation('unsupported', 'domain_keyword_unsupported')
    default:
      return createBypassPresentation('unsupported', 'rule_type_unsupported')
  }
}

function getAddressRulePresentation(
  context: UnifiedRuleBypassContext,
  kind: 'address' | 'domain'
): UnifiedRuleBypassPresentation {
  if (context.directTunBypassActive && kind === 'address') {
    return createBypassPresentation('true_bypass', 'address_excluded')
  }

  if (context.directTunBypassActive && context.directExcludeOverallStatus === 'active') {
    return createBypassPresentation('true_bypass', 'domain_resolved_excluded')
  }

  if (
    context.directTunBypassActive &&
    (context.directTunBypassStatus === 'partial' ||
      context.directExcludeOverallStatus === 'partial')
  ) {
    return createBypassPresentation('partial_bypass', 'domain_partial')
  }

  if (
    context.directTunBypassStatus === 'failed' ||
    context.directExcludeOverallStatus === 'blocked'
  ) {
    return createBypassPresentation(
      'direct_only',
      kind === 'address' ? 'address_blocked' : 'domain_unresolved'
    )
  }

  return createBypassPresentation(
    'direct_only',
    kind === 'address' ? 'address_not_active' : 'domain_not_resolved'
  )
}

function getDomainSuffixPresentation(
  context: UnifiedRuleBypassContext
): UnifiedRuleBypassPresentation {
  if (context.directTunBypassActive) {
    return createBypassPresentation('partial_bypass', 'domain_suffix_partial')
  }

  if (
    context.directTunBypassStatus === 'failed' ||
    context.directExcludeOverallStatus === 'blocked'
  ) {
    return createBypassPresentation('direct_only', 'domain_suffix_unresolved')
  }

  return createBypassPresentation('direct_only', 'domain_suffix_not_resolved')
}

function getProcessNamePresentation(
  context: UnifiedRuleBypassContext
): UnifiedRuleBypassPresentation {
  if (
    context.processDirectEffectiveBypassMode === 'true_bypass' ||
    (context.nativeProcessBypassActive && context.nativeProcessBypassNativeDataPlaneActive)
  ) {
    return createBypassPresentation('true_bypass', getNativeProcessReason(context))
  }

  if (
    context.processDirectEffectiveBypassMode === 'learned_bypass' ||
    context.learnedBypassActive ||
    context.learnedBypassOverallStatus === 'active'
  ) {
    return createBypassPresentation('learned_bypass', 'process_learned_active')
  }

  if (context.learnedBypassOverallStatus === 'observing') {
    return createBypassPresentation('direct_only', 'process_learned_observing')
  }

  if (context.learnedBypassOverallStatus === 'stale') {
    return createBypassPresentation('direct_only', 'process_learned_stale')
  }

  if (isMacosMode(context.nativeProcessBypassPlatformMode)) {
    return createBypassPresentation('fallback_only', 'process_macos_fallback')
  }

  if (isWindowsMode(context.nativeProcessBypassPlatformMode)) {
    return createBypassPresentation('fallback_only', getWindowsProcessReason(context))
  }

  if (context.nativeProcessBypassPlatformMode === 'linux_native') {
    return createBypassPresentation('direct_only', 'process_linux_native_inactive')
  }

  return createBypassPresentation('direct_only', 'process_no_observed_ips')
}

function getNativeProcessReason(context: UnifiedRuleBypassContext): string {
  if (context.nativeProcessBypassPlatformMode === 'linux_native')
    return 'process_linux_native_active'
  if (isWindowsMode(context.nativeProcessBypassPlatformMode)) return 'process_windows_native_active'
  if (isMacosMode(context.nativeProcessBypassPlatformMode)) return 'process_macos_native_active'
  return 'process_native_active'
}

function getWindowsProcessReason(context: UnifiedRuleBypassContext): string {
  if (!context.nativeProcessBypassWindowsControllerAvailable) {
    return 'process_windows_controller_missing'
  }
  if (!context.nativeProcessBypassWindowsServiceAvailable) {
    return 'process_windows_service_missing'
  }
  return 'process_windows_dataplane_inactive'
}

function isWindowsMode(mode: NativeProcessBypassPlatformMode | undefined): boolean {
  return mode === 'windows_wfp_service' || mode === 'windows_scaffold'
}

function isMacosMode(mode: NativeProcessBypassPlatformMode | undefined): boolean {
  return mode === 'macos_transparent_proxy' || mode === 'macos_fallback_only'
}

export function getUnifiedRuleBypassLabelKey(mode: UnifiedRuleBypassUiMode): string {
  switch (mode) {
    case 'true_bypass':
      return 'pages.rules.bypassTrue'
    case 'partial_bypass':
      return 'pages.rules.bypassPartial'
    case 'learned_bypass':
      return 'pages.rules.bypassLearned'
    case 'direct_only':
      return 'pages.rules.bypassDirectOnly'
    case 'fallback_only':
      return 'pages.rules.bypassFallbackOnly'
    case 'unsupported':
      return 'pages.rules.bypassUnsupported'
  }
}

function createBypassPresentation(
  mode: UnifiedRuleBypassUiMode,
  reasonCode: string
): UnifiedRuleBypassPresentation {
  return {
    mode,
    labelKey: getUnifiedRuleBypassLabelKey(mode),
    hintKey: getUnifiedRuleBypassHintKey(reasonCode),
    tone: getUnifiedRuleBypassTone(mode, reasonCode),
    reasonCode
  }
}

function getUnifiedRuleBypassHintKey(reasonCode: string): string {
  switch (reasonCode) {
    case 'direct_tun_disabled':
      return 'pages.rules.bypassHintTunDisabled'
    case 'address_excluded':
      return 'pages.rules.bypassHintAddressExcluded'
    case 'address_partial':
      return 'pages.rules.bypassHintAddressPartial'
    case 'address_blocked':
      return 'pages.rules.bypassHintAddressBlocked'
    case 'address_not_active':
      return 'pages.rules.bypassHintAddressNotActive'
    case 'domain_resolved_excluded':
      return 'pages.rules.bypassHintDomainExcluded'
    case 'domain_partial':
      return 'pages.rules.bypassHintDomainPartial'
    case 'domain_unresolved':
      return 'pages.rules.bypassHintDomainUnresolved'
    case 'domain_not_resolved':
      return 'pages.rules.bypassHintDomainNotResolved'
    case 'domain_suffix_partial':
      return 'pages.rules.bypassHintDomainSuffixPartial'
    case 'domain_suffix_unresolved':
      return 'pages.rules.bypassHintDomainSuffixUnresolved'
    case 'domain_suffix_not_resolved':
      return 'pages.rules.bypassHintDomainSuffixNotResolved'
    case 'domain_keyword_unsupported':
      return 'pages.rules.bypassHintDomainKeywordUnsupported'
    case 'process_linux_native_active':
      return 'pages.rules.bypassHintProcessLinuxActive'
    case 'process_windows_native_active':
      return 'pages.rules.bypassHintProcessWindowsActive'
    case 'process_macos_native_active':
      return 'pages.rules.bypassHintProcessMacosActive'
    case 'process_native_active':
      return 'pages.rules.bypassHintProcessNativeActive'
    case 'process_learned_active':
      return 'pages.rules.bypassHintProcessLearnedActive'
    case 'process_learned_observing':
      return 'pages.rules.bypassHintProcessLearnedObserving'
    case 'process_learned_stale':
      return 'pages.rules.bypassHintProcessLearnedStale'
    case 'process_macos_fallback':
      return 'pages.rules.bypassHintProcessMacosFallback'
    case 'process_windows_controller_missing':
      return 'pages.rules.bypassHintProcessWindowsControllerMissing'
    case 'process_windows_service_missing':
      return 'pages.rules.bypassHintProcessWindowsServiceMissing'
    case 'process_windows_dataplane_inactive':
      return 'pages.rules.bypassHintProcessWindowsDataplaneInactive'
    case 'process_linux_native_inactive':
      return 'pages.rules.bypassHintProcessLinuxInactive'
    case 'process_no_observed_ips':
      return 'pages.rules.bypassHintProcessNoObservedIps'
    default:
      return 'pages.rules.bypassHintUnsupported'
  }
}

function getUnifiedRuleBypassTone(
  mode: UnifiedRuleBypassUiMode,
  reasonCode: string
): UnifiedRuleBypassTone {
  switch (mode) {
    case 'true_bypass':
      return 'info'
    case 'partial_bypass':
    case 'learned_bypass':
    case 'fallback_only':
      return 'warning'
    case 'direct_only':
      if (
        reasonCode.startsWith('process_') ||
        reasonCode.endsWith('_blocked') ||
        reasonCode.endsWith('_unresolved') ||
        reasonCode.endsWith('_not_resolved')
      ) {
        return 'warning'
      }
      return 'neutral'
    case 'unsupported':
      return 'danger'
  }
}
