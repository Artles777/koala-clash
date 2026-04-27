import { existsSync } from 'fs'
import { AmneziaHelperConnectivityResult } from './amnezia-helper-connectivity'
import { AmneziaHelperSession } from './amnezia-helper-manager'

export type AmneziaHelperStabilityScenarioName =
  | 'repeated_start_stop'
  | 'reload_resilience'
  | 'crash_recovery'
  | 'tun_reload_resilience'
  | 'soak'

export type AmneziaHelperStabilityScenarioStatus = 'passed' | 'failed' | 'skipped'
export type AmneziaHelperStabilityReportStatus = 'passed' | 'failed' | 'skipped'

export interface AmneziaHelperStabilityDiagnostic {
  code: string
  message: string
  scenario: AmneziaHelperStabilityScenarioName
  at: number
  details?: Record<string, string | number | boolean>
}

export interface AmneziaHelperStabilityScenarioResult {
  scenario: AmneziaHelperStabilityScenarioName
  status: AmneziaHelperStabilityScenarioStatus
  startedAt: number
  finishedAt: number
  durationMs: number
  iterations?: number
  checks?: number
  diagnostics: AmneziaHelperStabilityDiagnostic[]
  data?: Record<string, string | number | boolean>
}

export interface AmneziaHelperStabilityReport {
  schemaVersion: 1
  profileId: string
  startedAt: number
  finishedAt: number
  durationMs: number
  lifecycleStressPassed: boolean
  reloadResiliencePassed: boolean
  recoveryPassed: boolean
  soakDurationMs: number
  repeatedStartStopCount: number
  staleStateDetected: boolean
  cleanupLeakDetected: boolean
  diagnostics: AmneziaHelperStabilityDiagnostic[]
  scenarios: AmneziaHelperStabilityScenarioResult[]
  summary: {
    status: AmneziaHelperStabilityReportStatus
    message: string
  }
}

export interface AmneziaHelperStabilityManager {
  start(profileId: string): Promise<AmneziaHelperSession>
  stop(profileId?: string): Promise<AmneziaHelperSession>
  stopAll?(): Promise<void>
  getStatus(profileId?: string): AmneziaHelperSession
  validateConnectivity(profileId: string): Promise<AmneziaHelperConnectivityResult>
}

export interface AmneziaHelperStabilityHookContext {
  profileId: string
  scenario: AmneziaHelperStabilityScenarioName
  iteration?: number
  session: AmneziaHelperSession
}

export interface RunAmneziaHelperStabilityOptions {
  profileId: string
  manager: AmneziaHelperStabilityManager
  cycles?: number
  soakDurationMs?: number
  soakIntervalMs?: number
  readinessTimeoutMs?: number
  pollIntervalMs?: number
  includeTunReloadScenario?: boolean
  reload?: (context: AmneziaHelperStabilityHookContext) => Promise<void> | void
  mutateRules?: (context: AmneziaHelperStabilityHookContext) => Promise<void> | void
  crashAndWait?: (context: AmneziaHelperStabilityHookContext) => Promise<void> | void
  now?: () => number
  waitMs?: (ms: number) => Promise<void>
}

interface StabilityScenarioContext extends Omit<
  RunAmneziaHelperStabilityOptions,
  | 'cycles'
  | 'soakDurationMs'
  | 'soakIntervalMs'
  | 'readinessTimeoutMs'
  | 'pollIntervalMs'
  | 'now'
  | 'waitMs'
> {
  cycles: number
  soakDurationMs: number
  soakIntervalMs: number
  readinessTimeoutMs: number
  pollIntervalMs: number
  now: () => number
  waitMs: (ms: number) => Promise<void>
}

type ScenarioRunner = (
  context: StabilityScenarioContext
) => Promise<Omit<AmneziaHelperStabilityScenarioResult, 'startedAt' | 'finishedAt' | 'durationMs'>>

const defaultCycles = 3
const defaultSoakDurationMs = 1000
const defaultSoakIntervalMs = 250
const defaultReadinessTimeoutMs = 5000
const defaultPollIntervalMs = 50

