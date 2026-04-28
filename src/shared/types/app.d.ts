interface AppVersion {
  version: string
  changelog: string
}

interface ISysProxyConfig {
  enable: boolean
  host?: string
  mode?: SysProxyMode
  bypass?: string[]
  pacScript?: string
  settingMode?: 'exec' | 'service'
}

interface IHost {
  domain: string
  value: string | string[]
}

interface AppConfig {
  core: 'mihomo' | 'mihomo-alpha' | 'system'
  systemCorePath?: string
  corePermissionMode?: 'elevated' | 'service'
  serviceAuthKey?: string
  disableLoopbackDetector: boolean
  disableEmbedCA: boolean
  disableSystemCA: boolean
  disableNftables: boolean
  safePaths: string[]
  proxyDisplayOrder: 'default' | 'delay' | 'name'
  proxyDisplayLayout: 'hidden' | 'single' | 'double'
  groupDisplayLayout: 'hidden' | 'single' | 'double'
  profileDisplayDate?: 'expire' | 'update'
  envType?: ('bash' | 'cmd' | 'powershell' | 'nushell')[]
  proxyCols: 'auto' | '1' | '2' | '3' | '4'
  connectionDirection: 'asc' | 'desc'
  connectionOrderBy: 'time' | 'upload' | 'download' | 'uploadSpeed' | 'downloadSpeed' | 'process'
  connectionListMode?: 'classic' | 'process'
  connectionViewMode?: 'list' | 'table'
  connectionTableColumns?: string[]
  connectionTableColumnWidths?: Record<string, number>
  connectionTableSortColumn?: string
  connectionTableSortDirection?: 'asc' | 'desc'
  connectionInterval?: number
  spinFloatingIcon?: boolean
  disableTray?: boolean
  showFloatingWindow?: boolean
  connectionCardStatus?: CardStatus
  dnsCardStatus?: CardStatus
  logCardStatus?: CardStatus
  pauseSSID?: string[]
  mihomoCoreCardStatus?: CardStatus
  profileCardStatus?: CardStatus
  proxyCardStatus?: CardStatus
  resourceCardStatus?: CardStatus
  ruleCardStatus?: CardStatus
  sniffCardStatus?: CardStatus
  sysproxyCardStatus?: CardStatus
  tunCardStatus?: CardStatus
  homeCardStatus?: CardStatus
  autoLightweight?: boolean
  autoLightweightDelay?: number
  autoLightweightMode?: 'core' | 'tray'
  mihomoCpuPriority?: Priority
  diffWorkDir?: boolean
  autoSetDNSMode?: 'none' | 'exec' | 'service'
  originDNS?: string
  useWindowFrame: boolean
  proxyInTray: boolean
  appTheme: AppTheme
  customTheme?: string
  autoCheckUpdate: boolean
  silentStart: boolean
  autoCloseConnection: boolean
  expandProxyGroups?: boolean
  sysProxy: ISysProxyConfig
  proxyMode: boolean
  directExcludeEnabled?: boolean
  directExcludeMode?: 'conservative' | 'full_supported_types'
  directRulesBypassTun?: boolean
  learnedProcessBypassEnabled?: boolean
  learnedProcessBypassTtlMs?: number
  nativeProcessBypassEnabled?: boolean
  maxLogDays: number
  userAgent?: string
  delayTestConcurrency?: number
  delayTestUrl?: string
  delayTestTimeout?: number
  encryptedPassword?: number[]
  controlDns?: boolean
  controlSniff?: boolean
  controlTun?: boolean
  useDockIcon?: boolean
  useCustomTrayMenu?: boolean
  hosts: IHost[]
  showWindowShortcut?: string
  showFloatingWindowShortcut?: string
  triggerSysProxyShortcut?: string
  triggerTunShortcut?: string
  ruleModeShortcut?: string
  globalModeShortcut?: string
  directModeShortcut?: string
  restartAppShortcut?: string
  quitWithoutCoreShortcut?: string
  onlyActiveDevice?: boolean
  networkDetection?: boolean
  networkDetectionBypass?: string[]
  networkDetectionInterval?: number
  displayIcon?: boolean
  displayAppName?: boolean
  disableGPU: boolean
  mainSwitchMode?: 'tun' | 'sysproxy'
  useHotReloadProfile?: boolean
}

interface ProfileConfig {
  current?: string
  items: ProfileItem[]
}

type ProfileKind = 'mihomo' | 'amnezia'
type ProfileSourceType = 'remote_url' | 'local_file' | 'amnezia_vpn_uri' | 'unknown'
type ProfileRuntimeSupport =
  | 'none'
  | 'planned'
  | 'available'
  | 'translatable'
  | 'requires_helper'
  | 'prototype_available'
type ProfileValidityStatus = 'valid' | 'invalid' | 'partial'
type ProfileExecutionStatus =
  | 'not_supported'
  | 'ready_for_runtime'
  | 'error'
  | 'requires_helper'
  | 'dry_run_available'
