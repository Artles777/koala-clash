import { createHash } from 'crypto'
import { mkdir, readFile, writeFile } from 'fs/promises'
import * as path from 'path'
import type { AmneziaHelperRulePack } from '../../core/routing/amnezia-helper-rule-packs'
import type { AmneziaHelperRuleType } from '../../core/routing/amnezia-helper-rules'
import type { AmneziaHelperRoutingTarget } from '../../core/routing/amnezia-helper-routing'
import {
  evaluateAmneziaHelperTunRuleReliability,
  type AmneziaHelperRuleReliability,
  type AmneziaHelperRuleReliabilityReason,
  type AmneziaHelperTunDnsEnhancedMode,
  type AmneziaHelperTunRuleReliabilityResult
} from '../../core/routing/amnezia-helper-tun-rule-reliability'
import {
  createInitialAmneziaHelperUdpCapability,
  shouldAdvertiseAmneziaHelperUdp,
  type AmneziaHelperUdpCapability,
  type AmneziaHelperUdpReasonCode,
  type AmneziaHelperUdpSupport
} from '../../core/routing/amnezia-helper-udp-capability'
import type {
  AmneziaHelperTunBypassResolution,
  AmneziaHelperTunBypassResolutionStatus
} from '../../core/routing/amnezia-helper-tun-bypass'
import type { DirectTunBypassResolution } from '../../core/routing/direct-tun-bypass'
import type { LearnedProcessBypassResolution } from '../../core/routing/learned-process-bypass'
import type {
  BypassCapabilityReport,
  EffectiveBypassMode,
  NativeProcessBypassStatus
} from '../../core/routing/bypass-capabilities'
import type {
  AmneziaHelperExecutableValidationIssue,
  AmneziaHelperExecutableValidationResult,
  ResolvedAmneziaHelperBackend
} from './amnezia-helper-backend-provider'
import type { AmneziaHelperConnectivityResult } from './amnezia-helper-connectivity'
import type { AmneziaHelperLogEntry, AmneziaHelperSession } from './amnezia-helper-manager'
import type {
  AmneziaHelperStartupPreflightReason,
  AmneziaHelperStartupPreflightReasonCode,
  AmneziaHelperStartupPreflightResult
} from './amnezia-helper-startup-preflight'
import type { AmneziaHelperStabilityReport } from './amnezia-helper-stability'

export type AmneziaHelperSupportSeverity = 'info' | 'warning' | 'blocker'
export type AmneziaHelperSupportStatusCode =
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

export interface AmneziaHelperSupportStatus {
  code: AmneziaHelperSupportStatusCode
  severity: AmneziaHelperSupportSeverity
  title: string
  message: string
  details?: Record<string, string | number | boolean>
}

export interface AmneziaHelperReleaseReadinessSummary {
  status: 'supported' | 'warning' | 'blocked'
  blockers: string[]
  warnings: string[]
}

export interface AmneziaHelperSupportSummary {
  severity: AmneziaHelperSupportSeverity
  primaryStatus: AmneziaHelperSupportStatus
  statuses: AmneziaHelperSupportStatus[]
  releaseReadiness: AmneziaHelperReleaseReadinessSummary
}

export type AmneziaHelperReadinessOverallStatus =
  | 'ready'
  | 'ready_with_warnings'
  | 'blocked'
  | 'unknown'

export type AmneziaHelperReadinessComponentStatus =
  | 'ready'
  | 'warning'
  | 'blocked'
  | 'unknown'
  | 'not_applicable'

export type AmneziaHelperReadinessIssueSource =
  | 'helper'
  | 'tun'
  | 'dns'
  | 'udp'
  | 'stability'
  | 'release'

export interface AmneziaHelperReadinessIssue {
  code: string
  severity: AmneziaHelperSupportSeverity
  source: AmneziaHelperReadinessIssueSource
  title: string
  message: string
}

export interface AmneziaHelperRecommendedAction {
  code: string
  severity: AmneziaHelperSupportSeverity
  message: string
}