export async function runAmneziaHelperStabilityScenarios(
  options: RunAmneziaHelperStabilityOptions
): Promise<AmneziaHelperStabilityReport> {
  const now = options.now ?? Date.now
  const startedAt = now()
  const context: StabilityScenarioContext = {
    ...options,
    cycles: options.cycles ?? defaultCycles,
    soakDurationMs: options.soakDurationMs ?? defaultSoakDurationMs,
    soakIntervalMs: options.soakIntervalMs ?? defaultSoakIntervalMs,
    readinessTimeoutMs: options.readinessTimeoutMs ?? defaultReadinessTimeoutMs,
    pollIntervalMs: options.pollIntervalMs ?? defaultPollIntervalMs,
    now,
    waitMs: options.waitMs ?? wait
  }

  const scenarios: AmneziaHelperStabilityScenarioResult[] = [
    await runScenario('repeated_start_stop', context, runRepeatedStartStopScenario),
    await runScenario('reload_resilience', context, runReloadResilienceScenario),
    await runScenario('crash_recovery', context, runCrashRecoveryScenario),
    context.includeTunReloadScenario
      ? await runScenario('tun_reload_resilience', context, runTunReloadResilienceScenario)
      : createSkippedScenario(
          'tun_reload_resilience',
          context,
          'TUN reload scenario was not requested'
        ),
    await runScenario('soak', context, runSoakScenario)
  ]

  const diagnostics = scenarios.flatMap((scenario) => scenario.diagnostics)
  const repeatedStartStop = findScenario(scenarios, 'repeated_start_stop')
  const reload = findScenario(scenarios, 'reload_resilience')
  const tunReload = findScenario(scenarios, 'tun_reload_resilience')
  const crashRecovery = findScenario(scenarios, 'crash_recovery')
  const soak = findScenario(scenarios, 'soak')
  const finishedAt = now()
  const failed = scenarios.some((scenario) => scenario.status === 'failed')
  const passed = scenarios.some((scenario) => scenario.status === 'passed')

  return {
    schemaVersion: 1,
    profileId: options.profileId,
    startedAt,
    finishedAt,
    durationMs: Math.max(0, finishedAt - startedAt),
    lifecycleStressPassed: repeatedStartStop?.status === 'passed',
    reloadResiliencePassed:
      reload?.status === 'passed' &&
      (tunReload?.status === 'passed' || tunReload?.status === 'skipped'),
    recoveryPassed: crashRecovery?.status === 'passed',
    soakDurationMs: numberData(soak, 'actualDurationMs'),
    repeatedStartStopCount: repeatedStartStop?.iterations ?? 0,
    staleStateDetected: diagnostics.some(
      (diagnostic) => diagnostic.code === 'stale_state_detected'
    ),
    cleanupLeakDetected: diagnostics.some(
      (diagnostic) => diagnostic.code === 'cleanup_leak_detected'
    ),
    diagnostics,
    scenarios,
    summary: {
      status: failed ? 'failed' : passed ? 'passed' : 'skipped',
      message: failed
        ? 'one or more Amnezia helper stability scenarios failed'
        : passed
          ? 'Amnezia helper stability scenarios passed'
          : 'Amnezia helper stability scenarios were skipped'
    }
  }
}

async function runRepeatedStartStopScenario(
  context: StabilityScenarioContext
): Promise<Omit<AmneziaHelperStabilityScenarioResult, 'startedAt' | 'finishedAt' | 'durationMs'>> {
  const diagnostics: AmneziaHelperStabilityDiagnostic[] = []
  let completed = 0

  for (let iteration = 1; iteration <= context.cycles; iteration += 1) {
    const started = await context.manager.start(context.profileId)
    const ready = await waitForReadySession(context)
    if (!isReadySession(ready)) {
      diagnostics.push(
        createDiagnostic(
          context,
          'repeated_start_stop',
          'lifecycle_start_failed',
          `helper did not become ready on lifecycle iteration ${iteration}`,
          sessionDetails(ready, { iteration })
        )
      )
    }

    const stopped = await context.manager.stop(context.profileId)
    const status = context.manager.getStatus(context.profileId)
    if (isActiveSession(status)) {
      diagnostics.push(
        createDiagnostic(
          context,
          'repeated_start_stop',
          'stale_state_detected',
          `helper remained active after stop on lifecycle iteration ${iteration}`,
          sessionDetails(status, { iteration })
        )
      )
    }
    if (hasTempConfigLeak(stopped) || hasTempConfigLeak(status)) {
      diagnostics.push(
        createDiagnostic(
          context,
          'repeated_start_stop',
          'cleanup_leak_detected',
          `temporary helper config remained after lifecycle iteration ${iteration}`,
          sessionDetails(stopped, { iteration })
        )
      )
    }

    completed += 1
    if (started.status === 'failed') break
  }

  await safeStopAll(context)

  return {
    scenario: 'repeated_start_stop',
    status: diagnostics.length > 0 ? 'failed' : 'passed',
    iterations: completed,
    diagnostics,
    data: {
      requestedIterations: context.cycles
    }
  }
}