type ProfileRuntimeType = 'mihomo' | 'amnezia'
type ProfileExecutionKind = 'mihomo-native' | 'external-helper' | 'unsupported'
type DesktopRuntimePlatform = 'win32' | 'linux' | 'darwin'
type RuntimePlanStatus = 'ready' | 'dry_run' | 'unsupported'
type RuntimeAdapterId = 'mihomo-core' | 'amnezia-desktop-helper' | 'unsupported'
type AmneziaHelperBackendMode = 'production' | 'proxy-prototype' | 'stub'
type AmneziaHelperReadinessStatus = 'unknown' | 'checking' | 'ready' | 'failed'
type AmneziaHelperConfigStatus = 'not_generated' | 'generated' | 'failed'
type AmneziaHelperConnectivityStatus = 'unknown' | 'checking' | 'verified' | 'failed'
type AmneziaHelperValidationStage =
  | 'not_started'
  | 'tcp_connect'
  | 'socks5_handshake'
  | 'upstream_request'
type AmneziaHelperDiagnosticCategory =
  | 'backend_unavailable'
  | 'backend_permission_denied'
  | 'backend_not_executable'
  | 'backend_spawn_failure'
  | 'unsupported_platform'
  | 'unsupported_arch'
  | 'backend_arch_mismatch'
  | 'config_generation_failure'
  | 'tun_bypass_resolution_failure'
  | 'startup_timeout'
  | 'endpoint_unreachable'
  | 'proxy_handshake_failure'
  | 'upstream_request_failure'
  | 'validation_timeout'
type AmneziaHelperRoutingTargetStatus = 'not_injected' | 'injected' | 'unavailable'
type AmneziaHelperTunBypassResolutionStatus = 'not_required' | 'resolved' | 'failed'
type AmneziaHelperUdpSupport = 'supported' | 'unsupported' | 'unknown'
type AmneziaHelperUdpReasonCode =
  | 'udp_associate_validated'
  | 'udp_associate_rejected'
  | 'udp_validation_failed'
  | 'udp_validation_timeout'
  | 'udp_not_validated'
  | 'proxy_endpoint_not_ready'
  | 'backend_capability_unknown'
  | 'stub_backend'
type AmneziaHelperRoutingDiagnosticReason =
  | 'invalid_input'
  | 'no_rule_match'
  | 'helper_not_injected'
  | 'helper_not_ready'
  | 'helper_rule_match'
type AmneziaHelperRoutingUnavailableReason =
  | 'helper_not_ready'
  | 'helper_stopped'
  | 'helper_failed'
  | 'missing_endpoint'
  | 'name_conflict'
  | 'stub_backend'
type AmneziaHelperRuleType =
  | 'DOMAIN'
  | 'DOMAIN-SUFFIX'
  | 'DOMAIN-KEYWORD'
  | 'IP-CIDR'
  | 'PROCESS-NAME'
type AmneziaHelperRuleBulkIssueCode =
  | 'empty_value'
  | 'invalid_value'
  | 'duplicate_input'
  | 'duplicate_existing'
  | 'invalid_type'
  | 'pack_not_found'
  | 'invalid_pack'
  | 'invalid_format'

interface AmneziaHelperRoutingDiagnosticInput {
  value?: string
  host?: string
  domain?: string
  url?: string
  ip?: string
}

interface AmneziaHelperRoutingDiagnosticResult {
  input: {
    raw: string
    host?: string
    domain?: string
    ip?: string
  }
  matched: boolean
  matchedRuleId?: string
  matchedRuleType?: AmneziaHelperRuleType
  matchedRuleValue?: string
  helperInjected: boolean
  helperReady: boolean
  resultingTarget?: {
    groupName: string
    outboundName: string
    endpoint?: {
      host: string
      port: number
      protocol: 'socks5'
    }
  }
  reasonCode: AmneziaHelperRoutingDiagnosticReason
  explanation: string
}

interface AmneziaHelperRuntimeDiagnostic {
  category: AmneziaHelperDiagnosticCategory
  stage: string
  message: string
  at: number
  details?: Record<string, string | number | boolean>
}

type AmneziaHelperStartupPreflightStatus = 'ok' | 'warning' | 'blocked' | 'unknown'
type AmneziaHelperStartupPreflightTunBypassStatus =
  | 'not_required'
  | 'resolved'
  | 'failed'
  | 'unknown'
type AmneziaHelperStartupPreflightReasonCode =
  | 'helper_binary_missing'
  | 'helper_binary_not_executable'
  | 'helper_binary_permission_denied'
  | 'unsupported_platform'
  | 'unsupported_arch'
  | 'helper_binary_platform_mismatch'
  | 'helper_binary_arch_mismatch'
  | 'backend_unavailable'
  | 'missing_execution_plan'
  | 'missing_helper_descriptor'
  | 'unsupported_execution_plan'
  | 'runtime_config_generation_failed'
  | 'production_config_generation_failed'
  | 'unsupported_profile_protocol'
  | 'missing_endpoint'
  | 'missing_keys'
  | 'missing_allowed_ips'
  | 'missing_interface_address'
  | 'invalid_local_proxy'
  | 'tun_bypass_resolution_failure'