export interface AmneziaHelperStabilitySupportSnapshot {
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

export interface AmneziaHelperReadinessSummary {
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

export interface AmneziaHelperBackendValidationSnapshot {
  ok: boolean
  path: string
  platform: string
  arch: string
  issues: AmneziaHelperExecutableValidationIssue[]
  diagnostics: string[]
  manifest?: AmneziaHelperExecutableValidationResult['manifest']
}

export interface AmneziaHelperBackendSupportSnapshot {
  mode: ResolvedAmneziaHelperBackend['mode']
  kind: ResolvedAmneziaHelperBackend['kind']
  pathSource: ResolvedAmneziaHelperBackend['pathSource']
  available: boolean
  command: string
  executablePath: string
  diagnostics: string[]
  validation?: AmneziaHelperBackendValidationSnapshot
  helperChecksumSha256?: string
  helperVersion?: string
}

export interface AmneziaHelperLifecycleSupportSnapshot {
  desiredState: AmneziaHelperSession['desiredState']
  managedByApp: boolean
  restartCount: number
  lastExitReason?: AmneziaHelperSession['lastExitReason']
  lastRestartAt?: number
  crashLoopDetected: boolean
}

export interface AmneziaHelperSessionSupportSnapshot {
  profileId: string
  sessionId: string
  pid?: number
  status: AmneziaHelperSession['status']
  startedAt?: number
  stoppedAt?: number
  lastError?: string
  command: string
  argsCount: number
  hasTempConfig: boolean
  backendMode: AmneziaHelperSession['backendMode']
  readiness: AmneziaHelperSession['readiness']
  localEndpoint?: AmneziaHelperSession['localEndpoint']
  startupDiagnostics: string[]
  runtimeDiagnostics: AmneziaHelperSession['runtimeDiagnostics']
  configStatus: AmneziaHelperSession['configStatus']
  configError?: string
  routingTarget?: AmneziaHelperRoutingTarget
  connectivityStatus: AmneziaHelperSession['connectivityStatus']
  validationStage: AmneziaHelperSession['validationStage']
  lastConnectivityCheckAt?: number
  lastConnectivityError?: string
  lastConnectivityLatencyMs?: number
  connectivityResult?: AmneziaHelperConnectivityResult
  udpCapability: AmneziaHelperUdpCapability
  lifecycle: AmneziaHelperLifecycleSupportSnapshot
}

export interface AmneziaHelperRulePacksSupportSummary {
  totalPacks: number
  enabledPacks: number
  totalRules: number
  enabledRules: number
  rulesByType: Record<AmneziaHelperRuleType, number>
}

export interface AmneziaHelperTunSupportSnapshot {
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
  directExcludeMode: DirectTunBypassResolution['mode']
  directExcludeOverallStatus: DirectTunBypassResolution['directExcludeOverallStatus']
  directExcludeRuleCount: number
  directExcludeResolvedAddressCount: number
  directExcludePartialCount: number
  directExcludeFailureCount: number
  directExcludeWarnings: string[]
  directTunBypassEnabled: boolean
  directTunBypassActive: boolean
  directTunBypassStatus: DirectTunBypassResolution['status']
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
  learnedBypassOverallStatus: LearnedProcessBypassResolution['status']
  nativeProcessBypassEnabled: boolean
  nativeProcessBypassSupportedOnPlatform: boolean
  nativeProcessBypassActive: boolean
  nativeProcessBypassRequiresPrivileges: boolean
  nativeProcessBypassRequiresService: boolean
  nativeProcessBypassStatus: NativeProcessBypassStatus
  nativeProcessBypassMechanism?: BypassCapabilityReport['nativeProcessBypass']['mechanism']
  nativeProcessBypassPlatformMode?: BypassCapabilityReport['nativeProcessBypass']['platformMode']
  nativeProcessBypassNativeDataPlaneActive: boolean
  nativeProcessBypassFallbackOnly: boolean
  nativeProcessBypassFallbackReason?: string
  nativeProcessBypassDiagnostics: string[]
  nativeProcessBypassPrerequisiteStatus?: BypassCapabilityReport['nativeProcessBypass']['prerequisiteStatus']
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
  bypassCapabilitySummary: BypassCapabilityReport['summary']
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

export interface AmneziaHelperUdpSupportSnapshot {
  udpSupport: AmneziaHelperUdpSupport
  udpValidated: boolean
  udpReasonCode: AmneziaHelperUdpReasonCode
  udpExplanation: string
  runtimeAdvertisesUdp: boolean
  checkedAt?: number
}

export interface AmneziaHelperDiagnosticsBundle {
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
    status: AmneziaHelperSession['readiness']
    localEndpoint?: AmneziaHelperSession['localEndpoint']
  }
  connectivity: {
    status: AmneziaHelperSession['connectivityStatus']
    validationStage: AmneziaHelperSession['validationStage']
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

export interface AmneziaHelperSupportSummaryExport {
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
    mode: AmneziaHelperBackendSupportSnapshot['mode']
    kind: AmneziaHelperBackendSupportSnapshot['kind']
    available: boolean
    helperVersion?: string
    helperChecksumPrefix?: string
  }
  startupPreflight?: AmneziaHelperSupportSummaryExportPreflight
  helper: {
    status?: AmneziaHelperSession['status']
    readiness?: AmneziaHelperSession['readiness']
    connectivityStatus?: AmneziaHelperSession['connectivityStatus']
    validationStage?: AmneziaHelperSession['validationStage']
    backendMode?: AmneziaHelperSession['backendMode']
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

export interface AmneziaHelperDiagnosticsExportResult {
  path: string
  bundle: AmneziaHelperDiagnosticsBundle
}

export interface AmneziaHelperSupportSummaryExportPreflight {
  canStart: boolean
  backendStatus: AmneziaHelperStartupPreflightResult['backendStatus']
  profileStatus: AmneziaHelperStartupPreflightResult['profileStatus']
  endpointStatus: AmneziaHelperStartupPreflightResult['endpointStatus']
  configStatus: AmneziaHelperStartupPreflightResult['configStatus']
  tunBypassStatus: AmneziaHelperStartupPreflightResult['tunBypassStatus']
  blockingReasonCodes: AmneziaHelperStartupPreflightReasonCode[]
  warningCodes: AmneziaHelperStartupPreflightReasonCode[]
}

interface CreateDiagnosticsBundleInput {
  generatedAt?: number
  appVersion?: string
  buildId?: string
  platform?: string
  arch?: string
  profileId?: string
  backend: AmneziaHelperBackendSupportSnapshot
  startupPreflight?: AmneziaHelperStartupPreflightResult
  session?: AmneziaHelperSession
  logs?: AmneziaHelperLogEntry[]
  rulePacks?: AmneziaHelperRulePack[]
  routingTarget?: AmneziaHelperRoutingTarget
  lastConnectivityResult?: AmneziaHelperConnectivityResult
  tun?: AmneziaHelperTunSupportSnapshot
  directTunBypass?: DirectTunBypassResolution
  learnedProcessBypass?: LearnedProcessBypassResolution
  bypassCapabilities?: BypassCapabilityReport
  udp?: AmneziaHelperUdpSupportSnapshot
  stability?: AmneziaHelperStabilitySupportSnapshot
  stabilityReport?: AmneziaHelperStabilityReport
}

interface CreateSupportSummaryInput {
  backend: AmneziaHelperBackendSupportSnapshot
  startupPreflight?: AmneziaHelperStartupPreflightResult
  session?: AmneziaHelperSessionSupportSnapshot
  routingTarget?: AmneziaHelperRoutingTarget
  rules: AmneziaHelperRulePacksSupportSummary
  tun?: AmneziaHelperTunSupportSnapshot
  udp?: AmneziaHelperUdpSupportSnapshot
}

const statusPriority: Record<AmneziaHelperSupportSeverity, number> = {
  blocker: 3,
  warning: 2,
  info: 1
}

const defaultRulesByType: Record<AmneziaHelperRuleType, number> = {
  DOMAIN: 0,
  'DOMAIN-SUFFIX': 0,
  'DOMAIN-KEYWORD': 0,
  'IP-CIDR': 0,
  'PROCESS-NAME': 0
}

export function createAmneziaHelperBackendSupportSnapshot(input: {
  backend: ResolvedAmneziaHelperBackend
  helperChecksumSha256?: string
}): AmneziaHelperBackendSupportSnapshot {
  const validation = input.backend.validation
    ? {
        ok: input.backend.validation.ok,
        path: input.backend.validation.path,
        platform: input.backend.validation.platform,
        arch: input.backend.validation.arch,
        issues: input.backend.validation.issues.map((issue) => ({ ...issue })),
        diagnostics: [...input.backend.validation.diagnostics],
        manifest: input.backend.validation.manifest
          ? { ...input.backend.validation.manifest }
          : undefined
      }
    : undefined

  return {
    mode: input.backend.mode,
    kind: input.backend.kind,
    pathSource: input.backend.pathSource,
    available: input.backend.available,
    command: input.backend.command,
    executablePath: input.backend.executablePath,
    diagnostics: [...input.backend.diagnostics],
    validation,
    helperChecksumSha256: input.helperChecksumSha256,
    helperVersion: validation?.manifest?.version
  }
}

export function createAmneziaHelperDiagnosticsBundle(
  input: CreateDiagnosticsBundleInput
): AmneziaHelperDiagnosticsBundle {
  const session = input.session ? createSessionSupportSnapshot(input.session) : undefined
  const rules = createRulePacksSupportSummary(input.rulePacks ?? [])
  const routingTarget = session?.routingTarget ?? input.routingTarget
  const lastConnectivityResult = session?.connectivityResult ?? input.lastConnectivityResult
  const tun =
    input.tun ??
    createTunSupportSnapshot(
      false,
      input.session?.tunBypass,
      undefined,
      undefined,
      input.directTunBypass,
      input.learnedProcessBypass,
      input.bypassCapabilities
    )
  const udp =
    input.udp ??
    createUdpSupportSnapshot(
      session?.udpCapability ??
        input.session?.udpCapability ??
        createInitialAmneziaHelperUdpCapability(input.session?.backendMode)
    )
  const stability = input.stability ?? createStabilitySupportSnapshot(input.stabilityReport)
  const support = createAmneziaHelperSupportSummary({
    backend: input.backend,
    startupPreflight: input.startupPreflight,
    session,
    routingTarget,
    rules,
    tun,
    udp
  })
  const readinessSummary = createAmneziaHelperReadinessSummary({
    backend: input.backend,
    startupPreflight: input.startupPreflight,
    session,
    routingTarget,
    rules,
    tun,
    udp,
    stability,
    support
  })
  const summaryExport = createSupportSummaryExport({
    generatedAt: input.generatedAt ?? Date.now(),
    appVersion: input.appVersion,
    buildId: input.buildId,
    platform: input.platform ?? process.platform,
    arch: input.arch ?? process.arch,
    profileId: input.profileId ?? session?.profileId,
    backend: input.backend,
    startupPreflight: input.startupPreflight,
    session,
    tun,
    udp,
    stability,
    rules,
    support,
    readinessSummary
  })

  return {
    schemaVersion: 1,
    generatedAt: summaryExport.generatedAt,
    app: {
      version: input.appVersion,
      buildId: input.buildId
    },
    platform: {
      platform: input.platform ?? process.platform,
      arch: input.arch ?? process.arch
    },
    profileId: input.profileId ?? session?.profileId,
    backend: input.backend,
    startupPreflight: sanitizeStartupPreflight(input.startupPreflight),
    session,
    readiness: {
      status: session?.readiness ?? 'unknown',
      localEndpoint: session?.localEndpoint ? { ...session.localEndpoint } : undefined
    },
    connectivity: {
      status: session?.connectivityStatus ?? lastConnectivityResult?.status ?? 'unknown',
      validationStage:
        session?.validationStage ?? lastConnectivityResult?.validationStage ?? 'not_started',
      lastResult: cloneConnectivityResult(lastConnectivityResult)
    },
    udp,
    routing: {
      target: cloneRoutingTarget(routingTarget)
    },
    tun,
    rules,
    stability,
    readinessSummary,
    summaryExport,
    logs: sanitizeLogs(input.logs ?? []),
    support
  }
}

export function createAmneziaHelperSupportSummary(
  input: CreateSupportSummaryInput
): AmneziaHelperSupportSummary {
  const statuses = sortStatuses(dedupeStatuses(collectSupportStatuses(input)))
  const effectiveStatuses = statuses.length > 0 ? statuses : [createStatus('helper_not_running')]
  const primaryStatus = effectiveStatuses[0]
  const releaseReadiness = classifySupportReadiness(effectiveStatuses)

  return {
    severity: primaryStatus.severity,
    primaryStatus,
    statuses: effectiveStatuses,
    releaseReadiness
  }
}

export function createSessionSupportSnapshot(
  session: AmneziaHelperSession
): AmneziaHelperSessionSupportSnapshot {
  return {
    profileId: session.profileId,
    sessionId: session.sessionId,
    pid: session.pid,
    status: session.status,
    startedAt: session.startedAt,
    stoppedAt: session.stoppedAt,
    lastError: session.lastError,
    command: session.command,
    argsCount: session.args.length,
    hasTempConfig: Boolean(session.tempConfigPath),
    backendMode: session.backendMode,
    readiness: session.readiness,
    localEndpoint: session.localEndpoint ? { ...session.localEndpoint } : undefined,
    startupDiagnostics: [...session.startupDiagnostics],
    runtimeDiagnostics: session.runtimeDiagnostics.map((diagnostic) => ({
      ...diagnostic,
      details: diagnostic.details ? { ...diagnostic.details } : undefined
    })),
    configStatus: session.configStatus,
    configError: session.configError,
    routingTarget: cloneRoutingTarget(session.routingTarget),
    connectivityStatus: session.connectivityStatus,
    validationStage: session.validationStage,
    lastConnectivityCheckAt: session.lastConnectivityCheckAt,
    lastConnectivityError: session.lastConnectivityError,
    lastConnectivityLatencyMs: session.lastConnectivityLatencyMs,
    connectivityResult: cloneConnectivityResult(session.connectivityResult),
    udpCapability: { ...session.udpCapability },
    lifecycle: {
      desiredState: session.desiredState,
      managedByApp: session.managedByApp,
      restartCount: session.restartCount,
      lastExitReason: session.lastExitReason,
      lastRestartAt: session.lastRestartAt,
      crashLoopDetected: session.crashLoopDetected
    }
  }
}

export function createRulePacksSupportSummary(
  packs: AmneziaHelperRulePack[]
): AmneziaHelperRulePacksSupportSummary {
  const rulesByType = { ...defaultRulesByType }
  let enabledRules = 0
  let totalRules = 0

  for (const pack of packs) {
    for (const rule of pack.rules) {
      totalRules += 1
      if (pack.enabled && rule.enabled) {
        enabledRules += 1
        rulesByType[rule.type] += 1
      }
    }
  }

  return {
    totalPacks: packs.length,
    enabledPacks: packs.filter((pack) => pack.enabled).length,
    totalRules,
    enabledRules,
    rulesByType
  }
}

export function createTunSupportSnapshot(
  enabled: boolean,
  resolution?: AmneziaHelperTunBypassResolution,
  activeResolution?: AmneziaHelperTunBypassResolution,
  ruleReliability?: AmneziaHelperTunRuleReliabilityResult,
  directTunBypass?: DirectTunBypassResolution,
  learnedProcessBypass?: LearnedProcessBypassResolution,
  bypassCapabilities?: BypassCapabilityReport
): AmneziaHelperTunSupportSnapshot {
  const effectiveResolution = resolution ?? activeResolution
  const active = enabled && activeResolution?.status === 'resolved'
  const reliability =
    ruleReliability ??
    evaluateAmneziaHelperTunRuleReliability({
      tunEnabled: enabled,
      dnsHijackEnabled: false,
      dnsEnhancedMode: 'unknown',
      rules: []
    })
  return {
    enabled,
    dnsEnabled: reliability.dnsEnabled,
    dnsHijackEnabled: reliability.dnsHijackEnabled,
    dnsEnhancedMode: reliability.dnsEnhancedMode,
    helperBypassActive: active,
    helperBypassIpsCount: active ? activeResolution.routeExcludeAddresses.length : 0,
    helperBypassResolutionStatus: effectiveResolution?.status ?? 'not_required',
    helperBypassWarnings: effectiveResolution?.warnings ? [...effectiveResolution.warnings] : [],
    helperBypassError: effectiveResolution?.error,
    helperRuleReliability: reliability.reliability,
    helperRuleReliabilityReason: reliability.primaryReason,
    helperRuleReliabilityReasons: [...reliability.reasons],
    helperRuleReliabilityExplanation: reliability.explanation,
    helperRulesHaveDomainRules: reliability.ruleTypes.hasDomainRules,
    helperRulesIpCidrOnly: reliability.ruleTypes.hasIpCidrOnly,
    helperRulesDomainCount: reliability.ruleTypes.domainRuleCount,
    helperRulesIpCidrCount: reliability.ruleTypes.ipCidrRuleCount,
    directExcludeEnabled: directTunBypass?.enabled ?? false,
    directExcludeActive: directTunBypass?.active ?? false,
    directExcludeMode: directTunBypass?.mode ?? 'conservative',
    directExcludeOverallStatus: directTunBypass?.directExcludeOverallStatus ?? 'inactive',
    directExcludeRuleCount: directTunBypass?.directRuleCount ?? 0,
    directExcludeResolvedAddressCount: directTunBypass?.resolvedAddressCount ?? 0,
    directExcludePartialCount: directTunBypass?.partialRuleCount ?? 0,
    directExcludeFailureCount: directTunBypass?.failedRuleCount ?? 0,
    directExcludeWarnings: directTunBypass?.warnings.map((warning) => warning.message) ?? [],
    directTunBypassEnabled: directTunBypass?.enabled ?? false,
    directTunBypassActive: directTunBypass?.active ?? false,
    directTunBypassStatus: directTunBypass?.status ?? 'disabled',
    directTunBypassRuleCount: directTunBypass?.directRuleCount ?? 0,
    directTunBypassResolvedAddressCount: directTunBypass?.resolvedAddressCount ?? 0,
    directTunBypassWarnings: directTunBypass?.warnings.map((warning) => warning.message) ?? [],
    learnedBypassEnabled: learnedProcessBypass?.enabled ?? false,
    learnedBypassActive: learnedProcessBypass?.active ?? false,
    learnedBypassEntryCount: learnedProcessBypass?.entryCount ?? 0,
    learnedBypassProcessCount: learnedProcessBypass?.processCount ?? 0,
    learnedBypassExpiredCount: learnedProcessBypass?.expiredCount ?? 0,
    learnedBypassSupportedOnPlatform: learnedProcessBypass?.supportedOnPlatform ?? false,
    learnedBypassWarnings: learnedProcessBypass?.warnings.map((warning) => warning.message) ?? [],
    learnedBypassOverallStatus: learnedProcessBypass?.status ?? 'inactive',
    nativeProcessBypassEnabled: bypassCapabilities?.nativeProcessBypass.enabled ?? false,
    nativeProcessBypassSupportedOnPlatform:
      bypassCapabilities?.nativeProcessBypass.supportedOnPlatform ?? false,
    nativeProcessBypassActive: bypassCapabilities?.nativeProcessBypass.active ?? false,
    nativeProcessBypassRequiresPrivileges:
      bypassCapabilities?.nativeProcessBypass.requiresPrivileges ?? false,
    nativeProcessBypassRequiresService:
      bypassCapabilities?.nativeProcessBypass.requiresService ?? false,
    nativeProcessBypassStatus: bypassCapabilities?.nativeProcessBypass.status ?? 'disabled',
    nativeProcessBypassMechanism: bypassCapabilities?.nativeProcessBypass.mechanism,
    nativeProcessBypassPlatformMode: bypassCapabilities?.nativeProcessBypass.platformMode,
    nativeProcessBypassNativeDataPlaneActive:
      bypassCapabilities?.nativeProcessBypass.nativeDataPlaneActive ?? false,
    nativeProcessBypassFallbackOnly: bypassCapabilities?.nativeProcessBypass.fallbackOnly ?? false,
    nativeProcessBypassFallbackReason: bypassCapabilities?.nativeProcessBypass.fallbackReason,
    nativeProcessBypassDiagnostics:
      bypassCapabilities?.nativeProcessBypass.diagnostics.map((diagnostic) => diagnostic) ?? [],
    nativeProcessBypassPrerequisiteStatus:
      bypassCapabilities?.nativeProcessBypass.prerequisiteStatus,
    nativeProcessBypassBoundPidCount:
      bypassCapabilities?.nativeProcessBypass.boundPids?.length ?? 0,
    nativeProcessBypassTrackedPidCount:
      bypassCapabilities?.nativeProcessBypass.trackedPids?.length ?? 0,
    nativeProcessBypassNewlyBoundPidCount:
      bypassCapabilities?.nativeProcessBypass.newlyBoundPidCount ?? 0,
    nativeProcessBypassDeadPidCleanupCount:
      bypassCapabilities?.nativeProcessBypass.deadPidCleanupCount ?? 0,
    nativeProcessBypassLastReconcileAt: bypassCapabilities?.nativeProcessBypass.lastReconcileAt,
    nativeProcessBypassReconcileActive:
      bypassCapabilities?.nativeProcessBypass.reconcileActive ?? false,
    nativeProcessBypassReconcileErrors:
      bypassCapabilities?.nativeProcessBypass.reconcileErrors?.map((error) => error) ?? [],
    nativeProcessBypassWindowsServiceAvailable:
      bypassCapabilities?.nativeProcessBypass.windowsServiceAvailable,
    nativeProcessBypassWindowsControllerAvailable:
      bypassCapabilities?.nativeProcessBypass.windowsControllerAvailable,
    nativeProcessBypassWindowsSessionId: bypassCapabilities?.nativeProcessBypass.windowsSessionId,
    nativeProcessBypassWindowsAppliedProcessCount:
      bypassCapabilities?.nativeProcessBypass.windowsAppliedProcessCount,
    processDirectEffectiveBypassMode: getProcessDirectEffectiveBypassMode(bypassCapabilities),
    bypassCapabilityWarnings: bypassCapabilities?.warnings.map((warning) => warning) ?? [],
    bypassCapabilitySummary: bypassCapabilities?.summary ?? {
      trueBypassRuleCount: 0,
      partialBypassRuleCount: 0,
      learnedBypassRuleCount: 0,
      directOnlyRuleCount: 0,
      unsupportedRuleCount: 0,
      processDirectRuleCount: 0
    },
    unsupportedDirectExcludeRules:
      directTunBypass?.unsupportedRules.map((rule) => ({ ...rule })) ?? [],
    unsupportedDirectBypassRules:
      directTunBypass?.unsupportedRules.map((rule) => ({ ...rule })) ?? []
  }
}

export function createUdpSupportSnapshot(
  capability: AmneziaHelperUdpCapability
): AmneziaHelperUdpSupportSnapshot {
  return {
    ...capability,
    runtimeAdvertisesUdp: shouldAdvertiseAmneziaHelperUdp(capability)
  }
}

function getProcessDirectEffectiveBypassMode(report?: BypassCapabilityReport): EffectiveBypassMode {
  const processRules = report?.rules.filter((rule) => rule.ruleType === 'PROCESS-NAME') ?? []
  if (processRules.some((rule) => rule.effectiveBypassMode === 'true_bypass')) {
    return 'true_bypass'
  }
  if (processRules.some((rule) => rule.effectiveBypassMode === 'learned_bypass')) {
    return 'learned_bypass'
  }
  if (processRules.some((rule) => rule.effectiveBypassMode === 'partial_bypass')) {
    return 'partial_bypass'
  }
  if (processRules.some((rule) => rule.effectiveBypassMode === 'unsupported')) {
    return 'unsupported'
  }
  return processRules.length > 0 ? 'direct_only' : 'unsupported'
}

export function createStabilitySupportSnapshot(
  report?: AmneziaHelperStabilityReport
): AmneziaHelperStabilitySupportSnapshot {
  if (!report) return { status: 'unknown' }
  return {
    status: report.summary.status,
    lifecycleStressPassed: report.lifecycleStressPassed,
    reloadResiliencePassed: report.reloadResiliencePassed,
    recoveryPassed: report.recoveryPassed,
    soakDurationMs: report.soakDurationMs,
    repeatedStartStopCount: report.repeatedStartStopCount,
    staleStateDetected: report.staleStateDetected,
    cleanupLeakDetected: report.cleanupLeakDetected,
    summaryMessage: report.summary.message
  }
}

export function createAmneziaHelperReadinessSummary(input: {
  backend: AmneziaHelperBackendSupportSnapshot
  startupPreflight?: AmneziaHelperStartupPreflightResult
  session?: AmneziaHelperSessionSupportSnapshot
  routingTarget?: AmneziaHelperRoutingTarget
  rules: AmneziaHelperRulePacksSupportSummary
  tun: AmneziaHelperTunSupportSnapshot
  udp: AmneziaHelperUdpSupportSnapshot
  stability: AmneziaHelperStabilitySupportSnapshot
  support: AmneziaHelperSupportSummary
}): AmneziaHelperReadinessSummary {
  const helperStatus = classifyHelperComponent(input)
  const tunStatus = classifyTunComponent(input)
  const dnsRuleReliabilityStatus = classifyDnsRuleComponent(input.tun)
  const udpStatus = classifyUdpComponent(input)
  const stabilityStatus = classifyStabilityComponent(input.stability)
  const releaseStatus = input.support.releaseReadiness.status
  const topIssues = collectReadinessIssues({
    ...input,
    helperStatus,
    tunStatus,
    dnsRuleReliabilityStatus,
    udpStatus,
    stabilityStatus
  })
  const recommendedActions = collectRecommendedActions(topIssues, input)
  const componentStatuses = [
    helperStatus,
    tunStatus,
    dnsRuleReliabilityStatus,
    udpStatus,
    stabilityStatus
  ]
  const hasBlocker =
    releaseStatus === 'blocked' ||
    componentStatuses.includes('blocked') ||
    topIssues.some((issue) => issue.severity === 'blocker')
  const hasWarning =
    releaseStatus === 'warning' ||
    componentStatuses.includes('warning') ||
    topIssues.some((issue) => issue.severity === 'warning')

  return {
    overallStatus: hasBlocker
      ? 'blocked'
      : helperStatus === 'unknown'
        ? 'unknown'
        : hasWarning
          ? 'ready_with_warnings'
          : 'ready',
    helperStatus,
    tunStatus,
    dnsRuleReliabilityStatus,
    udpStatus,
    stabilityStatus,
    releaseStatus,
    topIssues,
    recommendedActions
  }
}

export async function writeAmneziaHelperDiagnosticsBundle(
  bundle: AmneziaHelperDiagnosticsBundle,
  outputDir: string
): Promise<AmneziaHelperDiagnosticsExportResult> {
  await mkdir(outputDir, { recursive: true })
  const filename = `amnezia-helper-diagnostics-${new Date(bundle.generatedAt)
    .toISOString()
    .replace(/[:.]/g, '-')}.json`
  const filePath = path.join(outputDir, filename)
  await writeFile(filePath, `${JSON.stringify(bundle, null, 2)}\n`, 'utf-8')
  return {
    path: filePath,
    bundle
  }
}

function classifyHelperComponent(input: {
  backend: AmneziaHelperBackendSupportSnapshot
  session?: AmneziaHelperSessionSupportSnapshot
  support: AmneziaHelperSupportSummary
}): AmneziaHelperReadinessComponentStatus {
  if (!input.backend.available) return 'blocked'
  if (
    input.support.statuses.some(
      (status) =>
        status.severity === 'blocker' &&
        ['helper', 'backend', 'config', 'startup', 'endpoint', 'proxy', 'connectivity'].some(
          (prefix) => status.code.startsWith(prefix)
        )
    )
  ) {
    return 'blocked'
  }

  const session = input.session
  if (!session || session.status === 'idle' || session.status === 'stopped') return 'unknown'
  if (session.status === 'failed' || session.readiness === 'failed') return 'blocked'
  if (session.status === 'running' && session.readiness === 'ready') {
    return session.connectivityStatus === 'verified' ? 'ready' : 'warning'
  }
  if (session.status === 'starting' || session.status === 'stopping') return 'warning'
  return 'unknown'
}

function classifyTunComponent(input: {
  session?: AmneziaHelperSessionSupportSnapshot
  tun: AmneziaHelperTunSupportSnapshot
}): AmneziaHelperReadinessComponentStatus {
  if (!input.tun.enabled) return 'not_applicable'
  if (input.tun.helperBypassResolutionStatus === 'failed') return 'blocked'
  if (input.tun.helperBypassActive) return 'ready'
  if (input.session?.status === 'running' && input.session.readiness === 'ready') return 'warning'
  return 'unknown'
}

function classifyDnsRuleComponent(
  tun: AmneziaHelperTunSupportSnapshot
): AmneziaHelperReadinessComponentStatus {
  if (!tun.enabled || !tun.helperRulesHaveDomainRules) return 'not_applicable'
  if (tun.helperRuleReliability === 'blocked') return 'blocked'
  if (tun.helperRuleReliability === 'degraded' || tun.helperRuleReliability === 'unlikely') {
    return 'warning'
  }
  return 'ready'
}

function classifyUdpComponent(input: {
  session?: AmneziaHelperSessionSupportSnapshot
  udp: AmneziaHelperUdpSupportSnapshot
}): AmneziaHelperReadinessComponentStatus {
  if (!input.session || input.session.status !== 'running' || input.session.readiness !== 'ready') {
    return 'unknown'
  }
  return input.udp.runtimeAdvertisesUdp ? 'ready' : 'warning'
}

function classifyStabilityComponent(
  stability: AmneziaHelperStabilitySupportSnapshot
): AmneziaHelperReadinessComponentStatus {
  switch (stability.status) {
    case 'passed':
      return 'ready'
    case 'failed':
      return 'blocked'
    case 'skipped':
    case 'unknown':
      return 'unknown'
  }
}

function collectReadinessIssues(input: {
  support: AmneziaHelperSupportSummary
  tun: AmneziaHelperTunSupportSnapshot
  udp: AmneziaHelperUdpSupportSnapshot
  stability: AmneziaHelperStabilitySupportSnapshot
  helperStatus: AmneziaHelperReadinessComponentStatus
  tunStatus: AmneziaHelperReadinessComponentStatus
  dnsRuleReliabilityStatus: AmneziaHelperReadinessComponentStatus
  udpStatus: AmneziaHelperReadinessComponentStatus
  stabilityStatus: AmneziaHelperReadinessComponentStatus
}): AmneziaHelperReadinessIssue[] {
  const issues: AmneziaHelperReadinessIssue[] = input.support.statuses
    .filter((status) => status.severity !== 'info')
    .map((status) => ({
      code: status.code,
      severity: status.severity,
      source: sourceForStatusCode(status.code),
      title: status.title,
      message: status.message
    }))

  if (input.stabilityStatus === 'unknown') {
    issues.push({
      code: 'stability_not_validated',
      severity: 'warning',
      source: 'stability',
      title: 'Stability not validated',
      message: 'Long-running helper lifecycle stability has not been validated in this app session.'
    })
  } else if (input.stabilityStatus === 'blocked') {
    issues.push({
      code: 'stability_failed',
      severity: 'blocker',
      source: 'stability',
      title: 'Stability validation failed',
      message:
        input.stability.summaryMessage ?? 'One or more helper lifecycle stability scenarios failed.'
    })
  }

  if (input.tunStatus === 'unknown' && input.tun.enabled) {
    issues.push({
      code: 'tun_not_validated',
      severity: 'warning',
      source: 'tun',
      title: 'TUN readiness not validated',
      message: 'TUN is enabled, but helper TUN readiness has not been proven yet.'
    })
  }

  return sortReadinessIssues(dedupeReadinessIssues(issues)).slice(0, 6)
}

function collectRecommendedActions(
  issues: AmneziaHelperReadinessIssue[],
  input: {
    support: AmneziaHelperSupportSummary
    stability: AmneziaHelperStabilitySupportSnapshot
  }
): AmneziaHelperRecommendedAction[] {
  const actions: AmneziaHelperRecommendedAction[] = []
  const codes = new Set(issues.map((issue) => issue.code))
  const add = (code: string, severity: AmneziaHelperSupportSeverity, message: string): void => {
    if (!actions.some((action) => action.code === code)) {
      actions.push({ code, severity, message })
    }
  }

  if (hasAny(codes, ['helper_missing', 'backend_unavailable'])) {
    add(
      'provide_helper_backend',
      'blocker',
      'Install or package the production Amnezia helper for this desktop platform.'
    )
  }
  if (hasAny(codes, ['helper_permission_denied', 'helper_not_executable'])) {
    add(
      'fix_helper_permissions',
      'blocker',
      'Check helper file permissions and reinstall the packaged app if needed.'
    )
  }
  if (hasAny(codes, ['unsupported_platform', 'unsupported_arch', 'helper_arch_mismatch'])) {
    add(
      'use_matching_helper_build',
      'blocker',
      'Use a helper artifact that matches the current OS and CPU architecture.'
    )
  }
  if (hasAny(codes, ['config_generation_failed'])) {
    add(
      'inspect_imported_profile',
      'blocker',
      'Inspect the imported Amnezia profile fields and re-import if required runtime fields are missing.'
    )
  }
  if (hasAny(codes, ['startup_failed', 'startup_timeout', 'endpoint_unreachable'])) {
    add(
      'inspect_helper_startup',
      'blocker',
      'Inspect helper logs, backend diagnostics, and local security prompts before retrying startup.'
    )
  }
  if (hasAny(codes, ['connectivity_failed', 'proxy_handshake_failed', 'upstream_request_failed'])) {
    add(
      'run_connectivity_test',
      'blocker',
      'Run the connection test again and inspect the reported validation stage.'
    )
  }
  if (codes.has('helper_not_running')) {
    add('start_helper', 'warning', 'Start the helper and wait for the local proxy to become ready.')
  }
  if (codes.has('proxy_ready_not_validated')) {
    add('test_connection', 'warning', 'Run Test connection to verify the helper proxy path.')
  }
  if (hasAny(codes, ['helper_rules_inactive', 'routing_target_unavailable'])) {
    add(
      'wait_for_routing_target',
      'warning',
      'Start the helper and wait until the AMNEZIA_HELPER routing target is injected.'
    )
  }
  if (hasAny(codes, ['tun_blocked_for_helper', 'tun_at_risk', 'tun_not_validated'])) {
    add(
      'verify_tun_bypass',
      codes.has('tun_blocked_for_helper') ? 'blocker' : 'warning',
      'Verify helper upstream bypass resolution before relying on TUN mode.'
    )
  }
  if (
    hasAny(codes, [
      'tun_domain_rules_blocked',
      'tun_domain_rules_degraded',
      'tun_domain_rules_unlikely'
    ])
  ) {
    add(
      'fix_tun_dns_rules',
      codes.has('tun_domain_rules_blocked') ? 'blocker' : 'warning',
      'Use fake-ip DNS hijack for domain rules under TUN, or prefer IP-CIDR helper rules.'
    )
  }
  if (codes.has('udp_tcp_only')) {
    add(
      'treat_udp_as_tcp_only',
      'warning',
      'Treat AMNEZIA_HELPER as TCP-only until UDP support is validated.'
    )
  }
  if (hasAny(codes, ['direct_tun_bypass_partial', 'direct_tun_bypass_blocked'])) {
    add(
      'inspect_direct_tun_bypass',
      'warning',
      'Use IP-CIDR or exact DOMAIN DIRECT rules for TUN bypass, and inspect unresolved or unsupported rules.'
    )
  }
  if (codes.has('direct_process_name_bypass_unsupported')) {
    add(
      'avoid_process_direct_bypass',
      'warning',
      'PROCESS-NAME DIRECT cannot exclude an app from TUN at the route layer; use VPN/PROXY or explicit IP-CIDR/DOMAIN DIRECT excludes.'
    )
  }
  if (hasAny(codes, ['learned_process_bypass_observing', 'learned_process_bypass_stale'])) {
    add(
      'wait_for_learned_process_bypass',
      'warning',
      'Generate matching PROCESS-NAME DIRECT traffic once, or prefer explicit IP-CIDR/DOMAIN DIRECT excludes for deterministic TUN bypass.'
    )
  }
  if (codes.has('learned_process_bypass_unsupported')) {
    add(
      'use_explicit_direct_excludes',
      'warning',
      'This platform cannot use learned process bypass; use explicit IP-CIDR or DOMAIN DIRECT excludes.'
    )
  }
  if (hasAny(codes, ['native_process_bypass_available', 'native_process_bypass_blocked'])) {
    add(
      'inspect_native_process_bypass',
      'warning',
      'Native process bypass requires platform-specific privileged support before it can replace learned bypass.'
    )
  }
  if (
    hasAny(codes, [
      'windows_native_bypass_scaffold',
      'windows_native_bypass_prereq_blocked',
      'windows_native_bypass_apply_failed'
    ])
  ) {
    add(
      'prepare_windows_wfp_service',
      'warning',
      'Windows PROCESS-NAME native bypass needs the signed WFP helper service and controller; use learned or address-based DIRECT bypass until that data plane is active.'
    )
  }
  if (codes.has('macos_native_bypass_fallback_only')) {
    add(
      'use_macos_fallback_bypass',
      'warning',
      'macOS PROCESS-NAME DIRECT is fallback-only; prefer DOMAIN/IP-CIDR DIRECT excludes or learned process-to-IP bypass.'
    )
  }
  if (codes.has('stability_not_validated')) {
    add(
      'run_stability_smoke',
      'warning',
      'Run packaged smoke with --stability before claiming long-running helper readiness.'
    )
  }
  if (codes.has('stability_failed')) {
    add(
      'inspect_stability_report',
      'blocker',
      'Inspect the stability report for stale routing state, cleanup leaks, or failed reload scenarios.'
    )
  }

  if (actions.length === 0 && input.support.releaseReadiness.status === 'supported') {
    add('no_action_required', 'info', 'No immediate helper action is required.')
  }

  return actions.slice(0, 5)
}

function sourceForStatusCode(
  code: AmneziaHelperSupportStatusCode
): AmneziaHelperReadinessIssueSource {
  if (code.startsWith('tun_')) return code.includes('domain_rules') ? 'dns' : 'tun'
  if (code.startsWith('direct_tun_') || code.startsWith('direct_process_')) return 'tun'
  if (code.startsWith('learned_process_')) return 'tun'
  if (code.startsWith('native_process_')) return 'tun'
  if (code.startsWith('windows_native_') || code.startsWith('macos_native_')) return 'tun'
  if (code.startsWith('udp_')) return 'udp'
  if (code.includes('routing') || code.includes('rules')) return 'helper'
  if (code.includes('helper') || code.includes('backend') || code.includes('startup')) {
    return 'helper'
  }
  if (code.includes('connectivity') || code.includes('endpoint') || code.includes('proxy')) {
    return 'helper'
  }
  return 'release'
}

function sortReadinessIssues(issues: AmneziaHelperReadinessIssue[]): AmneziaHelperReadinessIssue[] {
  return [...issues].sort((a, b) => statusPriority[b.severity] - statusPriority[a.severity])
}

function dedupeReadinessIssues(
  issues: AmneziaHelperReadinessIssue[]
): AmneziaHelperReadinessIssue[] {
  const result: AmneziaHelperReadinessIssue[] = []
  const seen = new Set<string>()
  for (const issue of issues) {
    if (seen.has(issue.code)) continue
    seen.add(issue.code)
    result.push(issue)
  }
  return result
}

function createSupportSummaryExport(input: {
  generatedAt: number
  appVersion?: string
  buildId?: string
  platform: string
  arch: string
  profileId?: string
  backend: AmneziaHelperBackendSupportSnapshot
  startupPreflight?: AmneziaHelperStartupPreflightResult
  session?: AmneziaHelperSessionSupportSnapshot
  tun: AmneziaHelperTunSupportSnapshot
  udp: AmneziaHelperUdpSupportSnapshot
  stability: AmneziaHelperStabilitySupportSnapshot
  rules: AmneziaHelperRulePacksSupportSummary
  support: AmneziaHelperSupportSummary
  readinessSummary: AmneziaHelperReadinessSummary
}): AmneziaHelperSupportSummaryExport {
  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    app: {
      version: input.appVersion,
      buildId: input.buildId
    },
    platform: {
      platform: input.platform,
      arch: input.arch
    },
    profileId: input.profileId,
    readinessSummary: input.readinessSummary,
    backend: {
      mode: input.backend.mode,
      kind: input.backend.kind,
      available: input.backend.available,
      helperVersion: input.backend.helperVersion,
      helperChecksumPrefix: input.backend.helperChecksumSha256?.slice(0, 12)
    },
    startupPreflight: createSummaryExportPreflight(input.startupPreflight),
    helper: {
      status: input.session?.status,
      readiness: input.session?.readiness,
      connectivityStatus: input.session?.connectivityStatus,
      validationStage: input.session?.validationStage,
      backendMode: input.session?.backendMode
    },
    tun: {
      enabled: input.tun.enabled,
      dnsHijackEnabled: input.tun.dnsHijackEnabled,
      dnsEnhancedMode: input.tun.dnsEnhancedMode,
      helperBypassActive: input.tun.helperBypassActive,
      helperBypassIpsCount: input.tun.helperBypassIpsCount,
      helperBypassResolutionStatus: input.tun.helperBypassResolutionStatus,
      directExcludeEnabled: input.tun.directExcludeEnabled,
      directExcludeActive: input.tun.directExcludeActive,
      directExcludeMode: input.tun.directExcludeMode,
      directExcludeOverallStatus: input.tun.directExcludeOverallStatus,
      directExcludeRuleCount: input.tun.directExcludeRuleCount,
      directExcludeResolvedAddressCount: input.tun.directExcludeResolvedAddressCount,
      directExcludePartialCount: input.tun.directExcludePartialCount,
      directExcludeFailureCount: input.tun.directExcludeFailureCount,
      directTunBypassEnabled: input.tun.directTunBypassEnabled,
      directTunBypassActive: input.tun.directTunBypassActive,
      directTunBypassStatus: input.tun.directTunBypassStatus,
      directTunBypassRuleCount: input.tun.directTunBypassRuleCount,
      directTunBypassResolvedAddressCount: input.tun.directTunBypassResolvedAddressCount,
      learnedBypassEnabled: input.tun.learnedBypassEnabled,
      learnedBypassActive: input.tun.learnedBypassActive,
      learnedBypassOverallStatus: input.tun.learnedBypassOverallStatus,
      learnedBypassEntryCount: input.tun.learnedBypassEntryCount,
      learnedBypassProcessCount: input.tun.learnedBypassProcessCount,
      learnedBypassExpiredCount: input.tun.learnedBypassExpiredCount,
      nativeProcessBypassEnabled: input.tun.nativeProcessBypassEnabled,
      nativeProcessBypassSupportedOnPlatform: input.tun.nativeProcessBypassSupportedOnPlatform,
      nativeProcessBypassActive: input.tun.nativeProcessBypassActive,
      nativeProcessBypassStatus: input.tun.nativeProcessBypassStatus,
      nativeProcessBypassPlatformMode: input.tun.nativeProcessBypassPlatformMode,
      nativeProcessBypassNativeDataPlaneActive: input.tun.nativeProcessBypassNativeDataPlaneActive,
      nativeProcessBypassFallbackOnly: input.tun.nativeProcessBypassFallbackOnly,
      nativeProcessBypassFallbackReason: input.tun.nativeProcessBypassFallbackReason,
      nativeProcessBypassTrackedPidCount: input.tun.nativeProcessBypassTrackedPidCount,
      nativeProcessBypassNewlyBoundPidCount: input.tun.nativeProcessBypassNewlyBoundPidCount,
      nativeProcessBypassDeadPidCleanupCount: input.tun.nativeProcessBypassDeadPidCleanupCount,
      nativeProcessBypassLastReconcileAt: input.tun.nativeProcessBypassLastReconcileAt,
      nativeProcessBypassReconcileActive: input.tun.nativeProcessBypassReconcileActive,
      nativeProcessBypassWindowsServiceAvailable:
        input.tun.nativeProcessBypassWindowsServiceAvailable,
      nativeProcessBypassWindowsControllerAvailable:
        input.tun.nativeProcessBypassWindowsControllerAvailable,
      nativeProcessBypassWindowsAppliedProcessCount:
        input.tun.nativeProcessBypassWindowsAppliedProcessCount,
      processDirectEffectiveBypassMode: input.tun.processDirectEffectiveBypassMode,
      helperRuleReliability: input.tun.helperRuleReliability,
      helperRuleReliabilityReason: input.tun.helperRuleReliabilityReason
    },
    udp: { ...input.udp },
    stability: { ...input.stability },
    rules: {
      ...input.rules,
      rulesByType: { ...input.rules.rulesByType }
    },
    supportStatusCodes: input.support.statuses.map((status) => status.code)
  }
}

function hasAny(values: Set<string>, candidates: string[]): boolean {
  return candidates.some((candidate) => values.has(candidate))
}

export async function checksumFileIfPresent(filePath: string): Promise<string | undefined> {
  if (!filePath) return undefined
  try {
    const content = await readFile(filePath)
    return createHash('sha256').update(content).digest('hex')
  } catch {
    return undefined
  }
}

function collectSupportStatuses(input: CreateSupportSummaryInput): AmneziaHelperSupportStatus[] {
  const statuses: AmneziaHelperSupportStatus[] = []
  const tun = input.tun ?? createTunSupportSnapshot(false)
  const udp =
    input.udp ??
    createUdpSupportSnapshot(
      input.session?.udpCapability ??
        createInitialAmneziaHelperUdpCapability(input.session?.backendMode)
    )

  if (input.startupPreflight) {
    statuses.push(
      ...input.startupPreflight.blockingReasons.map((reason) =>
        createStatus(mapPreflightReasonCode(reason.code), {
          stage: reason.stage,
          message: reason.message
        })
      )
    )
  }

  if (!input.backend.available) {
    const issues = input.backend.validation?.issues ?? []
    if (issues.length === 0) {
      statuses.push(createStatus('backend_unavailable'))
    } else {
      statuses.push(...issues.map((issue) => createStatus(mapValidationIssueCode(issue))))
    }
  }

  if (input.backend.pathSource === 'override') {
    statuses.push(createStatus('helper_dev_override'))
  }

  if (input.session) {
    if (input.session.lifecycle.crashLoopDetected) {
      statuses.push(
        createStatus('helper_crash_loop', {
          restartCount: input.session.lifecycle.restartCount,
          message: input.session.lastError ?? ''
        })
      )
    }
    statuses.push(
      ...input.session.runtimeDiagnostics.map((diagnostic) =>
        createStatus(mapRuntimeDiagnosticCategory(diagnostic.category), {
          stage: diagnostic.stage,
          message: diagnostic.message
        })
      )
    )

    if (input.session.configStatus === 'failed') {
      statuses.push(
        createStatus('config_generation_failed', {
          message: input.session.configError ?? input.session.lastError ?? ''
        })
      )
    }

    if (input.session.status === 'failed') {
      statuses.push(
        createStatus('startup_failed', {
          message: input.session.lastError ?? ''
        })
      )
    } else if (input.session.status === 'restarting') {
      statuses.push(
        createStatus('helper_restarting', {
          restartCount: input.session.lifecycle.restartCount
        })
      )
    } else if (input.session.status === 'starting' || input.session.status === 'stopping') {
      statuses.push(createStatus('helper_starting'))
    } else if (input.session.status === 'running') {
      if (input.session.readiness === 'ready') {
        if (input.session.connectivityStatus === 'verified') {
          statuses.push(createStatus('helper_ready_validated'))
        } else if (input.session.connectivityStatus === 'failed') {
          statuses.push(
            createStatus('connectivity_failed', {
              message: input.session.lastConnectivityError ?? ''
            })
          )
        } else {
          statuses.push(createStatus('proxy_ready_not_validated'))
        }
      } else if (input.session.readiness === 'checking') {
        statuses.push(createStatus('helper_starting'))
      } else if (input.session.readiness === 'failed') {
        statuses.push(
          createStatus('endpoint_unreachable', {
            message: input.session.lastError ?? ''
          })
        )
      } else {
        statuses.push(createStatus('proxy_ready_not_validated'))
      }
    } else {
      statuses.push(createStatus('helper_not_running'))
    }
    if (input.session.lifecycle.managedByApp) {
      statuses.push(createStatus('helper_managed_by_app'))
    }
  } else {
    statuses.push(createStatus('helper_not_running'))
  }

  if (
    input.rules.enabledRules > 0 &&
    (!input.routingTarget || input.routingTarget.status !== 'injected')
  ) {
    statuses.push(
      createStatus('helper_rules_inactive', {
        enabledRules: input.rules.enabledRules
      })
    )
  } else if (
    input.session?.status === 'running' &&
    input.session.readiness === 'ready' &&
    input.routingTarget?.status !== 'injected'
  ) {
    statuses.push(createStatus('routing_target_unavailable'))
  }

  if (tun.enabled && input.session?.status === 'running') {
    if (tun.helperBypassActive) {
      statuses.push(
        createStatus('tun_compatible', {
          helperBypassIpsCount: tun.helperBypassIpsCount
        })
      )
    } else if (tun.helperBypassResolutionStatus === 'failed') {
      statuses.push(
        createStatus('tun_blocked_for_helper', {
          message: tun.helperBypassError ?? ''
        })
      )
    } else if (input.session.readiness === 'ready') {
      statuses.push(createStatus('tun_at_risk'))
    }
  }

  if (tun.enabled && tun.helperRulesHaveDomainRules) {
    if (tun.helperRuleReliability === 'blocked') {
      statuses.push(
        createStatus('tun_domain_rules_blocked', {
          reason: tun.helperRuleReliabilityReason
        })
      )
    } else if (tun.helperRuleReliability === 'unlikely') {
      statuses.push(
        createStatus('tun_domain_rules_unlikely', {
          reason: tun.helperRuleReliabilityReason
        })
      )
    } else if (tun.helperRuleReliability === 'degraded') {
      statuses.push(
        createStatus('tun_domain_rules_degraded', {
          reason: tun.helperRuleReliabilityReason
        })
      )
    }
  }

  if (tun.enabled && tun.directTunBypassEnabled) {
    if (tun.directTunBypassActive && tun.directTunBypassWarnings.length === 0) {
      statuses.push(
        createStatus('direct_tun_bypass_active', {
          rules: tun.directTunBypassRuleCount,
          addresses: tun.directTunBypassResolvedAddressCount
        })
      )
    } else if (tun.directTunBypassActive) {
      statuses.push(
        createStatus('direct_tun_bypass_partial', {
          rules: tun.directTunBypassRuleCount,
          addresses: tun.directTunBypassResolvedAddressCount
        })
      )
    } else if (tun.directTunBypassRuleCount > 0 && tun.directTunBypassStatus === 'failed') {
      statuses.push(
        createStatus('direct_tun_bypass_blocked', {
          rules: tun.directTunBypassRuleCount
        })
      )
    }

    if (
      tun.unsupportedDirectBypassRules.some(
        (rule) => rule.reasonCode === 'process_name_unsupported'
      )
    ) {
      statuses.push(
        createStatus('direct_process_name_bypass_unsupported', {
          unsupportedRules: tun.unsupportedDirectBypassRules.length
        })
      )
    }
  }

  if (tun.enabled && tun.learnedBypassEnabled) {
    if (tun.learnedBypassOverallStatus === 'active') {
      statuses.push(
        createStatus('learned_process_bypass_active', {
          entries: tun.learnedBypassEntryCount,
          processes: tun.learnedBypassProcessCount
        })
      )
    } else if (tun.learnedBypassOverallStatus === 'observing') {
      statuses.push(createStatus('learned_process_bypass_observing'))
    } else if (tun.learnedBypassOverallStatus === 'stale') {
      statuses.push(
        createStatus('learned_process_bypass_stale', {
          expiredEntries: tun.learnedBypassExpiredCount
        })
      )
    } else if (tun.learnedBypassOverallStatus === 'unsupported') {
      statuses.push(createStatus('learned_process_bypass_unsupported'))
    }
  }

  if (tun.enabled && tun.bypassCapabilitySummary.processDirectRuleCount > 0) {
    if (
      tun.nativeProcessBypassPlatformMode === 'windows_wfp_service' ||
      tun.nativeProcessBypassPlatformMode === 'windows_scaffold'
    ) {
      if (tun.nativeProcessBypassActive && tun.nativeProcessBypassNativeDataPlaneActive) {
        statuses.push(createStatus('windows_native_bypass_active'))
      } else if (
        tun.nativeProcessBypassStatus === 'blocked' &&
        tun.nativeProcessBypassDiagnostics.some(
          (diagnostic) =>
            diagnostic.includes('windows_apply_failed') ||
            diagnostic.includes('windows_data_plane_inactive')
        )
      ) {
        statuses.push(createStatus('windows_native_bypass_apply_failed'))
      } else if (tun.nativeProcessBypassStatus === 'blocked') {
        statuses.push(createStatus('windows_native_bypass_prereq_blocked'))
      } else {
        statuses.push(createStatus('windows_native_bypass_scaffold'))
      }
    } else if (tun.nativeProcessBypassPlatformMode === 'macos_fallback_only') {
      statuses.push(createStatus('macos_native_bypass_fallback_only'))
    } else if (tun.nativeProcessBypassActive) {
      statuses.push(createStatus('native_process_bypass_active'))
    } else if (tun.nativeProcessBypassEnabled && tun.nativeProcessBypassStatus === 'available') {
      statuses.push(createStatus('native_process_bypass_available'))
    } else if (tun.nativeProcessBypassEnabled && tun.nativeProcessBypassStatus === 'blocked') {
      statuses.push(createStatus('native_process_bypass_blocked'))
    } else if (!tun.nativeProcessBypassSupportedOnPlatform) {
      statuses.push(createStatus('native_process_bypass_unsupported'))
    }
  }

  if (input.session?.status === 'running' && input.session.readiness === 'ready') {
    if (udp.runtimeAdvertisesUdp) {
      statuses.push(createStatus('udp_supported'))
    } else {
      statuses.push(
        createStatus('udp_tcp_only', {
          reason: udp.udpReasonCode
        })
      )
    }
  }

  return statuses
}

function mapPreflightReasonCode(
  code: AmneziaHelperStartupPreflightReasonCode
): AmneziaHelperSupportStatusCode {
  switch (code) {
    case 'helper_binary_missing':
      return 'helper_missing'
    case 'helper_binary_permission_denied':
      return 'helper_permission_denied'
    case 'helper_binary_not_executable':
      return 'helper_not_executable'
    case 'unsupported_platform':
      return 'unsupported_platform'
    case 'unsupported_arch':
      return 'unsupported_arch'
    case 'helper_binary_platform_mismatch':
    case 'helper_binary_arch_mismatch':
      return 'helper_arch_mismatch'
    case 'backend_unavailable':
      return 'backend_unavailable'
    case 'tun_bypass_resolution_failure':
      return 'tun_blocked_for_helper'
    case 'missing_execution_plan':
    case 'missing_helper_descriptor':
    case 'unsupported_execution_plan':
    case 'runtime_config_generation_failed':
    case 'production_config_generation_failed':
    case 'unsupported_profile_protocol':
    case 'missing_endpoint':
    case 'missing_keys':
    case 'missing_allowed_ips':
    case 'missing_interface_address':
    case 'invalid_local_proxy':
    default:
      return 'config_generation_failed'
  }
}

function mapValidationIssueCode(
  issue: AmneziaHelperExecutableValidationIssue
): AmneziaHelperSupportStatusCode {
  switch (issue.code) {
    case 'missing':
      return 'helper_missing'
    case 'permission_denied':
      return 'helper_permission_denied'
    case 'not_file':
      return 'helper_not_executable'
    case 'unsupported_platform':
      return 'unsupported_platform'
    case 'unsupported_arch':
      return 'unsupported_arch'
    case 'arch_mismatch':
      return 'helper_arch_mismatch'
    default:
      return 'backend_unavailable'
  }
}

function mapRuntimeDiagnosticCategory(category: string): AmneziaHelperSupportStatusCode {
  switch (category) {
    case 'backend_unavailable':
      return 'backend_unavailable'
    case 'backend_permission_denied':
      return 'helper_permission_denied'
    case 'backend_not_executable':
      return 'helper_not_executable'
    case 'unsupported_platform':
      return 'unsupported_platform'
    case 'unsupported_arch':
      return 'unsupported_arch'
    case 'backend_arch_mismatch':
      return 'helper_arch_mismatch'
    case 'config_generation_failure':
      return 'config_generation_failed'
    case 'tun_bypass_resolution_failure':
      return 'tun_blocked_for_helper'
    case 'startup_timeout':
      return 'startup_timeout'
    case 'endpoint_unreachable':
      return 'endpoint_unreachable'
    case 'proxy_handshake_failure':
      return 'proxy_handshake_failed'
    case 'upstream_request_failure':
      return 'upstream_request_failed'
    case 'validation_timeout':
      return 'validation_timeout'
    case 'backend_spawn_failure':
    default:
      return 'startup_failed'
  }
}

function createStatus(
  code: AmneziaHelperSupportStatusCode,
  details?: Record<string, string | number | boolean>
): AmneziaHelperSupportStatus {
  const definition = statusDefinitions[code]
  return {
    code,
    severity: definition.severity,
    title: definition.title,
    message: definition.message,
    details: details ? compactDetails(details) : undefined
  }
}

const statusDefinitions: Record<
  AmneziaHelperSupportStatusCode,
  { severity: AmneziaHelperSupportSeverity; title: string; message: string }
> = {
  helper_missing: {
    severity: 'blocker',
    title: 'Helper backend is missing',
    message: 'The production Amnezia helper executable could not be found.'
  },
  helper_permission_denied: {
    severity: 'blocker',
    title: 'Helper backend cannot be executed',
    message: 'The helper exists, but the current user or package permissions prevent execution.'
  },
  helper_not_executable: {
    severity: 'blocker',
    title: 'Helper path is invalid',
    message: 'The resolved helper path is not an executable file.'
  },
  unsupported_platform: {
    severity: 'blocker',
    title: 'Unsupported platform',
    message: 'This desktop platform is not supported by the Amnezia helper build.'
  },
  unsupported_arch: {
    severity: 'blocker',
    title: 'Unsupported architecture',
    message: 'This CPU architecture is not supported by the Amnezia helper build.'
  },
  helper_arch_mismatch: {
    severity: 'blocker',
    title: 'Helper build mismatch',
    message: 'The resolved helper artifact does not match the current platform or architecture.'
  },
  backend_unavailable: {
    severity: 'blocker',
    title: 'Helper backend unavailable',
    message: 'The helper backend could not be resolved or validated.'
  },
  config_generation_failed: {
    severity: 'blocker',
    title: 'Helper config generation failed',
    message: 'The imported Amnezia profile could not be converted to helper runtime config.'
  },
  startup_failed: {
    severity: 'blocker',
    title: 'Helper startup failed',
    message: 'The helper process failed to start or exited unexpectedly.'
  },
  startup_timeout: {
    severity: 'blocker',
    title: 'Helper startup timed out',
    message: 'The helper process did not become ready before the startup timeout.'
  },
  endpoint_unreachable: {
    severity: 'blocker',
    title: 'Local proxy endpoint unreachable',
    message: 'The helper did not expose a reachable local proxy endpoint.'
  },
  proxy_handshake_failed: {
    severity: 'blocker',
    title: 'Proxy handshake failed',
    message: 'The local proxy endpoint is reachable, but the SOCKS5 handshake failed.'
  },
  upstream_request_failed: {
    severity: 'blocker',
    title: 'Upstream request failed',
    message: 'The helper proxy handshake worked, but the upstream validation request failed.'
  },
  validation_timeout: {
    severity: 'blocker',
    title: 'Connectivity validation timed out',
    message: 'The helper connectivity validation did not finish before the timeout.'
  },
  connectivity_failed: {
    severity: 'blocker',
    title: 'Connectivity validation failed',
    message: 'The helper started, but the latest proxy connectivity validation failed.'
  },
  helper_not_running: {
    severity: 'warning',
    title: 'Helper is not running',
    message: 'The profile is imported, but no helper runtime session is active.'
  },
  helper_starting: {
    severity: 'info',
    title: 'Helper is starting',
    message: 'The helper process is being started or stopped.'
  },
  helper_managed_by_app: {
    severity: 'info',
    title: 'Helper managed by app',
    message: 'Koala Clash owns this helper process lifecycle for the active VPN profile.'
  },
  helper_restarting: {
    severity: 'warning',
    title: 'Helper is restarting',
    message: 'The helper exited unexpectedly and Koala Clash is attempting a bounded restart.'
  },
  helper_crash_loop: {
    severity: 'blocker',
    title: 'Helper crash loop detected',
    message: 'The helper exited repeatedly and automatic restarts were stopped.'
  },
  helper_dev_override: {
    severity: 'warning',
    title: 'Development helper override active',
    message: 'The helper executable is resolved from KOALA_AMNEZIA_HELPER_BACKEND_PATH.'
  },
  proxy_ready_not_validated: {
    severity: 'warning',
    title: 'Proxy is ready but not validated',
    message: 'The local proxy endpoint is reachable, but end-to-end validation has not passed yet.'
  },
  helper_ready_validated: {
    severity: 'info',
    title: 'Helper ready and validated',
    message: 'The helper proxy endpoint is ready and the latest connectivity validation passed.'
  },
  helper_rules_inactive: {
    severity: 'warning',
    title: 'Helper rules are inactive',
    message: 'Enabled helper rules exist, but the AMNEZIA_HELPER routing target is not injected.'
  },
  routing_target_unavailable: {
    severity: 'warning',
    title: 'Routing target unavailable',
    message:
      'The helper is ready, but the transient Mihomo routing target is not currently injected.'
  },
  tun_compatible: {
    severity: 'info',
    title: 'TUN compatible',
    message: 'The helper upstream endpoint is excluded from Mihomo TUN routing.'
  },
  tun_at_risk: {
    severity: 'warning',
    title: 'TUN route bypass is not active',
    message:
      'TUN is enabled and the helper is ready, but no helper upstream route exclusion is active.'
  },
  tun_blocked_for_helper: {
    severity: 'blocker',
    title: 'TUN blocked for helper',
    message:
      'TUN is enabled, but the helper upstream endpoint could not be resolved for safe route exclusion.'
  },
  tun_domain_rules_degraded: {
    severity: 'warning',
    title: 'TUN helper domain rules degraded',
    message:
      'AMNEZIA_HELPER domain rules may not match reliably under the current TUN DNS settings.'
  },
  tun_domain_rules_unlikely: {
    severity: 'warning',
    title: 'TUN helper domain rules unlikely',
    message:
      'AMNEZIA_HELPER domain rules are unlikely to match because TUN DNS capture is incomplete.'
  },
  tun_domain_rules_blocked: {
    severity: 'blocker',
    title: 'TUN helper domain rules blocked',
    message:
      'AMNEZIA_HELPER domain rules cannot be considered safe under the current TUN DNS settings.'
  },
  direct_tun_bypass_active: {
    severity: 'info',
    title: 'DIRECT exclude active',
    message: 'Supported DIRECT rules are injected as transient TUN route exclusions.'
  },
  direct_tun_bypass_partial: {
    severity: 'warning',
    title: 'DIRECT exclude partial',
    message:
      'Some DIRECT rules were translated into TUN route exclusions, but unresolved or unsupported rules remain.'
  },
  direct_tun_bypass_blocked: {
    severity: 'warning',
    title: 'DIRECT exclude unavailable',
    message: 'DIRECT rules exist, but none could be safely translated into TUN route exclusions.'
  },
  direct_process_name_bypass_unsupported: {
    severity: 'warning',
    title: 'PROCESS-NAME cannot create DIRECT exclude',
    message:
      'PROCESS-NAME DIRECT keeps Mihomo DIRECT behavior, but it cannot exclude the process from TUN routing at the route layer.'
  },
  learned_process_bypass_active: {
    severity: 'info',
    title: 'Learned process bypass active',
    message:
      'Observed PROCESS-NAME DIRECT destinations are being injected as temporary TUN route exclusions.'
  },
  learned_process_bypass_observing: {
    severity: 'warning',
    title: 'Learned process bypass observing',
    message:
      'PROCESS-NAME DIRECT rules exist, but no matching destination IPs have been observed yet.'
  },
  learned_process_bypass_stale: {
    severity: 'warning',
    title: 'Learned process bypass stale',
    message:
      'Previously observed PROCESS-NAME DIRECT destinations expired and are no longer injected.'
  },
  learned_process_bypass_unsupported: {
    severity: 'warning',
    title: 'Learned process bypass unsupported',
    message: 'This desktop platform does not support learned process-to-IP bypass observation.'
  },
  native_process_bypass_available: {
    severity: 'warning',
    title: 'Native process bypass available',
    message: 'Native process bypass capability is detected, but it is not active yet.'
  },
  native_process_bypass_active: {
    severity: 'info',
    title: 'Native process bypass active',
    message: 'PROCESS-NAME DIRECT rules are covered by native OS-level bypass.'
  },
  native_process_bypass_unsupported: {
    severity: 'warning',
    title: 'Native process bypass unsupported',
    message:
      'Native process bypass is currently Linux-first; this platform falls back to learned bypass.'
  },
  native_process_bypass_blocked: {
    severity: 'warning',
    title: 'Native process bypass blocked',
    message:
      'Native process bypass was requested, but privileged Linux cgroup/fwmark setup is not active.'
  },
  windows_native_bypass_scaffold: {
    severity: 'warning',
    title: 'Windows native bypass available',
    message:
      'Windows PROCESS-NAME native bypass needs the WFP service/controller to apply its data plane before it becomes true bypass.'
  },
  windows_native_bypass_prereq_blocked: {
    severity: 'warning',
    title: 'Windows native bypass prerequisites missing',
    message:
      'Windows PROCESS-NAME native bypass needs elevation, KoalaProcessBypass service, and koala-process-bypassctl controller before it can become true bypass.'
  },
  windows_native_bypass_active: {
    severity: 'info',
    title: 'Windows native bypass active',
    message: 'The Windows WFP helper service reported an active process-aware bypass data plane.'
  },
  windows_native_bypass_apply_failed: {
    severity: 'warning',
    title: 'Windows native bypass apply failed',
    message:
      'The Windows WFP helper service/controller was found, but it did not confirm an active bypass data plane.'
  },
  macos_native_bypass_fallback_only: {
    severity: 'warning',
    title: 'macOS native bypass fallback-only',
    message:
      'macOS PROCESS-NAME DIRECT does not have a true native bypass path in this architecture; address-based and learned bypass are used as fallback.'
  },
  udp_supported: {
    severity: 'info',
    title: 'UDP support validated',
    message: 'The helper local proxy accepted SOCKS5 UDP ASSOCIATE and UDP is advertised.'
  },
  udp_tcp_only: {
    severity: 'warning',
    title: 'Helper routing is TCP-only',
    message:
      'UDP support is not validated for the helper path, so AMNEZIA_HELPER is advertised as TCP-only.'
  }
}

function compactDetails(
  details: Record<string, string | number | boolean>
): Record<string, string | number | boolean> | undefined {
  const result: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(details)) {
    if (value !== '') result[key] = value
  }
  return Object.keys(result).length > 0 ? result : undefined
}

function dedupeStatuses(statuses: AmneziaHelperSupportStatus[]): AmneziaHelperSupportStatus[] {
  const result: AmneziaHelperSupportStatus[] = []
  const seen = new Set<AmneziaHelperSupportStatusCode>()
  for (const status of statuses) {
    if (seen.has(status.code)) continue
    seen.add(status.code)
    result.push(status)
  }
  return result
}

function sortStatuses(statuses: AmneziaHelperSupportStatus[]): AmneziaHelperSupportStatus[] {
  return [...statuses].sort((a, b) => statusPriority[b.severity] - statusPriority[a.severity])
}

function classifySupportReadiness(
  statuses: AmneziaHelperSupportStatus[]
): AmneziaHelperReleaseReadinessSummary {
  const blockers = statuses
    .filter((status) => status.severity === 'blocker')
    .map((status) => status.code)
  const warnings = statuses
    .filter((status) => status.severity === 'warning')
    .map((status) => status.code)

  return {
    status: blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'warning' : 'supported',
    blockers,
    warnings
  }
}

function sanitizeLogs(logs: AmneziaHelperLogEntry[]): AmneziaHelperLogEntry[] {
  return logs.slice(-100).map((entry) => ({
    at: entry.at,
    stream: entry.stream,
    message: entry.message.slice(0, 2000)
  }))
}

function sanitizeStartupPreflight(
  preflight: AmneziaHelperStartupPreflightResult | undefined
): AmneziaHelperStartupPreflightResult | undefined {
  if (!preflight) return undefined
  return {
    ...preflight,
    blockingReasons: preflight.blockingReasons.map(clonePreflightReason),
    warnings: preflight.warnings.map(clonePreflightReason),
    backend: { ...preflight.backend },
    localEndpoint: preflight.localEndpoint ? { ...preflight.localEndpoint } : undefined,
    tunBypass: undefined
  }
}

function clonePreflightReason(
  reason: AmneziaHelperStartupPreflightReason
): AmneziaHelperStartupPreflightReason {
  return {
    ...reason,
    details: reason.details ? { ...reason.details } : undefined
  }
}

function createSummaryExportPreflight(
  preflight: AmneziaHelperStartupPreflightResult | undefined
): AmneziaHelperSupportSummaryExportPreflight | undefined {
  if (!preflight) return undefined
  return {
    canStart: preflight.canStart,
    backendStatus: preflight.backendStatus,
    profileStatus: preflight.profileStatus,
    endpointStatus: preflight.endpointStatus,
    configStatus: preflight.configStatus,
    tunBypassStatus: preflight.tunBypassStatus,
    blockingReasonCodes: preflight.blockingReasons.map((reason) => reason.code),
    warningCodes: preflight.warnings.map((reason) => reason.code)
  }
}

function cloneRoutingTarget(
  target: AmneziaHelperRoutingTarget | undefined
): AmneziaHelperRoutingTarget | undefined {
  if (!target) return undefined
  return {
    ...target,
    endpoint: target.endpoint ? { ...target.endpoint } : undefined,
    tunBypass: undefined
  }
}

function cloneConnectivityResult(
  result: AmneziaHelperConnectivityResult | undefined
): AmneziaHelperConnectivityResult | undefined {
  if (!result) return undefined
  return {
    ...result,
    endpoint: { ...result.endpoint },
    stages: result.stages.map((stage) => ({ ...stage })),
    diagnostic: result.diagnostic
      ? {
          ...result.diagnostic,
          details: result.diagnostic.details ? { ...result.diagnostic.details } : undefined
        }
      : undefined
  }
}