async function runReloadResilienceScenario(
  context: StabilityScenarioContext
): Promise<Omit<AmneziaHelperStabilityScenarioResult, 'startedAt' | 'finishedAt' | 'durationMs'>> {
  return runReloadScenario(context, 'reload_resilience')
}

async function runTunReloadResilienceScenario(
  context: StabilityScenarioContext
): Promise<Omit<AmneziaHelperStabilityScenarioResult, 'startedAt' | 'finishedAt' | 'durationMs'>> {
  return runReloadScenario(context, 'tun_reload_resilience')
}

async function runReloadScenario(
  context: StabilityScenarioContext,
  scenario: 'reload_resilience' | 'tun_reload_resilience'
): Promise<Omit<AmneziaHelperStabilityScenarioResult, 'startedAt' | 'finishedAt' | 'durationMs'>> {
  const diagnostics: AmneziaHelperStabilityDiagnostic[] = []
  const started = await context.manager.start(context.profileId)
  const ready = await waitForReadySession(context)
  if (!isReadySession(ready)) {
    diagnostics.push(
      createDiagnostic(
        context,
        scenario,
        'reload_start_failed',
        'helper did not become ready before reload validation',
        sessionDetails(ready)
      )
    )
  } else {
    try {
      await context.mutateRules?.({
        profileId: context.profileId,
        scenario,
        session: ready
      })
      await context.reload?.({
        profileId: context.profileId,
        scenario,
        session: ready
      })
    } catch (error) {
      diagnostics.push(
        createDiagnostic(
          context,
          scenario,
          'reload_hook_failed',
          error instanceof Error ? error.message : String(error)
        )
      )
    }

    const afterReload = context.manager.getStatus(context.profileId)
    if (!isReadySession(afterReload)) {
      diagnostics.push(
        createDiagnostic(
          context,
          scenario,
          'helper_not_ready_after_reload',
          'helper was not ready after reload',
          sessionDetails(afterReload)
        )
      )
    }
    if (afterReload.routingTarget?.status !== 'injected') {
      diagnostics.push(
        createDiagnostic(
          context,
          scenario,
          'routing_target_missing_after_reload',
          'AMNEZIA_HELPER routing target was not injected after reload',
          sessionDetails(afterReload)
        )
      )
    }
  }

  const stopped = await context.manager.stop(context.profileId)
  if (hasTempConfigLeak(stopped)) {
    diagnostics.push(
      createDiagnostic(
        context,
        scenario,
        'cleanup_leak_detected',
        'temporary helper config remained after reload validation',
        sessionDetails(stopped)
      )
    )
  }
  await safeStopAll(context)

  return {
    scenario,
    status: diagnostics.length > 0 || started.status === 'failed' ? 'failed' : 'passed',
    diagnostics,
    data: {
      rulesMutationHookConfigured: Boolean(context.mutateRules),
      reloadHookConfigured: Boolean(context.reload)
    }
  }
}