interface AmneziaHelperStartupPreflightReason {
  code: AmneziaHelperStartupPreflightReasonCode
  stage: string
  message: string
  details?: Record<string, string | number | boolean>
}

interface AmneziaHelperStartupPreflightResult {
  profileId: string
  checkedAt: number
  canStart: boolean
  backendStatus: AmneziaHelperStartupPreflightStatus
  profileStatus: AmneziaHelperStartupPreflightStatus
  endpointStatus: AmneziaHelperStartupPreflightStatus
  configStatus: AmneziaHelperStartupPreflightStatus
  tunBypassStatus: AmneziaHelperStartupPreflightTunBypassStatus
  blockingReasons: AmneziaHelperStartupPreflightReason[]
  warnings: AmneziaHelperStartupPreflightReason[]
  backend: {
    mode: AmneziaHelperBackendMode
    kind: 'production' | 'prototype' | 'stub' | 'unavailable'
    available: boolean
    command: string
    executablePath: string
  }
  localEndpoint?: {
    host: string
    port: number
    protocol: 'socks5'
  }
}

interface AmneziaHelperTunBypassResolution {
  status: AmneziaHelperTunBypassResolutionStatus
  endpointHost?: string
  endpointPort?: number
  ips: string[]
  routeExcludeAddresses: string[]
  warnings: string[]
  error?: string
  resolvedAt: number
}

interface AmneziaHelperUdpCapability {
  udpSupport: AmneziaHelperUdpSupport
  udpValidated: boolean
  udpReasonCode: AmneziaHelperUdpReasonCode
  udpExplanation: string
  checkedAt?: number
}

interface ProfileItem {
  id: string
  type: 'remote' | 'local'
  name: string
  url?: string // remote
  ua?: string // remote
  file?: string // local
  verify?: boolean // remote
  interval?: number
  home?: string
  updated?: number
  useProxy?: boolean
  extra?: SubscriptionUserInfo
  locked?: boolean
  autoUpdate?: boolean
  announce?: string
  logo?: string
  supportUrl?: string
  profileKind?: ProfileKind
  sourceType?: ProfileSourceType
  runtimeSupport?: ProfileRuntimeSupport
  validityStatus?: ProfileValidityStatus
  executionStatus?: ProfileExecutionStatus
  compatibility?: 'amnezia'
  importedSourceId?: string
  normalizedProfileId?: string
  compatibilityProtocol?: string
}

interface ProfileRuntimeCapabilities {
  runtimeType: ProfileRuntimeType
  runtimeSupport: ProfileRuntimeSupport
  executionStatus: ProfileExecutionStatus
  executionKind: ProfileExecutionKind
  canActivate: boolean
  canRefresh: boolean
  canRename: boolean
  canDelete: boolean
  canViewDetails: boolean
  canEditConfig: boolean
  canEditRules: boolean
  canOpenConfigFile: boolean
  canDryRun: boolean
  requiresHelper: boolean
  unsupportedReason?: 'runtime_not_supported' | 'helper_required'
}

interface RuntimeCompatibilityResult {
  compatible: boolean
  adapterId: RuntimeAdapterId
  executionKind: ProfileExecutionKind
  runtimeSupport: ProfileRuntimeSupport
  blockers: string[]
  warnings: string[]
  requiresHelper: boolean
  dryRunAvailable: boolean
}

interface AmneziaHelperRuntimeConfig {
  schemaVersion: 1
  profileId: string
  sourceId: string
  name: string
  protocol: string
  remote: {
    host: string
    port: number
    transport: {
      type: string
      endpoint?: {
        host: string
        port?: number
      }
      mtu?: number
    }
  }
  auth: {
    clientPrivateKey?: string
    serverPublicKey?: string
    presharedKey?: string
    username?: string
  }
  interface: {
    addresses: string[]
    dns: string[]
    mtu?: number
  }
  peer: {
    endpoint?: string
    publicKey?: string
    allowedIps: string[]
    persistentKeepalive?: number
  }
  amnezia: {
    defaultContainer?: string
    container?: string
    protocolVersion?: string
    obfuscation: Record<string, string | number | boolean>
  }
  localProxy: {
    host: string
    port: number
    protocol: 'socks5'
  }
  execution: {
    mode: 'proxy'
    backendMode: AmneziaHelperBackendMode
    generatedAt: number
    readiness: {
      type: 'tcp-listen'
      timeoutMs: number
    }
  }
  metadata: {
    importedAt: number
    decodedFormat: string
    sourceType: 'amnezia_vpn_uri'
    warnings: string[]
  }
}

interface AmneziaHelperProcessDescriptor {
  backendMode: AmneziaHelperBackendMode
  executable: string
  args: string[]
  configFormat: 'json'
  config: AmneziaHelperRuntimeConfig
  needsElevatedPrivileges: boolean
  notes: string[]
}

