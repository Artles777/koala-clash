import { ChildProcess, spawn as nodeSpawn } from 'child_process'
import { createHash } from 'crypto'
import { existsSync } from 'fs'
import { mkdtemp, readFile, rm } from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { getExecutionPlan } from '../../core/profiles/desktop-runtime-adapter'
import {
  AmneziaHelperBackendMode,
  AmneziaHelperLocalEndpoint,
  AmneziaHelperRuntimeConfig
} from '../../core/profiles/amnezia-helper-runtime-config'
import {
  NormalizedProfile,
  validateNormalizedProfile
} from '../../core/profiles/normalized-profile'
import {
  AMNEZIA_HELPER_OUTBOUND_NAME,
  AmneziaHelperRoutingTarget
} from '../../core/routing/amnezia-helper-routing'
import {
  AmneziaHelperRule,
  injectAmneziaHelperRules
} from '../../core/routing/amnezia-helper-rules'
import {
  createInitialAmneziaHelperUdpCapability,
  shouldAdvertiseAmneziaHelperUdp,
  type AmneziaHelperUdpCapability,
  type AmneziaHelperUdpReasonCode,
  type AmneziaHelperUdpSupport
} from '../../core/routing/amnezia-helper-udp-capability'
import {
  evaluateAmneziaHelperTunRuleReliability,
  normalizeDnsEnhancedMode,
  type AmneziaHelperRuleReliability,
  type AmneziaHelperRuleReliabilityReason,
  type AmneziaHelperTunDnsEnhancedMode,
  type AmneziaHelperTunRuleReliabilityResult
} from '../../core/routing/amnezia-helper-tun-rule-reliability'
import {
  AmneziaHelperTunBypassResolution,
  AmneziaHelperTunBypassResolutionStatus,
  injectAmneziaHelperTunBypass
} from '../../core/routing/amnezia-helper-tun-bypass'
import { injectAmneziaHelperRoutingTarget } from '../../core/routing/amnezia-helper-routing'
import {
  AmneziaHelperBackendKind,
  AmneziaHelperExecutableValidationResult,
  getBackendSelfCheckArgs,
  resolveHelperBackend
} from './amnezia-helper-backend-provider'
import {
  AmneziaHelperConnectivityResult,
  AmneziaHelperConnectivityTarget,
  ValidateAmneziaHelperConnectivityInput,
  runAmneziaHelperConnectivityValidation
} from './amnezia-helper-connectivity'
import {
  validateAmneziaHelperUdpCapability,
  ValidateAmneziaHelperUdpCapabilityInput
} from './amnezia-helper-udp-validation'
import {
  AmneziaHelperManager,
  AmneziaHelperSession,
  AmneziaHelperSessionStatus
} from './amnezia-helper-manager'
import {
  AmneziaHelperStabilityReport,
  runAmneziaHelperStabilityScenarios
} from './amnezia-helper-stability'

export type AmneziaHelperVerificationStageName =
  | 'backend_resolution'
  | 'self_check'
  | 'startup'
  | 'readiness'
  | 'connectivity'
  | 'routing_injection'
  | 'cleanup'
  | 'stability'

export type AmneziaHelperVerificationStageStatus = 'passed' | 'failed' | 'skipped'
export type AmneziaHelperVerificationStatus = 'passed' | 'failed' | 'skipped'
export type AmneziaHelperReleaseReadinessStatus = 'supported' | 'warning' | 'blocked'
export type AmneziaHelperVerificationRuntimeScenario = 'proxy' | 'tun'
export type AmneziaHelperTunScenarioResult = 'not_run' | 'passed' | 'failed' | 'blocked' | 'skipped'
export type AmneziaHelperVerificationBackendSource =
  | 'override'
  | 'packaged_app'
  | 'resources_files'
  | 'prototype'
  | 'stub'
  | 'none'

export interface AmneziaHelperVerificationDiagnostic {
  code: string
  message: string
  stage: AmneziaHelperVerificationStageName
  at: number
  details?: Record<string, string | number | boolean>
}

export interface AmneziaHelperVerificationStageReport {
  stage: AmneziaHelperVerificationStageName
  status: AmneziaHelperVerificationStageStatus
  startedAt: number
  finishedAt: number
  durationMs: number
  message?: string
  diagnostics?: AmneziaHelperVerificationDiagnostic[]
  data?: unknown
}

export interface AmneziaHelperVerificationSelfCheckResult {
  status: Exclude<AmneziaHelperVerificationStageStatus, 'skipped'>
  command: string
  args: string[]
  exitCode: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  durationMs: number
}