async function runCrashRecoveryScenario(
  context: StabilityScenarioContext
): Promise<Omit<AmneziaHelperStabilityScenarioResult, 'startedAt' | 'finishedAt' | 'durationMs'>> {
  if (!context.crashAndWait) {
    return {
      scenario: 'crash_recovery',
      status: 'skipped',
      diagnostics: [
        createDiagnostic(
          context,
          'crash_recovery',
          'crash_hook_missing',
          'crash recovery validation requires a crash hook'
        )
      ],
      data: {
        crashHookConfigured: false
      }
    }
  }

  const diagnostics: AmneziaHelperStabilityDiagnostic[] = []
  const started = await context.manager.start(context.profileId)
  const ready = await waitForReadySession(context)
  if (!isReadySession(ready)) {
    diagnostics.push(
      createDiagnostic(
        context,
        'crash_recovery',
        'crash_start_failed',
        'helper did not become ready before crash validation',
        sessionDetails(ready)
      )
    )
  } else {
    await context.crashAndWait({
      profileId: context.profileId,
      scenario: 'crash_recovery',
      session: ready
    })
    const crashed = await waitForTerminalSession(context)
    if (crashed.status !== 'failed') {
      diagnostics.push(
        createDiagnostic(
          context,
          'crash_recovery',
          'crash_not_detected',
          'helper crash did not produce a failed session state',
          sessionDetails(crashed)
        )
      )
    }
    if (crashed.routingTarget?.status === 'injected') {
      diagnostics.push(
        createDiagnostic(
          context,
          'crash_recovery',
          'stale_state_detected',
          'routing target remained injected after helper crash',
          sessionDetails(crashed)
        )
      )
    }

    const restarted = await context.manager.start(context.profileId)
    const restartReady = await waitForReadySession(context)
    if (!isReadySession(restartReady)) {
      diagnostics.push(
        createDiagnostic(
          context,
          'crash_recovery',
          'restart_after_crash_failed',
          'helper did not become ready after crash restart',
          sessionDetails(restartReady)
        )
      )
    }
    if (restarted.status === 'failed') {
      diagnostics.push(
        createDiagnostic(
          context,
          'crash_recovery',
          'restart_after_crash_failed',
          restarted.lastError ?? 'helper restart failed after crash',
          sessionDetails(restarted)
        )
      )
    }
  }

  const stopped = await context.manager.stop(context.profileId)
  if (hasTempConfigLeak(stopped)) {
    diagnostics.push(
      createDiagnostic(
        context,
        'crash_recovery',
        'cleanup_leak_detected',
        'temporary helper config remained after crash recovery validation',
        sessionDetails(stopped)
      )
    )
  }
  await safeStopAll(context)

  return {
    scenario: 'crash_recovery',
    status: diagnostics.length > 0 || started.status === 'failed' ? 'failed' : 'passed',
    diagnostics,
    data: {
      crashHookConfigured: true
    }
  }
}

async function runSoakScenario(
  context: StabilityScenarioContext
): Promise<Omit<AmneziaHelperStabilityScenarioResult, 'startedAt' | 'finishedAt' | 'durationMs'>> {
  if (context.soakDurationMs <= 0) {
    return {
      scenario: 'soak',
      status: 'skipped',
      diagnostics: [],
      data: {
        requestedDurationMs: context.soakDurationMs,
        actualDurationMs: 0
      }
    }
  }

  const diagnostics: AmneziaHelperStabilityDiagnostic[] = []
  const wallStartedAt = Date.now()
  let checks = 0
  const started = await context.manager.start(context.profileId)
  const ready = await waitForReadySession(context)
  if (!isReadySession(ready)) {
    diagnostics.push(
      createDiagnostic(
        context,
        'soak',
        'soak_start_failed',
        'helper did not become ready before soak validation',
        sessionDetails(ready)
      )
    )
  } else {
    const deadline = Date.now() + context.soakDurationMs
    while (Date.now() < deadline) {
      const current = context.manager.getStatus(context.profileId)
      if (!isReadySession(current)) {
        diagnostics.push(
          createDiagnostic(
            context,
            'soak',
            'helper_not_ready_during_soak',
            'helper was not ready during soak validation',
            sessionDetails(current, { check: checks + 1 })
          )
        )
        break
      }

      const connectivity = await context.manager.validateConnectivity(context.profileId)
      checks += 1
      if (connectivity.status !== 'verified') {
        diagnostics.push(
          createDiagnostic(
            context,
            'soak',
            'periodic_connectivity_failed',
            connectivity.diagnostic?.message ?? 'periodic helper connectivity check failed',
            {
              check: checks,
              validationStage: connectivity.validationStage
            }
          )
        )
        break
      }

      if (Date.now() < deadline) {
        await context.waitMs(Math.min(context.soakIntervalMs, Math.max(0, deadline - Date.now())))
      }
    }
  }

  const stopped = await context.manager.stop(context.profileId)
  if (hasTempConfigLeak(stopped)) {
    diagnostics.push(
      createDiagnostic(
        context,
        'soak',
        'cleanup_leak_detected',
        'temporary helper config remained after soak validation',
        sessionDetails(stopped)
      )
    )
  }
  await safeStopAll(context)

  return {
    scenario: 'soak',
    status: diagnostics.length > 0 || started.status === 'failed' ? 'failed' : 'passed',
    checks,
    diagnostics,
    data: {
      requestedDurationMs: context.soakDurationMs,
      actualDurationMs: Date.now() - wallStartedAt
    }
  }
}