interface ProfileRuntimeExecutionPlan {
  profileId: string
  platform?: DesktopRuntimePlatform
  adapterId: RuntimeAdapterId
  kind: ProfileExecutionKind
  status: RuntimePlanStatus
  compatibility: RuntimeCompatibilityResult
  helper?: AmneziaHelperProcessDescriptor
}

type AmneziaHelperSessionStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'restarting'
  | 'stopping'
  | 'stopped'
  | 'failed'
type AmneziaHelperDesiredState = 'idle' | 'running' | 'stopped'
type AmneziaHelperExitReason =
  | 'requested_stop'
  | 'app_shutdown'
  | 'profile_changed'
  | 'runtime_disabled'
  | 'startup_conditions_invalid'
  | 'unexpected_exit'
  | 'startup_failed'
  | 'crash_loop'

interface AmneziaHelperSession {
  profileId: string
  sessionId: string
  pid?: number
  status: AmneziaHelperSessionStatus
  startedAt?: number
  stoppedAt?: number
  lastError?: string
  command: string
  args: string[]
  tempConfigPath?: string
  backendMode: AmneziaHelperBackendMode
  readiness: AmneziaHelperReadinessStatus
  localEndpoint?: {
    host: string
    port: number
    protocol: 'socks5'
  }
  startupDiagnostics: string[]
  runtimeDiagnostics: AmneziaHelperRuntimeDiagnostic[]
  configStatus: AmneziaHelperConfigStatus
  configError?: string
  tunBypass?: AmneziaHelperTunBypassResolution
  routingTarget?: AmneziaHelperRoutingTarget
  connectivityStatus: AmneziaHelperConnectivityStatus
  validationStage: AmneziaHelperValidationStage
  lastConnectivityCheckAt?: number
  lastConnectivityError?: string
  lastConnectivityLatencyMs?: number
  connectivityResult?: AmneziaHelperConnectivityResult
  udpCapability: AmneziaHelperUdpCapability
  desiredState: AmneziaHelperDesiredState
  managedByApp: boolean
  restartCount: number
  lastExitReason?: AmneziaHelperExitReason
  lastRestartAt?: number
  crashLoopDetected: boolean
}

interface AmneziaHelperConnectivityStageResult {
  stage: AmneziaHelperValidationStage
  status: 'passed' | 'failed' | 'skipped'
  durationMs?: number
  message?: string
}

interface AmneziaHelperConnectivityResult {
  profileId: string
  status: 'unknown' | 'verified' | 'failed'
  validationStage: AmneziaHelperValidationStage
  checkedAt: number
  durationMs: number
  latencyMs?: number
  endpoint: {
    host: string
    port: number
    protocol: 'socks5'
  }
  stages: AmneziaHelperConnectivityStageResult[]
  diagnostic?: AmneziaHelperRuntimeDiagnostic
}

interface AmneziaHelperRoutingTarget {
  profileId: string
  groupName: string
  outboundName: string
  status: AmneziaHelperRoutingTargetStatus
  endpoint?: {
    host: string
    port: number
    protocol: 'socks5'
  }
  tunBypass?: AmneziaHelperTunBypassResolution
  udpCapability?: AmneziaHelperUdpCapability
  reason?: AmneziaHelperRoutingUnavailableReason
  updatedAt: number
}

interface AmneziaHelperLogEntry {
  at: number
  stream: 'manager' | 'stdout' | 'stderr'
  message: string
}

interface AmneziaHelperRule {
  id: string
  type: AmneziaHelperRuleType
  value: string
  enabled: boolean
  target: 'AMNEZIA_HELPER'
  note?: string
  createdAt: number
  updatedAt?: number
}

interface AmneziaHelperRuleInput {
  packId?: string
  type: AmneziaHelperRuleType
  value: string
  enabled?: boolean
  note?: string
}

interface AmneziaHelperRulePatch {
  type?: AmneziaHelperRuleType
  value?: string
  enabled?: boolean
  note?: string
}

interface AmneziaHelperRulePack {
  id: string
  name: string
  enabled: boolean
  note?: string
  rules: AmneziaHelperRule[]
  createdAt: number
  updatedAt?: number
}

interface AmneziaHelperRulePackInput {
  name: string
  enabled?: boolean
  note?: string
}

interface AmneziaHelperRulePackPatch {
  name?: string
  enabled?: boolean
  note?: string
}

interface AmneziaHelperRuleBulkIssue {
  code: AmneziaHelperRuleBulkIssueCode
  line?: number
  value?: string
  type?: AmneziaHelperRuleType
  packName?: string
  message: string
}

interface AmneziaHelperRuleBulkInput {
  packId?: string
  type: AmneziaHelperRuleType
  text: string
  enabled?: boolean
  note?: string
}

interface AmneziaHelperRuleBulkResult {
  packId: string
  added: AmneziaHelperRule[]
  skipped: AmneziaHelperRuleBulkIssue[]
  invalid: AmneziaHelperRuleBulkIssue[]
  summary: {
    added: number
    skipped: number
    invalid: number
  }
}