export interface AmneziaHelperVerificationReport {
  schemaVersion: 1
  id: string
  scenario: 'packaged' | 'override' | 'prototype' | 'stub' | 'resources'
  runtimeScenario: AmneziaHelperVerificationRuntimeScenario
  buildId?: string
  appVersion?: string
  generatedAt: number
  finishedAt: number
  durationMs: number
  platform: NodeJS.Platform | string
  arch: string
  backendMode: AmneziaHelperBackendMode
  backendKind: AmneziaHelperBackendKind
  backendSource: AmneziaHelperVerificationBackendSource
  packaged: boolean
  resourcesFilesDir: string
  packagedAppPath?: string
  helperPathUsed: string
  helperChecksumSha256?: string
  helperVersion?: string
  executableValidation?: AmneziaHelperExecutableValidationResult
  fixture: {
    kind: 'default_normalized_profile' | 'normalized_profile_file'
    profileId: string
    profileName: string
    path?: string
  }
  startupResult?: Pick<
    AmneziaHelperSession,
    | 'profileId'
    | 'sessionId'
    | 'pid'
    | 'status'
    | 'command'
    | 'args'
    | 'configStatus'
    | 'configError'
    | 'lastError'
    | 'backendMode'
    | 'tempConfigPath'
  >
  readinessResult?: {
    status: AmneziaHelperSession['readiness']
    localEndpoint?: AmneziaHelperLocalEndpoint
    lastError?: string
  }
  connectivityResult?: AmneziaHelperConnectivityResult
  routingInjectionState?: AmneziaHelperRoutingTarget
  tunEnabled: boolean
  tunDnsEnabled?: boolean
  tunDnsHijackEnabled: boolean
  tunDnsEnhancedMode: AmneziaHelperTunDnsEnhancedMode
  helperRuleReliability: AmneziaHelperRuleReliability
  helperRuleReliabilityReason: AmneziaHelperRuleReliabilityReason
  helperRuleReliabilityReasons: AmneziaHelperRuleReliabilityReason[]
  helperRuleReliabilityExplanation: string
  helperRulesHaveDomainRules: boolean
  helperRulesIpCidrOnly: boolean
  udpSupport: AmneziaHelperUdpSupport
  udpValidated: boolean
  udpReasonCode: AmneziaHelperUdpReasonCode
  udpExplanation: string
  runtimeAdvertisesUdp: boolean
  helperTunBypassActive: boolean
  helperTunBypassIps: string[]
  helperTunBypassResolutionStatus: AmneziaHelperTunBypassResolutionStatus
  tunScenarioResult: AmneziaHelperTunScenarioResult
  tunSafetyBlocked: boolean
  cleanupRestored?: boolean
  tunRuntimeInjection?: {
    helperOutboundInjected: boolean
    helperRulesConfigured: number
    helperRulesInjected: boolean
    serializedHelperRules: string[]
    helperOutboundUdp: boolean
    routeExcludeAddresses: string[]
  }
  cleanupResult?: {
    status: AmneziaHelperSessionStatus
    stoppedAt?: number
    tempConfigRemoved?: boolean
    lastError?: string
  }
  stabilityResult?: AmneziaHelperStabilityReport
  lifecycleStressPassed: boolean
  reloadResiliencePassed: boolean
  recoveryPassed: boolean
  soakDurationMs: number
  repeatedStartStopCount: number
  staleStateDetected: boolean
  cleanupLeakDetected: boolean
  diagnostics: AmneziaHelperVerificationDiagnostic[]
  stages: AmneziaHelperVerificationStageReport[]
  summary: {
    status: AmneziaHelperVerificationStatus
    failedStage?: AmneziaHelperVerificationStageName
    message: string
  }
  releaseReadiness: {
    status: AmneziaHelperReleaseReadinessStatus
    blockers: string[]
    warnings: string[]
  }
}

export interface RunAmneziaHelperVerificationOptions {
  buildId?: string
  appVersion?: string
  scenario?: AmneziaHelperVerificationReport['scenario']
  runtimeScenario?: AmneziaHelperVerificationRuntimeScenario
  tunEnabled?: boolean
  backendMode?: AmneziaHelperBackendMode
  backendPath?: string
  resourcesFilesDir?: string
  packagedAppPath?: string
  runtimeDir?: string
  fixtureProfilePath?: string
  profile?: NormalizedProfile
  resolveOnly?: boolean
  spawnSelfCheck?: boolean
  selfCheckTimeoutMs?: number
  readinessTimeoutMs?: number
  readinessPollIntervalMs?: number
  connectivityTimeoutMs?: number
  connectivityTarget?: Partial<AmneziaHelperConnectivityTarget>
  dnsEnabled?: boolean
  dnsHijackEnabled?: boolean
  dnsEnhancedMode?: string
  proxyBackendPath?: string
  helperStubPath?: string
  command?: string
  now?: () => number
  spawnProcess?: typeof nodeSpawn
  validateConnectivity?: (
    input: ValidateAmneziaHelperConnectivityInput
  ) => Promise<AmneziaHelperConnectivityResult>
  validateUdpCapability?: (
    input: ValidateAmneziaHelperUdpCapabilityInput
  ) => Promise<AmneziaHelperUdpCapability>
  syncRoutingState?: (session: AmneziaHelperSession) => Promise<void> | void
  runStability?: boolean
  stabilityCycles?: number
  stabilitySoakDurationMs?: number
  stabilitySoakIntervalMs?: number
  helperRules?: AmneziaHelperRule[]
  resolveTunBypass?: (input: {
    runtimeConfig: AmneziaHelperRuntimeConfig
    tunEnabled: boolean
  }) => Promise<AmneziaHelperTunBypassResolution>
  syncTunBypassState?: (
    resolution: AmneziaHelperTunBypassResolution | undefined
  ) => Promise<void> | void
}

const defaultSelfCheckTimeoutMs = 5000
const defaultReadinessTimeoutMs = 5000
const defaultReadinessPollIntervalMs = 100