async function runScenario(
  scenario: AmneziaHelperStabilityScenarioName,
  context: StabilityScenarioContext,
  runner: ScenarioRunner
): Promise<AmneziaHelperStabilityScenarioResult> {
  const startedAt = context.now()
  try {
    const result = await runner(context)
    const finishedAt = context.now()
    return {
      ...result,
      startedAt,
      finishedAt,
      durationMs: Math.max(0, finishedAt - startedAt)
    }
  } catch (error) {
    await safeStopAll(context)
    const finishedAt = context.now()
    return {
      scenario,
      status: 'failed',
      startedAt,
      finishedAt,
      durationMs: Math.max(0, finishedAt - startedAt),
      diagnostics: [
        createDiagnostic(
          context,
          scenario,
          'scenario_exception',
          error instanceof Error ? error.message : String(error)
        )
      ]
    }
  }
}

function createSkippedScenario(
  scenario: AmneziaHelperStabilityScenarioName,
  context: StabilityScenarioContext,
  message: string
): AmneziaHelperStabilityScenarioResult {
  const at = context.now()
  return {
    scenario,
    status: 'skipped',
    startedAt: at,
    finishedAt: at,
    durationMs: 0,
    diagnostics: [createDiagnostic(context, scenario, `${scenario}_skipped`, message)],
    data: {
      requested: false
    }
  }
}

async function waitForReadySession(
  context: StabilityScenarioContext
): Promise<AmneziaHelperSession> {
  return waitForSession(
    context,
    (session) =>
      isReadySession(session) ||
      session.status === 'failed' ||
      session.status === 'stopped' ||
      session.readiness === 'failed'
  )
}

async function waitForTerminalSession(
  context: StabilityScenarioContext
): Promise<AmneziaHelperSession> {
  return waitForSession(
    context,
    (session) => session.status === 'failed' || session.status === 'stopped'
  )
}

async function waitForSession(
  context: StabilityScenarioContext,
  predicate: (session: AmneziaHelperSession) => boolean
): Promise<AmneziaHelperSession> {
  const deadline = Date.now() + context.readinessTimeoutMs
  while (Date.now() < deadline) {
    const session = context.manager.getStatus(context.profileId)
    if (predicate(session)) return session
    await context.waitMs(context.pollIntervalMs)
  }

  return context.manager.getStatus(context.profileId)
}

function isReadySession(session: AmneziaHelperSession): boolean {
  return session.status === 'running' && session.readiness === 'ready'
}

function isActiveSession(session: AmneziaHelperSession): boolean {
  return (
    session.status === 'starting' || session.status === 'running' || session.status === 'stopping'
  )
}

function hasTempConfigLeak(session: AmneziaHelperSession): boolean {
  return Boolean(session.tempConfigPath && existsSync(session.tempConfigPath))
}

async function safeStopAll(context: StabilityScenarioContext): Promise<void> {
  await context.manager.stop(context.profileId).catch(() => undefined)
  await context.manager.stopAll?.().catch(() => undefined)
}

function createDiagnostic(
  context: StabilityScenarioContext,
  scenario: AmneziaHelperStabilityScenarioName,
  code: string,
  message: string,
  details?: Record<string, string | number | boolean>
): AmneziaHelperStabilityDiagnostic {
  return {
    code,
    message,
    scenario,
    at: context.now(),
    details
  }
}

function sessionDetails(
  session: AmneziaHelperSession,
  extra?: Record<string, string | number | boolean>
): Record<string, string | number | boolean> {
  return {
    status: session.status,
    readiness: session.readiness,
    connectivityStatus: session.connectivityStatus,
    routingTargetStatus: session.routingTarget?.status ?? 'missing',
    sessionId: session.sessionId,
    pid: session.pid ?? 0,
    ...extra
  }
}

function findScenario(
  scenarios: AmneziaHelperStabilityScenarioResult[],
  scenario: AmneziaHelperStabilityScenarioName
): AmneziaHelperStabilityScenarioResult | undefined {
  return scenarios.find((item) => item.scenario === scenario)
}

function numberData(
  scenario: AmneziaHelperStabilityScenarioResult | undefined,
  key: string
): number {
  const value = scenario?.data?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