interface AmneziaHelperRulePackImportResult {
  added: AmneziaHelperRule[]
  skipped: AmneziaHelperRuleBulkIssue[]
  invalid: AmneziaHelperRuleBulkIssue[]
  summary: {
    addedPacks: number
    mergedPacks: number
    addedRules: number
    skippedRules: number
    invalidRules: number
  }
}

type AmneziaHelperSupportSeverity = 'info' | 'warning' | 'blocker'
type EffectiveBypassMode =
  | 'true_bypass'
  | 'partial_bypass'
  | 'learned_bypass'
  | 'direct_only'
  | 'unsupported'
type NativeProcessBypassStatus = 'disabled' | 'unsupported' | 'available' | 'active' | 'blocked'
type NativeProcessBypassPlatformMode =
  | 'linux_native'
  | 'windows_wfp_service'
  | 'windows_scaffold'
  | 'macos_fallback_only'
  | 'unsupported'
type LinuxNativeProcessBypassPrerequisiteStatus =
  | 'supported'
  | 'missing_prerequisites'
  | 'insufficient_privileges'
  | 'not_linux'
  | 'not_windows'
  | 'partially_supported'
  | 'windows_service_missing'
  | 'implementation_pending'
  | 'fallback_only'
type AmneziaHelperTunDnsEnhancedMode = 'fake-ip' | 'redir-host' | 'normal' | 'unknown'
type AmneziaHelperRuleReliability = 'reliable' | 'degraded' | 'unlikely' | 'blocked'
type AmneziaHelperRuleReliabilityReason =
  | 'tun_disabled'
  | 'no_enabled_helper_rules'
  | 'ip_cidr_only'
  | 'domain_rules_fake_ip_dns_hijack'
  | 'domain_rules_dns_disabled'
  | 'domain_rules_dns_hijack_missing'
  | 'domain_rules_redir_host'
  | 'domain_rules_normal_dns'
  | 'domain_rules_unknown_dns_mode'
type AmneziaHelperSupportStatusCode =
  | 'helper_missing'
  | 'helper_permission_denied'
  | 'helper_not_executable'
  | 'unsupported_platform'
  | 'unsupported_arch'
  | 'helper_arch_mismatch'
  | 'backend_unavailable'
  | 'config_generation_failed'
  | 'startup_failed'
  | 'startup_timeout'
  | 'endpoint_unreachable'
  | 'proxy_handshake_failed'
  | 'upstream_request_failed'
  | 'validation_timeout'
  | 'connectivity_failed'
  | 'helper_not_running'
  | 'helper_starting'
  | 'helper_managed_by_app'
  | 'helper_restarting'
  | 'helper_crash_loop'
  | 'helper_dev_override'
  | 'proxy_ready_not_validated'
  | 'helper_ready_validated'
  | 'helper_rules_inactive'
  | 'routing_target_unavailable'
  | 'tun_compatible'
  | 'tun_at_risk'
  | 'tun_blocked_for_helper'
  | 'tun_domain_rules_degraded'
  | 'tun_domain_rules_unlikely'
  | 'tun_domain_rules_blocked'
  | 'direct_tun_bypass_active'
  | 'direct_tun_bypass_partial'
  | 'direct_tun_bypass_blocked'
  | 'direct_process_name_bypass_unsupported'
  | 'learned_process_bypass_active'
  | 'learned_process_bypass_observing'
  | 'learned_process_bypass_stale'
  | 'learned_process_bypass_unsupported'
  | 'native_process_bypass_available'
  | 'native_process_bypass_active'
  | 'native_process_bypass_unsupported'
  | 'native_process_bypass_blocked'
  | 'windows_native_bypass_scaffold'
  | 'windows_native_bypass_prereq_blocked'
  | 'windows_native_bypass_active'
  | 'windows_native_bypass_apply_failed'
  | 'macos_native_bypass_fallback_only'
  | 'udp_supported'
  | 'udp_tcp_only'

interface AmneziaHelperSupportStatus {
  code: AmneziaHelperSupportStatusCode
  severity: AmneziaHelperSupportSeverity
  title: string
  message: string
  details?: Record<string, string | number | boolean>
}

interface AmneziaHelperReleaseReadinessSummary {
  status: 'supported' | 'warning' | 'blocked'
  blockers: string[]
  warnings: string[]
}

interface AmneziaHelperSupportSummary {
  severity: AmneziaHelperSupportSeverity
  primaryStatus: AmneziaHelperSupportStatus
  statuses: AmneziaHelperSupportStatus[]
  releaseReadiness: AmneziaHelperReleaseReadinessSummary
}

type AmneziaHelperReadinessOverallStatus = 'ready' | 'ready_with_warnings' | 'blocked' | 'unknown'

type AmneziaHelperReadinessComponentStatus =
  | 'ready'
  | 'warning'
  | 'blocked'
  | 'unknown'
  | 'not_applicable'

type AmneziaHelperReadinessIssueSource = 'helper' | 'tun' | 'dns' | 'udp' | 'stability' | 'release'