export async function runAmneziaHelperVerification(
  options: RunAmneziaHelperVerificationOptions = {}
): Promise<AmneziaHelperVerificationReport> {
  const now = options.now ?? Date.now
  const generatedAt = now()
  const platform = process.platform
  const arch = process.arch
  const backendMode = options.backendMode ?? 'production'
  const runtimeScenario = options.runtimeScenario ?? (options.tunEnabled ? 'tun' : 'proxy')
  const tunEnabled = options.tunEnabled ?? runtimeScenario === 'tun'
  const resourcesFilesDir = resolveVerificationResourcesFilesDir({
    resourcesFilesDir: options.resourcesFilesDir,
    packagedAppPath: options.packagedAppPath,
    platform
  })
  const backendPath = options.backendPath ?? process.env.KOALA_AMNEZIA_HELPER_BACKEND_PATH
  const ruleReliability = evaluateAmneziaHelperTunRuleReliability({
    tunEnabled,
    dnsEnabled: options.dnsEnabled,
    dnsHijackEnabled: options.dnsHijackEnabled ?? tunEnabled,
    dnsEnhancedMode: normalizeDnsEnhancedMode(
      options.dnsEnhancedMode ?? (tunEnabled ? 'fake-ip' : undefined)
    ),
    rules: options.helperRules ?? []
  })
  const proxyBackendPath =
    options.proxyBackendPath ??
    resolveVerificationBackendScriptPath(resourcesFilesDir, 'amnezia-helper-proxy-backend.cjs')
  const helperStubPath =
    options.helperStubPath ??
    resolveVerificationBackendScriptPath(resourcesFilesDir, 'amnezia-helper-stub.cjs')
  const profile = options.profile ?? (await loadVerificationProfile(options.fixtureProfilePath))
  const report = createBaseReport({
    id: `amnezia-helper-smoke-${generatedAt}`,
    scenario:
      options.scenario ??
      resolveVerificationScenario({
        backendMode,
        backendPath,
        packagedAppPath: options.packagedAppPath
      }),
    runtimeScenario,
    tunEnabled,
    buildId: options.buildId ?? process.env.KOALA_BUILD_ID,
    appVersion: options.appVersion ?? process.env.KOALA_APP_VERSION,
    generatedAt,
    platform,
    arch,
    backendMode,
    backendSource: resolveBackendSource({
      backendMode,
      backendPath,
      packagedAppPath: options.packagedAppPath
    }),
    packaged: Boolean(options.packagedAppPath),
    resourcesFilesDir,
    packagedAppPath: options.packagedAppPath,
    ruleReliability,
    fixture: {
      kind: options.fixtureProfilePath ? 'normalized_profile_file' : 'default_normalized_profile',
      profileId: profile.id,
      profileName: profile.name,
      path: options.fixtureProfilePath
    }
  })

  const backend = resolveHelperBackend({
    mode: backendMode,
    command: options.command,
    proxyBackendPath,
    helperStubPath,
    productionBackendPath: backendPath,
    resourcesFilesDir
  })
  report.backendKind = backend.kind
  report.helperPathUsed = backend.executablePath
  report.executableValidation = backend.validation
  if (backend.available) {
    report.helperChecksumSha256 = await checksumFileIfPresent(backend.executablePath)
    report.helperVersion = backend.validation?.manifest?.version
  }

  pushStage(report, {
    stage: 'backend_resolution',
    status: backend.available ? 'passed' : 'failed',
    startedAt: generatedAt,
    finishedAt: now(),
    message: backend.available
      ? `${backend.kind} backend resolved`
      : `${backend.mode} backend is unavailable`,
    data: {
      command: backend.command,
      executablePath: backend.executablePath,
      diagnostics: backend.diagnostics
    }
  })

  for (const issue of backend.validation?.issues ?? []) {
    pushDiagnostic(report, 'backend_resolution', issue.code, issue.message, {
      path: issue.path ?? backend.executablePath
    })
  }

  if (!backend.available) {
    skipRemainingStages(report, [
      'self_check',
      'startup',
      'readiness',
      'connectivity',
      'routing_injection',
      'cleanup'
    ])
    return finalizeReport(report, now)
  }

  if (options.resolveOnly) {
    skipRemainingStages(report, [
      'self_check',
      'startup',
      'readiness',
      'connectivity',
      'routing_injection',
      'cleanup'
    ])
    return finalizeReport(report, now)
  }

  if (options.spawnSelfCheck) {
    const selfCheckStartedAt = now()
    const selfCheck = await runBackendSelfCheck({
      backend,
      timeoutMs: options.selfCheckTimeoutMs ?? defaultSelfCheckTimeoutMs,
      spawnProcess: options.spawnProcess ?? nodeSpawn,
      now
    })
    pushStage(report, {
      stage: 'self_check',
      status: selfCheck.status,
      startedAt: selfCheckStartedAt,
      finishedAt: now(),
      message:
        selfCheck.status === 'passed'
          ? 'backend self-check exited successfully'
          : 'backend self-check failed',
      data: selfCheck
    })
    if (selfCheck.status === 'failed') {
      pushDiagnostic(
        report,
        'self_check',
        'self_check_failed',
        selfCheck.stderr || 'self-check failed'
      )
      skipRemainingStages(report, [
        'startup',
        'readiness',
        'connectivity',
        'routing_injection',
        'cleanup'
      ])
      return finalizeReport(report, now)
    }
  } else {
    pushSkippedStage(report, 'self_check', now(), 'self-check was not requested')
  }

  const fixtureIssues = validateNormalizedProfile(profile)
  if (fixtureIssues.length > 0) {
    for (const issue of fixtureIssues) {
      pushDiagnostic(report, 'startup', `fixture_${issue.code}`, issue.message)
    }
    pushStage(report, {
      stage: 'startup',
      status: 'failed',
      startedAt: now(),
      finishedAt: now(),
      message: 'fixture profile is invalid'
    })
    skipRemainingStages(report, ['readiness', 'connectivity', 'routing_injection', 'cleanup'])
    return finalizeReport(report, now)
  }

  const runtimeDir =
    options.runtimeDir ?? (await mkdtemp(path.join(os.tmpdir(), 'koala-amnezia-smoke-')))
  const removeRuntimeDir = !options.runtimeDir
  let activeTunBypassState = false
  const manager = new AmneziaHelperManager({
    runtimeDir,
    proxyBackendPath,
    helperStubPath,
    backendMode,
    productionBackendPath: backendPath,
    resourcesFilesDir,
    command: options.command,
    spawnProcess: options.spawnProcess,
    readinessTimeoutMs: options.readinessTimeoutMs ?? defaultReadinessTimeoutMs,
    readinessPollIntervalMs: options.readinessPollIntervalMs ?? defaultReadinessPollIntervalMs,
    loadExecutionPlan: async (profileId) =>
      profileId === profile.id ? getExecutionPlan(profile, platform) : undefined,
    syncRoutingState: options.syncRoutingState,
    isTunEnabled: () => tunEnabled,
    resolveTunBypass: options.resolveTunBypass,
    syncTunBypassState: (resolution) => {
      activeTunBypassState = resolution?.status === 'resolved'
      if (resolution) updateTunBypassReportState(report, resolution)
      return options.syncTunBypassState?.(resolution)
    },
    validateConnectivity:
      options.validateConnectivity ??
      ((input) =>
        runAmneziaHelperConnectivityValidation({
          ...input,
          timeoutMs: options.connectivityTimeoutMs,
          target: options.connectivityTarget
        })),
    validateUdpCapability:
      options.validateUdpCapability ??
      ((input) =>
        validateAmneziaHelperUdpCapability({
          ...input,
          timeoutMs: options.connectivityTimeoutMs
        }))
  })

  let session: AmneziaHelperSession | undefined
  let continueRuntimeStages = true
  try {
    const startupStartedAt = now()
    try {
      session = await manager.start(profile.id)
      report.startupResult = toStartupResult(session)
      updateTunReportFromSession(report, session)
      const startupPassed = session.status === 'running'
      pushStage(report, {
        stage: 'startup',
        status: startupPassed ? 'passed' : 'failed',
        startedAt: startupStartedAt,
        finishedAt: now(),
        message: startupPassed
          ? 'helper process started'
          : (session.lastError ?? 'helper start failed'),
        data: {
          sessionId: session.sessionId,
          pid: session.pid,
          status: session.status,
          configStatus: session.configStatus
        }
      })
      pushSessionDiagnostics(report, 'startup', session)

      if (!startupPassed) {
        if (tunEnabled && hasTunBypassFailure(session)) {
          report.tunSafetyBlocked = true
          report.tunScenarioResult = 'blocked'
          pushDiagnostic(
            report,
            'startup',
            'tun_helper_blocked_for_safety',
            session.lastError ?? 'helper startup was blocked for TUN safety'
          )
        }
        skipRemainingStages(report, ['readiness', 'connectivity', 'routing_injection'])
        continueRuntimeStages = false
      }
    } catch (error) {
      session = manager.getStatus(profile.id)
      updateTunReportFromSession(report, session)
      report.startupResult = toStartupResult(session)
      const message = error instanceof Error ? error.message : String(error)
      pushDiagnostic(report, 'startup', 'startup_failed', message)
      pushSessionDiagnostics(report, 'startup', session)
      pushStage(report, {
        stage: 'startup',
        status: 'failed',
        startedAt: startupStartedAt,
        finishedAt: now(),
        message
      })
      skipRemainingStages(report, ['readiness', 'connectivity', 'routing_injection'])
      continueRuntimeStages = false
    }

    if (continueRuntimeStages) {
      const readinessStartedAt = now()
      session = await waitForSessionState(
        manager,
        profile.id,
        (current) =>
          current.readiness === 'ready' ||
          current.readiness === 'failed' ||
          current.status === 'failed' ||
          current.status === 'stopped',
        (options.readinessTimeoutMs ?? defaultReadinessTimeoutMs) + 500
      )
      report.readinessResult = {
        status: session.readiness,
        localEndpoint: session.localEndpoint ? { ...session.localEndpoint } : undefined,
        lastError: session.lastError
      }
      updateTunReportFromSession(report, session)
      const readinessPassed = session.readiness === 'ready'
      pushStage(report, {
        stage: 'readiness',
        status: readinessPassed ? 'passed' : 'failed',
        startedAt: readinessStartedAt,
        finishedAt: now(),
        message: readinessPassed
          ? `local proxy endpoint is ready at ${session.localEndpoint?.host}:${session.localEndpoint?.port}`
          : (session.lastError ?? 'local proxy endpoint did not become ready'),
        data: report.readinessResult
      })
      pushSessionDiagnostics(report, 'readiness', session)

      if (readinessPassed) {
        const connectivityStartedAt = now()
        const connectivity = await manager.validateConnectivity(profile.id)
        report.connectivityResult = connectivity
        pushStage(report, {
          stage: 'connectivity',
          status: connectivity.status === 'verified' ? 'passed' : 'failed',
          startedAt: connectivityStartedAt,
          finishedAt: now(),
          message:
            connectivity.status === 'verified'
              ? 'connectivity verified through helper proxy'
              : (connectivity.diagnostic?.message ?? 'connectivity validation failed'),
          data: {
            status: connectivity.status,
            validationStage: connectivity.validationStage,
            durationMs: connectivity.durationMs,
            latencyMs: connectivity.latencyMs,
            endpoint: connectivity.endpoint
          }
        })
        if (connectivity.diagnostic) {
          pushDiagnostic(
            report,
            'connectivity',
            connectivity.diagnostic.category,
            connectivity.diagnostic.message
          )
          if (tunEnabled) {
            pushDiagnostic(
              report,
              'connectivity',
              'tun_connectivity_failed',
              connectivity.diagnostic.message
            )
          }
        }
      } else {
        pushSkippedStage(report, 'connectivity', now(), 'helper endpoint is not ready')
      }

      const routingStartedAt = now()
      session = manager.getStatus(profile.id)
      updateTunReportFromSession(report, session)
      updateUdpReportFromSession(report, session)
      report.routingInjectionState = session.routingTarget
        ? {
            ...session.routingTarget,
            endpoint: session.routingTarget.endpoint
              ? { ...session.routingTarget.endpoint }
              : undefined,
            tunBypass: cloneTunBypass(session.routingTarget.tunBypass)
          }
        : undefined
      const routingPassed = session.routingTarget?.status === 'injected'
      if (tunEnabled) {
        updateTunRuntimeInjectionReport(report, session.routingTarget, options.helperRules ?? [])
        pushTunRuntimeDiagnostics(report)
      }
      pushStage(report, {
        stage: 'routing_injection',
        status: routingPassed ? 'passed' : 'failed',
        startedAt: routingStartedAt,
        finishedAt: now(),
        message: routingPassed
          ? 'AMNEZIA_HELPER routing target is injected'
          : (session.routingTarget?.reason ?? 'AMNEZIA_HELPER routing target is not injected'),
        data: report.routingInjectionState
          ? { routingTarget: report.routingInjectionState }
          : undefined
      })
    }
  } finally {
    const cleanupStartedAt = now()
    const tempConfigPath = session?.tempConfigPath
    const stopped = await manager.stop(profile.id).catch((error) => {
      const failed = manager.getStatus(profile.id)
      return {
        ...failed,
        status: 'failed' as const,
        lastError: error instanceof Error ? error.message : String(error)
      }
    })
    await manager.stopAll().catch(() => undefined)
    if (tunEnabled) {
      report.cleanupRestored = !activeTunBypassState
      if (!report.cleanupRestored) {
        pushDiagnostic(report, 'cleanup', 'tun_cleanup_failed', 'TUN bypass state was not cleared')
      }
    }
    const tempConfigRemoved = tempConfigPath ? !existsSync(tempConfigPath) : undefined
    report.cleanupResult = {
      status: stopped.status,
      stoppedAt: stopped.stoppedAt,
      tempConfigRemoved,
      lastError: stopped.lastError
    }
    pushStage(report, {
      stage: 'cleanup',
      status:
        stopped.status === 'stopped' || stopped.status === 'idle' || stopped.status === 'failed'
          ? tempConfigRemoved === false
            ? 'failed'
            : 'passed'
          : 'failed',
      startedAt: cleanupStartedAt,
      finishedAt: now(),
      message:
        tempConfigRemoved === false
          ? 'temporary helper config was not removed'
          : 'helper process cleanup completed',
      data: report.cleanupResult
    })
    if (options.runStability) {
      const stabilityStartedAt = now()
      const startupPassed =
        report.stages.find((stage) => stage.stage === 'startup')?.status === 'passed'
      if (!startupPassed) {
        pushStage(report, {
          stage: 'stability',
          status: 'skipped',
          startedAt: stabilityStartedAt,
          finishedAt: now(),
          message: 'stability validation was skipped because startup did not pass'
        })
      } else {
        try {
          const stability = await runAmneziaHelperStabilityScenarios({
            profileId: profile.id,
            manager,
            cycles: options.stabilityCycles,
            soakDurationMs: options.stabilitySoakDurationMs,
            soakIntervalMs: options.stabilitySoakIntervalMs,
            readinessTimeoutMs: options.readinessTimeoutMs ?? defaultReadinessTimeoutMs,
            pollIntervalMs: options.readinessPollIntervalMs ?? defaultReadinessPollIntervalMs,
            includeTunReloadScenario: tunEnabled,
            reload: async ({ session }) => {
              await options.syncRoutingState?.(session)
            }
          })
          await manager.stopAll().catch(() => undefined)
          let stabilityStatus = stability.summary.status
          let stabilityMessage = stability.summary.message
          if (tunEnabled && activeTunBypassState) {
            report.cleanupRestored = false
            stabilityStatus = 'failed'
            stabilityMessage = 'stability validation left TUN bypass state active'
            pushDiagnostic(
              report,
              'stability',
              'stability_tun_cleanup_failed',
              'TUN bypass state remained active after stability validation'
            )
          }
          applyStabilityReport(report, stability)
          pushStabilityDiagnostics(report, stability)
          pushStage(report, {
            stage: 'stability',
            status: stabilityStatus,
            startedAt: stabilityStartedAt,
            finishedAt: now(),
            message: stabilityMessage,
            data: stability
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          pushDiagnostic(report, 'stability', 'stability_runner_failed', message)
          pushStage(report, {
            stage: 'stability',
            status: 'failed',
            startedAt: stabilityStartedAt,
            finishedAt: now(),
            message
          })
          await manager.stopAll().catch(() => undefined)
        }
      }
    }
    if (removeRuntimeDir) {
      await rm(runtimeDir, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  return finalizeReport(report, now)
}

export async function loadVerificationProfile(filePath?: string): Promise<NormalizedProfile> {
  if (!filePath) return createDefaultVerificationProfile()

  const parsed = JSON.parse(await readFile(filePath, 'utf-8')) as NormalizedProfile
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Amnezia helper verification fixture is not an object: ${filePath}`)
  }

  return parsed
}

export function createDefaultVerificationProfile(): NormalizedProfile {
  return {
    id: 'amnezia-smoke-profile',
    name: 'Amnezia Helper Smoke Profile',
    sourceId: 'amnezia-smoke-source',
    protocol: 'amneziawg',
    enabled: true,
    transport: {
      type: 'udp',
      endpoint: {
        host: 'vpn.example.com',
        port: 51820
      },
      mtu: 1280
    },
    auth: {
      clientPrivateKey: 'smoke-client-private-key'
    },
    interface: {
      addresses: ['10.8.0.2/32'],
      dns: ['1.1.1.1'],
      mtu: 1280
    },
    peer: {
      endpoint: 'vpn.example.com:51820',
      publicKey: 'smoke-server-public-key',
      allowedIps: ['0.0.0.0/0', '::/0'],
      persistentKeepalive: 25
    },
    amnezia: {
      container: 'amnezia-awg',
      obfuscation: {
        smoke: 'true'
      }
    },
    metadata: {
      importedAt: 1710000000000,
      decodedFormat: 'json',
      sourceType: 'amnezia_vpn_uri',
      warnings: ['smoke_fixture_not_real_credentials']
    }
  }
}

export function resolveVerificationResourcesFilesDir(options: {
  resourcesFilesDir?: string
  packagedAppPath?: string
  platform?: NodeJS.Platform | string
}): string {
  if (options.resourcesFilesDir) return path.resolve(options.resourcesFilesDir)
  if (options.packagedAppPath) {
    return resolveResourcesFilesDirFromPackagedPath(options.packagedAppPath, options.platform)
  }
  return path.resolve('extra', 'files')
}

export function resolveResourcesFilesDirFromPackagedPath(
  packagedAppPath: string,
  platform: NodeJS.Platform | string = process.platform
): string {
  const resolved = path.resolve(packagedAppPath)
  const basename = path.basename(resolved).toLowerCase()

  if (basename === 'files') return resolved
  if (basename === 'resources') return path.join(resolved, 'files')
  if (platform === 'darwin' || basename.endsWith('.app')) {
    return path.join(resolved, 'Contents', 'Resources', 'files')
  }

  return path.join(resolved, 'resources', 'files')
}

export function resolveVerificationBackendScriptPath(
  resourcesFilesDir: string,
  filename: string
): string {
  const candidates = [
    path.join(resourcesFilesDir, filename),
    path.join(process.cwd(), 'src', 'main', 'runtime', filename),
    path.join(__dirname, filename)
  ]

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]
}

async function runBackendSelfCheck(input: {
  backend: ReturnType<typeof resolveHelperBackend>
  timeoutMs: number
  spawnProcess: typeof nodeSpawn
  now: () => number
}): Promise<AmneziaHelperVerificationSelfCheckResult> {
  const startedAt = input.now()
  const args = getBackendSelfCheckArgs(input.backend)

  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    const child = input.spawnProcess(input.backend.command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...(input.backend.runAsNode ? { ELECTRON_RUN_AS_NODE: '1' } : {})
      }
    })
    const finish = (exitCode: number | null, signal: NodeJS.Signals | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({
        status: exitCode === 0 ? 'passed' : 'failed',
        command: input.backend.command,
        args,
        exitCode,
        signal,
        stdout: trimOutput(stdout),
        stderr: trimOutput(stderr),
        durationMs: input.now() - startedAt
      })
    }
    const timer = setTimeout(() => {
      stderr += `self-check timed out after ${input.timeoutMs}ms`
      killChild(child)
      finish(null, 'SIGTERM')
    }, input.timeoutMs)

    child.stdout?.on('data', (data) => {
      stdout += data.toString()
    })
    child.stderr?.on('data', (data) => {
      stderr += data.toString()
    })
    child.once('close', finish)
    child.once('error', (error) => {
      stderr += error instanceof Error ? error.message : String(error)
      finish(null, null)
    })
  })
}

async function waitForSessionState(
  manager: AmneziaHelperManager,
  profileId: string,
  predicate: (session: AmneziaHelperSession) => boolean,
  timeoutMs: number
): Promise<AmneziaHelperSession> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const session = manager.getStatus(profileId)
    if (predicate(session)) return session
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  return manager.getStatus(profileId)
}

function createBaseReport(input: {
  id: string
  scenario: AmneziaHelperVerificationReport['scenario']
  runtimeScenario: AmneziaHelperVerificationRuntimeScenario
  tunEnabled: boolean
  buildId?: string
  appVersion?: string
  generatedAt: number
  platform: NodeJS.Platform | string
  arch: string
  backendMode: AmneziaHelperBackendMode
  backendSource: AmneziaHelperVerificationBackendSource
  packaged: boolean
  resourcesFilesDir: string
  packagedAppPath?: string
  ruleReliability: AmneziaHelperTunRuleReliabilityResult
  fixture: AmneziaHelperVerificationReport['fixture']
}): AmneziaHelperVerificationReport {
  const initialUdpCapability = createInitialAmneziaHelperUdpCapability(input.backendMode)
  return {
    schemaVersion: 1,
    id: input.id,
    scenario: input.scenario,
    runtimeScenario: input.runtimeScenario,
    buildId: input.buildId,
    appVersion: input.appVersion,
    generatedAt: input.generatedAt,
    finishedAt: input.generatedAt,
    durationMs: 0,
    platform: input.platform,
    arch: input.arch,
    backendMode: input.backendMode,
    backendKind: 'unavailable',
    backendSource: input.backendSource,
    packaged: input.packaged,
    resourcesFilesDir: input.resourcesFilesDir,
    packagedAppPath: input.packagedAppPath,
    helperPathUsed: '',
    fixture: input.fixture,
    tunEnabled: input.tunEnabled,
    tunDnsEnabled: input.ruleReliability.dnsEnabled,
    tunDnsHijackEnabled: input.ruleReliability.dnsHijackEnabled,
    tunDnsEnhancedMode: input.ruleReliability.dnsEnhancedMode,
    helperRuleReliability: input.ruleReliability.reliability,
    helperRuleReliabilityReason: input.ruleReliability.primaryReason,
    helperRuleReliabilityReasons: [...input.ruleReliability.reasons],
    helperRuleReliabilityExplanation: input.ruleReliability.explanation,
    helperRulesHaveDomainRules: input.ruleReliability.ruleTypes.hasDomainRules,
    helperRulesIpCidrOnly: input.ruleReliability.ruleTypes.hasIpCidrOnly,
    udpSupport: initialUdpCapability.udpSupport,
    udpValidated: initialUdpCapability.udpValidated,
    udpReasonCode: initialUdpCapability.udpReasonCode,
    udpExplanation: initialUdpCapability.udpExplanation,
    runtimeAdvertisesUdp: shouldAdvertiseAmneziaHelperUdp(initialUdpCapability),
    helperTunBypassActive: false,
    helperTunBypassIps: [],
    helperTunBypassResolutionStatus: input.tunEnabled ? 'failed' : 'not_required',
    tunScenarioResult: input.tunEnabled ? 'skipped' : 'not_run',
    tunSafetyBlocked: false,
    lifecycleStressPassed: false,
    reloadResiliencePassed: false,
    recoveryPassed: false,
    soakDurationMs: 0,
    repeatedStartStopCount: 0,
    staleStateDetected: false,
    cleanupLeakDetected: false,
    diagnostics: [],
    stages: [],
    summary: {
      status: 'skipped',
      message: 'verification has not finished'
    },
    releaseReadiness: {
      status: 'blocked',
      blockers: ['verification_not_finished'],
      warnings: []
    }
  }
}

function pushStage(
  report: AmneziaHelperVerificationReport,
  stage: Omit<AmneziaHelperVerificationStageReport, 'durationMs'> & { durationMs?: number }
): void {
  const diagnostics = report.diagnostics.filter((diagnostic) => diagnostic.stage === stage.stage)
  report.stages.push({
    ...stage,
    durationMs: stage.durationMs ?? Math.max(0, stage.finishedAt - stage.startedAt),
    diagnostics: diagnostics.length > 0 ? diagnostics : undefined
  })
}

function pushSkippedStage(
  report: AmneziaHelperVerificationReport,
  stage: AmneziaHelperVerificationStageName,
  at: number,
  message: string
): void {
  pushStage(report, {
    stage,
    status: 'skipped',
    startedAt: at,
    finishedAt: at,
    message
  })
}

function skipRemainingStages(
  report: AmneziaHelperVerificationReport,
  stages: AmneziaHelperVerificationStageName[]
): void {
  const now = Date.now()
  const existing = new Set(report.stages.map((stage) => stage.stage))
  for (const stage of stages) {
    if (!existing.has(stage)) {
      pushSkippedStage(report, stage, now, 'stage was skipped after an earlier result')
    }
  }
}

function pushDiagnostic(
  report: AmneziaHelperVerificationReport,
  stage: AmneziaHelperVerificationStageName,
  code: string,
  message: string,
  details?: Record<string, string | number | boolean>
): void {
  report.diagnostics.push({
    code,
    message,
    stage,
    at: Date.now(),
    details
  })
}

function pushSessionDiagnostics(
  report: AmneziaHelperVerificationReport,
  stage: AmneziaHelperVerificationStageName,
  session: AmneziaHelperSession
): void {
  for (const diagnostic of session.runtimeDiagnostics) {
    pushDiagnostic(report, stage, diagnostic.category, diagnostic.message, diagnostic.details)
  }
}

function updateTunReportFromSession(
  report: AmneziaHelperVerificationReport,
  session: AmneziaHelperSession
): void {
  if (!report.tunEnabled) return
  if (session.tunBypass) updateTunBypassReportState(report, session.tunBypass)
}

function updateUdpReportFromSession(
  report: AmneziaHelperVerificationReport,
  session: AmneziaHelperSession
): void {
  report.udpSupport = session.udpCapability.udpSupport
  report.udpValidated = session.udpCapability.udpValidated
  report.udpReasonCode = session.udpCapability.udpReasonCode
  report.udpExplanation = session.udpCapability.udpExplanation
  report.runtimeAdvertisesUdp = shouldAdvertiseAmneziaHelperUdp(session.udpCapability)
}

function updateTunBypassReportState(
  report: AmneziaHelperVerificationReport,
  resolution: AmneziaHelperTunBypassResolution | undefined
): void {
  if (!report.tunEnabled) return
  report.helperTunBypassActive = resolution?.status === 'resolved'
  report.helperTunBypassIps = resolution?.ips ? [...resolution.ips] : []
  report.helperTunBypassResolutionStatus = resolution?.status ?? 'failed'
}

function updateTunRuntimeInjectionReport(
  report: AmneziaHelperVerificationReport,
  target: AmneziaHelperRoutingTarget | undefined,
  helperRules: AmneziaHelperRule[]
): void {
  if (!report.tunEnabled) return

  const routingResult = injectAmneziaHelperRoutingTarget(
    {
      tun: { enable: true },
      proxies: [],
      'proxy-groups': [],
      rules: []
    },
    target
  )
  const ruleResult = injectAmneziaHelperRules(
    routingResult.config,
    routingResult.target,
    helperRules
  )
  const tunResult = injectAmneziaHelperTunBypass(ruleResult.config, target?.tunBypass)
  const helperOutbound = (
    tunResult.config.proxies as Array<{ name?: string; udp?: boolean }> | undefined
  )?.find((proxy) => proxy.name === AMNEZIA_HELPER_OUTBOUND_NAME)

  report.tunRuntimeInjection = {
    helperOutboundInjected: routingResult.injected,
    helperRulesConfigured: helperRules.length,
    helperRulesInjected: helperRules.length > 0 ? ruleResult.injected : false,
    serializedHelperRules: ruleResult.serializedRules,
    helperOutboundUdp: Boolean(helperOutbound?.udp),
    routeExcludeAddresses: tunResult.config.tun?.['route-exclude-address']
      ? [...tunResult.config.tun['route-exclude-address']]
      : []
  }
}

function applyStabilityReport(
  report: AmneziaHelperVerificationReport,
  stability: AmneziaHelperStabilityReport
): void {
  report.stabilityResult = stability
  report.lifecycleStressPassed = stability.lifecycleStressPassed
  report.reloadResiliencePassed = stability.reloadResiliencePassed
  report.recoveryPassed = stability.recoveryPassed
  report.soakDurationMs = stability.soakDurationMs
  report.repeatedStartStopCount = stability.repeatedStartStopCount
  report.staleStateDetected = stability.staleStateDetected
  report.cleanupLeakDetected = stability.cleanupLeakDetected
}

function pushStabilityDiagnostics(
  report: AmneziaHelperVerificationReport,
  stability: AmneziaHelperStabilityReport
): void {
  for (const diagnostic of stability.diagnostics) {
    pushDiagnostic(report, 'stability', diagnostic.code, diagnostic.message, {
      scenario: diagnostic.scenario,
      ...(diagnostic.details ?? {})
    })
  }
}

function pushTunRuntimeDiagnostics(report: AmneziaHelperVerificationReport): void {
  if (!report.tunEnabled) return

  if (!report.helperTunBypassActive) {
    pushDiagnostic(
      report,
      'routing_injection',
      report.helperTunBypassResolutionStatus === 'failed'
        ? 'tun_bypass_resolution_failure'
        : 'tun_bypass_missing',
      'TUN helper upstream bypass is not active'
    )
  }

  if ((report.tunRuntimeInjection?.routeExcludeAddresses.length ?? 0) === 0) {
    pushDiagnostic(
      report,
      'routing_injection',
      'tun_bypass_missing',
      'TUN route-exclude-address does not contain helper upstream exclusions'
    )
  }

  if (!report.tunRuntimeInjection?.helperOutboundInjected) {
    pushDiagnostic(
      report,
      'routing_injection',
      'tun_runtime_injection_missing',
      'AMNEZIA_HELPER routing target is missing from the TUN runtime config'
    )
  }

  if (
    (report.tunRuntimeInjection?.helperRulesConfigured ?? 0) > 0 &&
    !report.tunRuntimeInjection?.helperRulesInjected
  ) {
    pushDiagnostic(
      report,
      'routing_injection',
      'tun_runtime_injection_missing',
      'Configured AMNEZIA_HELPER rules are missing from the TUN runtime config'
    )
  }

  if (report.helperRulesHaveDomainRules) {
    if (report.helperRuleReliability === 'blocked') {
      pushDiagnostic(
        report,
        'routing_injection',
        'tun_dns_rule_reliability_blocked',
        report.helperRuleReliabilityExplanation,
        { reason: report.helperRuleReliabilityReason }
      )
    } else if (report.helperRuleReliability === 'unlikely') {
      pushDiagnostic(
        report,
        'routing_injection',
        'tun_dns_rule_reliability_unlikely',
        report.helperRuleReliabilityExplanation,
        { reason: report.helperRuleReliabilityReason }
      )
    } else if (report.helperRuleReliability === 'degraded') {
      pushDiagnostic(
        report,
        'routing_injection',
        'tun_dns_rule_reliability_degraded',
        report.helperRuleReliabilityExplanation,
        { reason: report.helperRuleReliabilityReason }
      )
    }
  }
}

function finalizeTunScenarioResult(report: AmneziaHelperVerificationReport): void {
  if (!report.tunEnabled) {
    report.tunScenarioResult = 'not_run'
    return
  }

  if (report.tunSafetyBlocked) {
    report.tunScenarioResult = 'blocked'
    return
  }

  if (report.diagnostics.some(isBlockingTunDiagnostic)) {
    report.tunScenarioResult = 'failed'
    return
  }

  const requiredStagesPassed = ['startup', 'readiness', 'connectivity', 'routing_injection'].every(
    (stage) => report.stages.find((item) => item.stage === stage)?.status === 'passed'
  )
  report.tunScenarioResult =
    requiredStagesPassed && report.helperTunBypassActive && report.cleanupRestored !== false
      ? 'passed'
      : 'failed'
}

function hasTunBypassFailure(session: AmneziaHelperSession): boolean {
  return session.runtimeDiagnostics.some(
    (diagnostic) => diagnostic.category === 'tun_bypass_resolution_failure'
  )
}

function finalizeReport(
  report: AmneziaHelperVerificationReport,
  now: () => number
): AmneziaHelperVerificationReport {
  finalizeTunScenarioResult(report)
  report.finishedAt = now()
  report.durationMs = Math.max(0, report.finishedAt - report.generatedAt)
  const failed = report.stages.find((stage) => stage.status === 'failed')
  if (failed) {
    report.summary = {
      status: 'failed',
      failedStage: failed.stage,
      message: failed.message ?? `${failed.stage} failed`
    }
    report.releaseReadiness = classifyVerificationReleaseReadiness(report)
    return report
  }

  const passed = report.stages.some((stage) => stage.status === 'passed')
  report.summary = {
    status: passed ? 'passed' : 'skipped',
    message: passed ? 'verification passed' : 'verification was skipped'
  }
  report.releaseReadiness = classifyVerificationReleaseReadiness(report)
  return report
}

export function classifyVerificationReleaseReadiness(
  report: AmneziaHelperVerificationReport
): AmneziaHelperVerificationReport['releaseReadiness'] {
  const blockers: string[] = []
  const warnings: string[] = []
  const stage = (name: AmneziaHelperVerificationStageName) =>
    report.stages.find((item) => item.stage === name)

  if (report.summary.status === 'failed') {
    blockers.push(`stage_failed:${report.summary.failedStage ?? 'unknown'}`)
  }
  if (stage('backend_resolution')?.status !== 'passed') blockers.push('backend_not_resolved')
  if (stage('startup')?.status !== 'passed') blockers.push('startup_not_passed')
  if (stage('readiness')?.status !== 'passed') blockers.push('readiness_not_passed')
  if (stage('connectivity')?.status !== 'passed') blockers.push('connectivity_not_passed')
  if (stage('routing_injection')?.status !== 'passed') blockers.push('routing_not_injected')
  if (stage('cleanup')?.status !== 'passed') blockers.push('cleanup_not_passed')
  if (report.tunEnabled) {
    if (report.tunSafetyBlocked) blockers.push('tun_safety_blocked')
    if (!report.helperTunBypassActive) blockers.push('tun_bypass_not_active')
    if ((report.tunRuntimeInjection?.routeExcludeAddresses.length ?? 0) === 0) {
      blockers.push('tun_bypass_missing')
    }
    if (!report.tunRuntimeInjection?.helperOutboundInjected) {
      blockers.push('tun_runtime_injection_missing')
    }
    if (report.helperRuleReliability === 'blocked') {
      blockers.push('tun_dns_rule_reliability_blocked')
    } else if (report.helperRuleReliability === 'unlikely') {
      warnings.push('tun_dns_rule_reliability_unlikely')
    } else if (report.helperRuleReliability === 'degraded') {
      warnings.push('tun_dns_rule_reliability_degraded')
    }
    if (report.tunScenarioResult !== 'passed') {
      blockers.push(`tun_scenario:${report.tunScenarioResult}`)
    }
    if (report.cleanupRestored === false) blockers.push('tun_cleanup_not_restored')
  }
  if (report.backendKind !== 'production') warnings.push(`backend_kind:${report.backendKind}`)
  if (!report.runtimeAdvertisesUdp) warnings.push(`udp:${report.udpReasonCode}`)
  if (report.stabilityResult) {
    if (report.stabilityResult.summary.status === 'failed') blockers.push('stability_failed')
    if (!report.lifecycleStressPassed) blockers.push('lifecycle_stress_failed')
    if (!report.reloadResiliencePassed) blockers.push('reload_resilience_failed')
    if (report.staleStateDetected) blockers.push('stale_state_detected')
    if (report.cleanupLeakDetected) blockers.push('cleanup_leak_detected')

    const crashRecovery = report.stabilityResult.scenarios.find(
      (scenario) => scenario.scenario === 'crash_recovery'
    )
    if (crashRecovery?.status === 'failed') {
      blockers.push('recovery_failed')
    } else if (crashRecovery?.status === 'skipped') {
      warnings.push('recovery_not_validated')
    }
  }
  if (!report.packaged) warnings.push('not_packaged_app_run')
  if (!report.helperChecksumSha256) warnings.push('helper_checksum_missing')
  if (!report.helperVersion) warnings.push('helper_version_missing')
  if (stage('self_check')?.status === 'skipped') warnings.push('self_check_skipped')
  if (report.fixture.kind !== 'normalized_profile_file') warnings.push('default_fixture_used')

  return {
    status: blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'warning' : 'supported',
    blockers: dedupeStrings(blockers),
    warnings: dedupeStrings(warnings)
  }
}

function isBlockingTunDiagnostic(diagnostic: AmneziaHelperVerificationDiagnostic): boolean {
  if (!diagnostic.code.startsWith('tun_')) return false
  return !['tun_dns_rule_reliability_degraded', 'tun_dns_rule_reliability_unlikely'].includes(
    diagnostic.code
  )
}

function resolveVerificationScenario(input: {
  backendMode: AmneziaHelperBackendMode
  backendPath?: string
  packagedAppPath?: string
}): AmneziaHelperVerificationReport['scenario'] {
  if (input.backendMode === 'stub') return 'stub'
  if (input.backendMode === 'proxy-prototype') return 'prototype'
  if (input.packagedAppPath) return 'packaged'
  if (input.backendPath) return 'override'
  return 'resources'
}

function resolveBackendSource(input: {
  backendMode: AmneziaHelperBackendMode
  backendPath?: string
  packagedAppPath?: string
}): AmneziaHelperVerificationBackendSource {
  if (input.backendMode === 'stub') return 'stub'
  if (input.backendMode === 'proxy-prototype') return 'prototype'
  if (input.backendPath?.trim()) return 'override'
  if (input.packagedAppPath?.trim()) return 'packaged_app'
  if (input.backendMode === 'production') return 'resources_files'
  return 'none'
}

function toStartupResult(
  session: AmneziaHelperSession
): AmneziaHelperVerificationReport['startupResult'] {
  return {
    profileId: session.profileId,
    sessionId: session.sessionId,
    pid: session.pid,
    status: session.status,
    command: session.command,
    args: [...session.args],
    configStatus: session.configStatus,
    configError: session.configError,
    lastError: session.lastError,
    backendMode: session.backendMode,
    tempConfigPath: session.tempConfigPath
  }
}

function cloneTunBypass(
  resolution: AmneziaHelperTunBypassResolution | undefined
): AmneziaHelperTunBypassResolution | undefined {
  if (!resolution) return undefined
  return {
    ...resolution,
    ips: [...resolution.ips],
    routeExcludeAddresses: [...resolution.routeExcludeAddresses],
    warnings: [...resolution.warnings]
  }
}

function trimOutput(value: string): string {
  const maxLength = 8000
  return value.length > maxLength ? value.slice(value.length - maxLength) : value
}

async function checksumFileIfPresent(filePath: string): Promise<string | undefined> {
  try {
    return createHash('sha256')
      .update(await readFile(filePath))
      .digest('hex')
  } catch {
    return undefined
  }
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values))
}

function killChild(child: ChildProcess): void {
  try {
    child.kill('SIGTERM')
  } catch {
    // The process may have already exited; the close/error handlers settle the result.
  }
}