interface AmneziaHelperReadinessIssue {
  code: string
  severity: AmneziaHelperSupportSeverity
  source: AmneziaHelperReadinessIssueSource
  title: string
  message: string
}

interface AmneziaHelperRecommendedAction {
  code: string
  severity: AmneziaHelperSupportSeverity
  message: string
}

interface AmneziaHelperStabilitySupportSnapshot {
  status: 'passed' | 'failed' | 'skipped' | 'unknown'
  lifecycleStressPassed?: boolean
  reloadResiliencePassed?: boolean
  recoveryPassed?: boolean
  soakDurationMs?: number
  repeatedStartStopCount?: number
  staleStateDetected?: boolean
  cleanupLeakDetected?: boolean
  summaryMessage?: string
}

interface AmneziaHelperReadinessSummary {
  overallStatus: AmneziaHelperReadinessOverallStatus
  helperStatus: AmneziaHelperReadinessComponentStatus
  tunStatus: AmneziaHelperReadinessComponentStatus
  dnsRuleReliabilityStatus: AmneziaHelperReadinessComponentStatus
  udpStatus: AmneziaHelperReadinessComponentStatus
  stabilityStatus: AmneziaHelperReadinessComponentStatus
  releaseStatus: AmneziaHelperReleaseReadinessSummary['status']
  topIssues: AmneziaHelperReadinessIssue[]
  recommendedActions: AmneziaHelperRecommendedAction[]
}

interface AmneziaHelperBackendValidationIssue {
  code: string
  message: string
  path?: string
  expectedPlatform?: string
  expectedArch?: string
  actualPlatform?: string
  actualArch?: string
}

interface AmneziaHelperBackendValidationSnapshot {
  ok: boolean
  path: string
  platform: string
  arch: string
  issues: AmneziaHelperBackendValidationIssue[]
  diagnostics: string[]
  manifest?: {
    name?: string
    version?: string
    platform?: string
    arch?: string
    binary?: string
  }
}

interface AmneziaHelperBackendSupportSnapshot {
  mode: AmneziaHelperBackendMode
  kind: 'production' | 'prototype' | 'stub' | 'unavailable'
  pathSource: 'bundled' | 'override' | 'development'
  available: boolean
  command: string
  executablePath: string
  diagnostics: string[]
  validation?: AmneziaHelperBackendValidationSnapshot
  helperChecksumSha256?: string
  helperVersion?: string
}

interface AmneziaHelperLifecycleSupportSnapshot {
  desiredState: AmneziaHelperDesiredState
  managedByApp: boolean
  restartCount: number
  lastExitReason?: AmneziaHelperExitReason
  lastRestartAt?: number
  crashLoopDetected: boolean
}

interface AmneziaHelperSessionSupportSnapshot {
  profileId: string
  sessionId: string
  pid?: number
  status: AmneziaHelperSessionStatus
  startedAt?: number
  stoppedAt?: number
  lastError?: string
  command: string
  argsCount: number
  hasTempConfig: boolean
  backendMode: AmneziaHelperBackendMode
  readiness: AmneziaHelperReadinessStatus
  localEndpoint?: {
    host: string
    port: number
    protocol: 'socks5'
  }
  startupDiagnostics: string[]
  runtimeDiagnostics: AmneziaHelperRuntimeDiagnostic[]
  configStatus: AmneziaHelperConfigStatus
  configError?: string
  routingTarget?: AmneziaHelperRoutingTarget
  connectivityStatus: AmneziaHelperConnectivityStatus
  validationStage: AmneziaHelperValidationStage
  lastConnectivityCheckAt?: number
  lastConnectivityError?: string
  lastConnectivityLatencyMs?: number
  connectivityResult?: AmneziaHelperConnectivityResult
  udpCapability: AmneziaHelperUdpCapability
  lifecycle: AmneziaHelperLifecycleSupportSnapshot
}

interface AmneziaHelperRulePacksSupportSummary {
  totalPacks: number
  enabledPacks: number
  totalRules: number
  enabledRules: number
  rulesByType: Record<AmneziaHelperRuleType, number>
}

interface AmneziaHelperTunSupportSnapshot {
  enabled: boolean
  dnsEnabled?: boolean
  dnsHijackEnabled: boolean
  dnsEnhancedMode: AmneziaHelperTunDnsEnhancedMode
  helperBypassActive: boolean
  helperBypassIpsCount: number
  helperBypassResolutionStatus: AmneziaHelperTunBypassResolutionStatus
  helperBypassWarnings: string[]
  helperBypassError?: string
  helperRuleReliability: AmneziaHelperRuleReliability
  helperRuleReliabilityReason: AmneziaHelperRuleReliabilityReason
  helperRuleReliabilityReasons: AmneziaHelperRuleReliabilityReason[]
  helperRuleReliabilityExplanation: string
  helperRulesHaveDomainRules: boolean
  helperRulesIpCidrOnly: boolean
  helperRulesDomainCount: number
  helperRulesIpCidrCount: number
  directExcludeEnabled: boolean
  directExcludeActive: boolean
  directExcludeMode: 'conservative' | 'full_supported_types'
  directExcludeOverallStatus: 'active' | 'partial' | 'blocked' | 'inactive'
  directExcludeRuleCount: number
  directExcludeResolvedAddressCount: number
  directExcludePartialCount: number
  directExcludeFailureCount: number
  directExcludeWarnings: string[]
  directTunBypassEnabled: boolean
  directTunBypassActive: boolean
  directTunBypassStatus: 'disabled' | 'not_required' | 'resolved' | 'partial' | 'failed'
  directTunBypassRuleCount: number
  directTunBypassResolvedAddressCount: number
  directTunBypassWarnings: string[]
  learnedBypassEnabled: boolean
  learnedBypassActive: boolean
  learnedBypassEntryCount: number
  learnedBypassProcessCount: number
  learnedBypassExpiredCount: number
  learnedBypassSupportedOnPlatform: boolean
  learnedBypassWarnings: string[]
  learnedBypassOverallStatus: 'inactive' | 'observing' | 'active' | 'stale' | 'unsupported'
  nativeProcessBypassEnabled: boolean
  nativeProcessBypassSupportedOnPlatform: boolean
  nativeProcessBypassActive: boolean
  nativeProcessBypassRequiresPrivileges: boolean
  nativeProcessBypassRequiresService: boolean
  nativeProcessBypassStatus: NativeProcessBypassStatus
  nativeProcessBypassMechanism?: 'linux-cgroup-fwmark' | 'windows-wfp-service'
  nativeProcessBypassPlatformMode?: NativeProcessBypassPlatformMode
  nativeProcessBypassNativeDataPlaneActive: boolean
  nativeProcessBypassFallbackOnly: boolean
  nativeProcessBypassFallbackReason?: string
  nativeProcessBypassDiagnostics: string[]
  nativeProcessBypassPrerequisiteStatus?: LinuxNativeProcessBypassPrerequisiteStatus
  nativeProcessBypassBoundPidCount: number
  nativeProcessBypassTrackedPidCount: number
  nativeProcessBypassNewlyBoundPidCount: number
  nativeProcessBypassDeadPidCleanupCount: number
  nativeProcessBypassLastReconcileAt?: number
  nativeProcessBypassReconcileActive: boolean
  nativeProcessBypassReconcileErrors: string[]
  nativeProcessBypassWindowsServiceAvailable?: boolean
  nativeProcessBypassWindowsControllerAvailable?: boolean
  nativeProcessBypassWindowsSessionId?: string
  nativeProcessBypassWindowsAppliedProcessCount?: number
  processDirectEffectiveBypassMode: EffectiveBypassMode
  bypassCapabilityWarnings: string[]
  bypassCapabilitySummary: {
    trueBypassRuleCount: number
    partialBypassRuleCount: number
    learnedBypassRuleCount: number
    directOnlyRuleCount: number
    unsupportedRuleCount: number
    processDirectRuleCount: number
  }
  unsupportedDirectExcludeRules: Array<{
    rule: string
    ruleType: string
    value?: string
    reasonCode: string
    message: string
  }>
  unsupportedDirectBypassRules: Array<{
    rule: string
    ruleType: string
    value?: string
    reasonCode: string
    message: string
  }>
}

interface AmneziaHelperUdpSupportSnapshot {
  udpSupport: AmneziaHelperUdpSupport
  udpValidated: boolean
  udpReasonCode: AmneziaHelperUdpReasonCode
  udpExplanation: string
  runtimeAdvertisesUdp: boolean
  checkedAt?: number
}

interface AmneziaHelperSupportSummaryExport {
  schemaVersion: 1
  generatedAt: number
  app: {
    version?: string
    buildId?: string
  }
  platform: {
    platform: string
    arch: string
  }
  profileId?: string
  readinessSummary: AmneziaHelperReadinessSummary
  backend: {
    mode: AmneziaHelperBackendMode
    kind: AmneziaHelperBackendSupportSnapshot['kind']
    available: boolean
    helperVersion?: string
    helperChecksumPrefix?: string
  }
  startupPreflight?: {
    canStart: boolean
    backendStatus: AmneziaHelperStartupPreflightStatus
    profileStatus: AmneziaHelperStartupPreflightStatus
    endpointStatus: AmneziaHelperStartupPreflightStatus
    configStatus: AmneziaHelperStartupPreflightStatus
    tunBypassStatus: AmneziaHelperStartupPreflightTunBypassStatus
    blockingReasonCodes: AmneziaHelperStartupPreflightReasonCode[]
    warningCodes: AmneziaHelperStartupPreflightReasonCode[]
  }
  helper: {
    status?: AmneziaHelperSessionStatus
    readiness?: AmneziaHelperReadinessStatus
    connectivityStatus?: AmneziaHelperConnectivityStatus
    validationStage?: AmneziaHelperValidationStage
    backendMode?: AmneziaHelperBackendMode
  }
  tun: Pick<
    AmneziaHelperTunSupportSnapshot,
    | 'enabled'
    | 'dnsHijackEnabled'
    | 'dnsEnhancedMode'
    | 'helperBypassActive'
    | 'helperBypassIpsCount'
    | 'helperBypassResolutionStatus'
    | 'directExcludeEnabled'
    | 'directExcludeActive'
    | 'directExcludeMode'
    | 'directExcludeOverallStatus'
    | 'directExcludeRuleCount'
    | 'directExcludeResolvedAddressCount'
    | 'directExcludePartialCount'
    | 'directExcludeFailureCount'
    | 'directTunBypassEnabled'
    | 'directTunBypassActive'
    | 'directTunBypassStatus'
    | 'directTunBypassRuleCount'
    | 'directTunBypassResolvedAddressCount'
    | 'learnedBypassEnabled'
    | 'learnedBypassActive'
    | 'learnedBypassOverallStatus'
    | 'learnedBypassEntryCount'
    | 'learnedBypassProcessCount'
    | 'learnedBypassExpiredCount'
    | 'nativeProcessBypassEnabled'
    | 'nativeProcessBypassSupportedOnPlatform'
    | 'nativeProcessBypassActive'
    | 'nativeProcessBypassStatus'
    | 'nativeProcessBypassPlatformMode'
    | 'nativeProcessBypassNativeDataPlaneActive'
    | 'nativeProcessBypassFallbackOnly'
    | 'nativeProcessBypassFallbackReason'
    | 'nativeProcessBypassTrackedPidCount'
    | 'nativeProcessBypassNewlyBoundPidCount'
    | 'nativeProcessBypassDeadPidCleanupCount'
    | 'nativeProcessBypassLastReconcileAt'
    | 'nativeProcessBypassReconcileActive'
    | 'nativeProcessBypassWindowsServiceAvailable'
    | 'nativeProcessBypassWindowsControllerAvailable'
    | 'nativeProcessBypassWindowsAppliedProcessCount'
    | 'processDirectEffectiveBypassMode'
    | 'helperRuleReliability'
    | 'helperRuleReliabilityReason'
  >
  udp: AmneziaHelperUdpSupportSnapshot
  stability: AmneziaHelperStabilitySupportSnapshot
  rules: AmneziaHelperRulePacksSupportSummary
  supportStatusCodes: AmneziaHelperSupportStatusCode[]
}

interface AmneziaHelperDiagnosticsBundle {
  schemaVersion: 1
  generatedAt: number
  app: {
    version?: string
    buildId?: string
  }
  platform: {
    platform: string
    arch: string
  }
  profileId?: string
  backend: AmneziaHelperBackendSupportSnapshot
  startupPreflight?: AmneziaHelperStartupPreflightResult
  session?: AmneziaHelperSessionSupportSnapshot
  readiness: {
    status: AmneziaHelperReadinessStatus
    localEndpoint?: {
      host: string
      port: number
      protocol: 'socks5'
    }
  }
  connectivity: {
    status: AmneziaHelperConnectivityStatus
    validationStage: AmneziaHelperValidationStage
    lastResult?: AmneziaHelperConnectivityResult
  }
  udp: AmneziaHelperUdpSupportSnapshot
  routing: {
    target?: AmneziaHelperRoutingTarget
  }
  tun: AmneziaHelperTunSupportSnapshot
  rules: AmneziaHelperRulePacksSupportSummary
  stability: AmneziaHelperStabilitySupportSnapshot
  readinessSummary: AmneziaHelperReadinessSummary
  summaryExport: AmneziaHelperSupportSummaryExport
  logs: AmneziaHelperLogEntry[]
  support: AmneziaHelperSupportSummary
}

interface AmneziaHelperDiagnosticsExportResult {
  path: string
  bundle: AmneziaHelperDiagnosticsBundle
}

interface AmneziaProfileDetails {
  source?: {
    id: string
    type: 'amnezia_vpn_uri'
    raw: string
    importedAt: number
  }
  profile?: {
    id: string
    name: string
    sourceId: string
    protocol: string
    enabled: boolean
    transport: {
      type: string
      endpoint?: {
        host: string
        port?: number
      }
      mtu?: number
    }
    auth: {
      clientPrivateKey?: string
      serverPublicKey?: string
      presharedKey?: string
      username?: string
    }
    interface: {
      addresses: string[]
      dns: string[]
      mtu?: number
    }
    peer: {
      endpoint?: string
      publicKey?: string
      allowedIps: string[]
      persistentKeepalive?: number
    }
    amnezia: {
      defaultContainer?: string
      container?: string
      protocolVersion?: string
      obfuscation: Record<string, string | number | boolean>
    }
    metadata: {
      importedAt: number
      decodedFormat: string
      sourceType: 'amnezia_vpn_uri'
      warnings: string[]
    }
  }
  runtime: ProfileRuntimeCapabilities
  executionPlan?: ProfileRuntimeExecutionPlan
  validationIssues: {
    code: string
    path: string
    message: string
  }[]
}

interface SubscriptionUserInfo {
  upload: number
  download: number
  total: number
  expire: number
}
