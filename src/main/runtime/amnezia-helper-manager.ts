import { ChildProcess, spawn as nodeSpawn } from 'child_process'
import { existsSync } from 'fs'
import { mkdir, rm, writeFile } from 'fs/promises'
import net from 'net'
import * as path from 'path'
import { randomUUID } from 'crypto'
import { DesktopRuntimeExecutionPlan } from '../../core/profiles/desktop-runtime-adapter'
import {
  AmneziaHelperBackendMode,
  AmneziaHelperLocalEndpoint,
  AmneziaHelperRuntimeConfig,
  withLocalProxyEndpoint
} from '../../core/profiles/amnezia-helper-runtime-config'
import {
  AmneziaHelperRoutingTarget,
  createAmneziaHelperRoutingTarget
} from '../../core/routing/amnezia-helper-routing'
import {
  AmneziaHelperUdpCapability,
  createInitialAmneziaHelperUdpCapability
} from '../../core/routing/amnezia-helper-udp-capability'
import {
  AmneziaHelperTunBypassResolution,
  createAmneziaHelperTunBypassNotRequired
} from '../../core/routing/amnezia-helper-tun-bypass'
import { updateAmneziaHelperRoutingTargetFromSession } from './amnezia-helper-routing-state'
import { resolveAmneziaHelperTunBypass } from './amnezia-helper-tun-bypass-resolver'
import {
  generateBackendConfig,
  getBackendLaunchArgs,
  mapExecutableValidationIssueToDiagnosticKind,
  parseBackendDiagnostics,
  resolveHelperBackend,
  AmneziaHelperBackendDiagnosticKind,
  ResolvedAmneziaHelperBackend
} from './amnezia-helper-backend-provider'
import {
  AmneziaHelperStartupPreflightReason,
  AmneziaHelperStartupPreflightResult,
  createAmneziaHelperStartupPreflight,
  mapStartupPreflightReasonToRuntimeCategory
} from './amnezia-helper-startup-preflight'
import {
  AmneziaHelperConnectivityResult,
  AmneziaHelperConnectivityStatus,
  AmneziaHelperRuntimeDiagnostic,
  AmneziaHelperValidationStage,
  createAmneziaHelperDiagnostic,
  runAmneziaHelperConnectivityValidation,
  ValidateAmneziaHelperConnectivityInput
} from './amnezia-helper-connectivity'
import {
  validateAmneziaHelperUdpCapability,
  ValidateAmneziaHelperUdpCapabilityInput
} from './amnezia-helper-udp-validation'
import { updateAmneziaHelperTunBypassState } from './amnezia-helper-tun-bypass-state'

export type AmneziaHelperSessionStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'failed'
export type AmneziaHelperReadinessStatus = 'unknown' | 'checking' | 'ready' | 'failed'
export type AmneziaHelperConfigStatus = 'not_generated' | 'generated' | 'failed'

export interface AmneziaHelperSession {
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
  localEndpoint?: AmneziaHelperLocalEndpoint
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
}

export interface AmneziaHelperLogEntry {
  at: number
  stream: 'manager' | 'stdout' | 'stderr'
  message: string
}

export interface AmneziaHelperManagerDependencies {
  loadExecutionPlan: (profileId: string) => Promise<DesktopRuntimeExecutionPlan | undefined>
  runtimeDir: string
  proxyBackendPath: string
  helperStubPath: string
  backendMode?: AmneziaHelperBackendMode
  productionBackendPath?: string
  resourcesFilesDir?: string
  command?: string
  spawnProcess?: typeof nodeSpawn
  env?: NodeJS.ProcessEnv
  now?: () => number
  sessionId?: () => string
  allocatePort?: (host: string) => Promise<number>
  readinessTimeoutMs?: number
  readinessPollIntervalMs?: number
  validateConnectivity?: (
    input: ValidateAmneziaHelperConnectivityInput
  ) => Promise<AmneziaHelperConnectivityResult>
  validateUdpCapability?: (
    input: ValidateAmneziaHelperUdpCapabilityInput
  ) => Promise<AmneziaHelperUdpCapability>
  syncRoutingState?: (session: AmneziaHelperSession) => Promise<void> | void
  isTunEnabled?: () => Promise<boolean> | boolean
  resolveTunBypass?: (input: {
    runtimeConfig: AmneziaHelperRuntimeConfig
    tunEnabled: boolean
  }) => Promise<AmneziaHelperTunBypassResolution>
  syncTunBypassState?: (
    resolution: AmneziaHelperTunBypassResolution | undefined
  ) => Promise<void> | void
}

interface AmneziaHelperEntry {
  session: AmneziaHelperSession
  child?: ChildProcess
  logs: AmneziaHelperLogEntry[]
  closePromise?: Promise<void>
  resolveClose?: () => void
}

const activeStatuses = new Set<AmneziaHelperSessionStatus>(['starting', 'running', 'stopping'])
const maxLogEntries = 200

let defaultManager: AmneziaHelperManager | undefined

export class AmneziaHelperManager {
  private readonly sessions = new Map<string, AmneziaHelperEntry>()
  private readonly loadExecutionPlan: AmneziaHelperManagerDependencies['loadExecutionPlan']
  private readonly runtimeDir: string
  private readonly proxyBackendPath: string
  private readonly helperStubPath: string
  private readonly backendMode: AmneziaHelperBackendMode
  private readonly productionBackendPath?: string
  private readonly resourcesFilesDir?: string
  private readonly command: string
  private readonly spawnProcess: typeof nodeSpawn
  private readonly env: NodeJS.ProcessEnv
  private readonly now: () => number
  private readonly createSessionId: () => string
  private readonly allocatePort: (host: string) => Promise<number>
  private readonly readinessTimeoutMs: number
  private readonly readinessPollIntervalMs: number
  private readonly validateConnectivityImpl: (
    input: ValidateAmneziaHelperConnectivityInput
  ) => Promise<AmneziaHelperConnectivityResult>
  private readonly validateUdpCapabilityImpl: (
    input: ValidateAmneziaHelperUdpCapabilityInput
  ) => Promise<AmneziaHelperUdpCapability>
  private readonly syncRoutingState: (session: AmneziaHelperSession) => Promise<void> | void
  private readonly isTunEnabled: () => Promise<boolean> | boolean
  private readonly resolveTunBypass: (input: {
    runtimeConfig: AmneziaHelperRuntimeConfig
    tunEnabled: boolean
  }) => Promise<AmneziaHelperTunBypassResolution>
  private readonly syncTunBypassState: (
    resolution: AmneziaHelperTunBypassResolution | undefined
  ) => Promise<void> | void

  constructor(dependencies: AmneziaHelperManagerDependencies) {
    this.loadExecutionPlan = dependencies.loadExecutionPlan
    this.runtimeDir = dependencies.runtimeDir
    this.proxyBackendPath = dependencies.proxyBackendPath
    this.helperStubPath = dependencies.helperStubPath
    this.backendMode = dependencies.backendMode ?? 'production'
    this.productionBackendPath = dependencies.productionBackendPath
    this.resourcesFilesDir = dependencies.resourcesFilesDir
    this.command = dependencies.command ?? process.execPath
    this.spawnProcess = dependencies.spawnProcess ?? nodeSpawn
    this.env = dependencies.env ?? process.env
    this.now = dependencies.now ?? Date.now
    this.createSessionId = dependencies.sessionId ?? randomUUID
    this.allocatePort = dependencies.allocatePort ?? allocateLocalPort
    this.readinessTimeoutMs = dependencies.readinessTimeoutMs ?? 5000
    this.readinessPollIntervalMs = dependencies.readinessPollIntervalMs ?? 100
    this.validateConnectivityImpl =
      dependencies.validateConnectivity ?? runAmneziaHelperConnectivityValidation
    this.validateUdpCapabilityImpl =
      dependencies.validateUdpCapability ?? validateAmneziaHelperUdpCapability
    this.syncRoutingState = dependencies.syncRoutingState ?? (() => undefined)
    this.isTunEnabled = dependencies.isTunEnabled ?? (() => false)
    this.resolveTunBypass =
      dependencies.resolveTunBypass ??
      ((input) => resolveAmneziaHelperTunBypass({ ...input, now: this.now }))
    this.syncTunBypassState = dependencies.syncTunBypassState ?? (() => undefined)
  }

  async start(profileId: string): Promise<AmneziaHelperSession> {
    const existing = this.sessions.get(profileId)
    if (existing && activeStatuses.has(existing.session.status)) {
      this.appendLog(existing, 'manager', 'duplicate start ignored for active profile')
      return cloneSession(existing.session)
    }

    const active = this.getActiveEntry()
    if (active) {
      throw new Error(
        `Another Amnezia helper session is already active: ${active.session.profileId}`
      )
    }

    await mkdir(this.runtimeDir, { recursive: true })
    const preflight = await this.preflight(profileId)
    if (!preflight.canStart) {
      return this.createFailedPreflightSession(profileId, preflight)
    }

    const plan = await this.loadExecutionPlan(profileId)
    if (!plan?.helper || (plan.status !== 'ready' && plan.status !== 'dry_run')) {
      throw new Error('Amnezia helper execution plan is not available for this profile')
    }

    const sessionId = this.createSessionId()
    const tempConfigPath = path.join(this.runtimeDir, `${sessionId}.json`)
    const backend = this.resolveBackend()
    const sessionBase: AmneziaHelperSession = {
      profileId,
      sessionId,
      status: 'starting',
      startedAt: this.now(),
      command: backend.command,
      args: [],
      tempConfigPath,
      backendMode: backend.mode,
      readiness: backend.mode === 'stub' ? 'ready' : 'checking',
      startupDiagnostics: [],
      runtimeDiagnostics: [],
      configStatus: 'not_generated',
      connectivityStatus: 'unknown',
      validationStage: 'not_started',
      udpCapability: createInitialAmneziaHelperUdpCapability(backend.mode, this.now())
    }

    let runtimeConfig: AmneziaHelperRuntimeConfig
    try {
      runtimeConfig = await this.prepareRuntimeConfig(plan.helper.config, backend.mode)
      const backendConfig = generateBackendConfig(backend, runtimeConfig)
      await writeFile(tempConfigPath, JSON.stringify(backendConfig, null, 2), 'utf-8')
      sessionBase.configStatus = 'generated'
      sessionBase.localEndpoint = runtimeConfig.localProxy
    } catch (error) {
      sessionBase.status = 'failed'
      sessionBase.readiness = 'failed'
      sessionBase.configStatus = 'failed'
      sessionBase.configError = error instanceof Error ? error.message : String(error)
      sessionBase.lastError = sessionBase.configError
      const failedEntry: AmneziaHelperEntry = { session: sessionBase, logs: [] }
      this.sessions.set(profileId, failedEntry)
      this.pushRuntimeDiagnostic(
        failedEntry,
        'config_generation_failure',
        'config_generation',
        sessionBase.lastError
      )
      await this.publishRoutingState(failedEntry)
      this.appendLog(failedEntry, 'manager', sessionBase.lastError)
      return cloneSession(failedEntry.session)
    }

    const args = getBackendLaunchArgs(backend, {
      configPath: tempConfigPath,
      sessionId,
      profileId
    })
    const entry: AmneziaHelperEntry = {
      session: {
        ...sessionBase,
        args
      },
      logs: []
    }

    this.sessions.set(profileId, entry)
    this.updateSessionRoutingTarget(entry)
    const tunBypassReady = await this.prepareTunBypassForStart(entry, runtimeConfig)
    if (!tunBypassReady) return cloneSession(entry.session)
    backend.diagnostics.forEach((message) => this.appendLog(entry, 'manager', message))
    this.appendLog(entry, 'manager', `${backend.kind} backend config generated`)
    this.appendLog(entry, 'manager', `starting ${backend.mode} helper backend`)
    if (!backend.available || !existsSync(backend.executablePath)) {
      const validationKind = mapExecutableValidationIssueToDiagnosticKind(
        backend.validation?.issues[0]
      )
      entry.session.status = 'failed'
      entry.session.readiness = 'failed'
      entry.session.lastError = `Amnezia helper backend unavailable: ${
        backend.executablePath || 'not configured'
      }`
      entry.session.stoppedAt = this.now()
      this.pushRuntimeDiagnostic(
        entry,
        mapBackendDiagnosticKindToRuntimeCategory(validationKind),
        'backend_resolution',
        entry.session.lastError,
        {
          executablePath: backend.executablePath,
          diagnosticKind: validationKind
        }
      )
      await this.publishRoutingState(entry)
      await this.publishTunBypassState(entry, undefined)
      this.appendLog(entry, 'manager', entry.session.lastError)
      await this.cleanupEntry(entry)
      return cloneSession(entry.session)
    }

    const child = this.spawnProcess(backend.command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...this.env,
        ...(backend.runAsNode ? { ELECTRON_RUN_AS_NODE: '1' } : {})
      }
    })
    entry.child = child
    entry.session.pid = child.pid
    entry.closePromise = new Promise((resolve) => {
      entry.resolveClose = resolve
    })

    child.stdout.on('data', (data) => this.appendData(entry, 'stdout', data))
    child.stderr.on('data', (data) => this.appendData(entry, 'stderr', data))
    child.once('close', (code, signal) => {
      void this.handleProcessClose(entry, code, signal)
    })

    await new Promise<void>((resolve, reject) => {
      child.once('spawn', () => {
        entry.session.status = 'running'
        entry.session.readiness = backend.mode === 'stub' ? 'ready' : 'checking'
        entry.session.pid = child.pid
        this.appendLog(entry, 'manager', `helper backend running pid=${child.pid ?? 'unknown'}`)
        void this.publishRoutingState(entry)
        if (backend.mode !== 'stub') {
          void this.watchReadiness(entry)
        }
        resolve()
      })
      child.once('error', (error) => {
        void this.failEntry(entry, error, 'backend_spawn_failure', 'process_spawn')
        reject(error)
      })
    })

    return cloneSession(entry.session)
  }

  async preflight(profileId: string): Promise<AmneziaHelperStartupPreflightResult> {
    let plan: DesktopRuntimeExecutionPlan | undefined
    let planLoadError: unknown
    try {
      plan = await this.loadExecutionPlan(profileId)
    } catch (error) {
      planLoadError = error
    }

    const backend = this.resolveBackend()
    const tunEnabled = await this.isTunEnabled()
    return createAmneziaHelperStartupPreflight({
      profileId,
      plan,
      planLoadError,
      backend,
      prepareRuntimeConfig: (config, backendMode) => this.prepareRuntimeConfig(config, backendMode),
      tunEnabled,
      resolveTunBypass: this.resolveTunBypass,
      now: this.now
    })
  }

  async stop(profileId?: string): Promise<AmneziaHelperSession> {
    const entry = this.getActiveEntry(profileId)
    if (!entry) return this.getStatus(profileId)
    if (!entry.child || entry.session.status === 'stopping') return cloneSession(entry.session)

    entry.session.status = 'stopping'
    this.appendLog(entry, 'manager', 'stopping helper backend')
    await this.publishRoutingState(entry)

    await this.stopChild(entry)
    return cloneSession(entry.session)
  }

  async stopAll(): Promise<void> {
    const activeEntries = Array.from(this.sessions.values()).filter((entry) =>
      activeStatuses.has(entry.session.status)
    )
    await Promise.all(activeEntries.map((entry) => this.stop(entry.session.profileId)))
  }

  getStatus(profileId?: string): AmneziaHelperSession {
    const entry = profileId ? this.sessions.get(profileId) : this.getActiveEntry()
    if (entry) return cloneSession(entry.session)

    return {
      profileId: profileId ?? '',
      sessionId: '',
      status: 'idle',
      command: '',
      args: [],
      backendMode: this.backendMode,
      readiness: 'unknown',
      startupDiagnostics: [],
      runtimeDiagnostics: [],
      configStatus: 'not_generated',
      connectivityStatus: 'unknown',
      validationStage: 'not_started',
      udpCapability: createInitialAmneziaHelperUdpCapability(this.backendMode, this.now())
    }
  }

  getLogs(profileId?: string): AmneziaHelperLogEntry[] {
    const entry = profileId ? this.sessions.get(profileId) : this.getActiveEntry()
    return entry ? entry.logs.map((log) => ({ ...log })) : []
  }

  private getActiveEntry(profileId?: string): AmneziaHelperEntry | undefined {
    if (profileId) {
      const entry = this.sessions.get(profileId)
      return entry && activeStatuses.has(entry.session.status) ? entry : undefined
    }

    return Array.from(this.sessions.values()).find((entry) =>
      activeStatuses.has(entry.session.status)
    )
  }

  private async createFailedPreflightSession(
    profileId: string,
    preflight: AmneziaHelperStartupPreflightResult
  ): Promise<AmneziaHelperSession> {
    const sessionId = this.createSessionId()
    const primaryBlocker = preflight.blockingReasons[0]
    const configBlocker = preflight.blockingReasons.find((reason) =>
      isConfigPreflightReason(reason)
    )
    const startupDiagnostics = [
      ...preflight.blockingReasons.map(formatPreflightReason),
      ...preflight.warnings.map(formatPreflightReason)
    ].slice(-50)
    const configBlocked = Boolean(configBlocker)
    const session: AmneziaHelperSession = {
      profileId,
      sessionId,
      status: 'failed',
      startedAt: this.now(),
      stoppedAt: this.now(),
      lastError: primaryBlocker?.message ?? 'Amnezia helper startup preflight failed',
      command: preflight.backend.command,
      args: [],
      backendMode: preflight.backend.mode,
      readiness: 'failed',
      localEndpoint: preflight.localEndpoint,
      startupDiagnostics: [],
      runtimeDiagnostics: preflight.blockingReasons.map((reason) =>
        createAmneziaHelperDiagnostic(
          mapStartupPreflightReasonToRuntimeCategory(reason.code),
          reason.stage,
          reason.message,
          this.now(),
          {
            reasonCode: reason.code,
            ...(reason.details ?? {})
          }
        )
      ),
      configStatus: configBlocked ? 'failed' : 'not_generated',
      configError: configBlocker?.message,
      tunBypass: preflight.tunBypass,
      connectivityStatus: 'failed',
      validationStage: 'not_started',
      udpCapability: createInitialAmneziaHelperUdpCapability(preflight.backend.mode, this.now())
    }
    const entry: AmneziaHelperEntry = { session, logs: [] }
    this.sessions.set(profileId, entry)
    for (const diagnostic of startupDiagnostics) {
      this.appendLog(entry, 'manager', diagnostic)
    }
    await this.publishTunBypassState(entry, preflight.tunBypass)
    await this.publishRoutingState(entry)
    return cloneSession(entry.session)
  }

  async validateConnectivity(profileId: string): Promise<AmneziaHelperConnectivityResult> {
    const entry = this.sessions.get(profileId)
    if (!entry || entry.session.status !== 'running' || entry.session.readiness !== 'ready') {
      const session = entry?.session ?? this.getStatus(profileId)
      const endpoint =
        session.localEndpoint ??
        ({
          host: '127.0.0.1',
          port: 0,
          protocol: 'socks5'
        } satisfies AmneziaHelperLocalEndpoint)
      const result: AmneziaHelperConnectivityResult = {
        profileId,
        status: 'failed',
        validationStage: 'tcp_connect',
        checkedAt: this.now(),
        durationMs: 0,
        endpoint,
        stages: [
          {
            stage: 'tcp_connect',
            status: 'skipped',
            message: 'Helper endpoint is not ready'
          }
        ],
        diagnostic: createAmneziaHelperDiagnostic(
          'endpoint_unreachable',
          'tcp_connect',
          'Helper endpoint is not ready',
          this.now()
        )
      }
      if (entry) this.applyConnectivityResult(entry, result)
      return result
    }

    const endpoint = entry.session.localEndpoint
    if (!endpoint) {
      const result: AmneziaHelperConnectivityResult = {
        profileId,
        status: 'failed',
        validationStage: 'tcp_connect',
        checkedAt: this.now(),
        durationMs: 0,
        endpoint: {
          host: '127.0.0.1',
          port: 0,
          protocol: 'socks5'
        },
        stages: [
          {
            stage: 'tcp_connect',
            status: 'failed',
            message: 'Local proxy endpoint is missing'
          }
        ],
        diagnostic: createAmneziaHelperDiagnostic(
          'endpoint_unreachable',
          'tcp_connect',
          'Local proxy endpoint is missing',
          this.now()
        )
      }
      this.applyConnectivityResult(entry, result)
      return result
    }

    entry.session.connectivityStatus = 'checking'
    entry.session.validationStage = 'tcp_connect'
    entry.session.lastConnectivityCheckAt = this.now()
    entry.session.lastConnectivityError = undefined
    this.appendLog(entry, 'manager', 'connectivity validation started')

    const result = await this.validateConnectivityImpl({
      profileId,
      endpoint,
      now: this.now
    })
    this.applyConnectivityResult(entry, result)
    if (result.status === 'verified') {
      await this.validateAndPublishUdpCapability(entry, endpoint)
    } else {
      entry.session.udpCapability = createInitialAmneziaHelperUdpCapability(
        entry.session.backendMode,
        this.now()
      )
      await this.publishRoutingState(entry)
    }
    this.appendLog(
      entry,
      'manager',
      result.status === 'verified'
        ? `connectivity validation verified in ${result.durationMs}ms`
        : `connectivity validation failed at ${result.validationStage}: ${
            result.diagnostic?.category ?? result.diagnostic?.message ?? 'unknown'
          }`
    )

    return {
      ...result,
      endpoint: { ...result.endpoint },
      stages: result.stages.map((stage) => ({ ...stage })),
      diagnostic: result.diagnostic ? cloneDiagnostic(result.diagnostic) : undefined
    }
  }

  getLastConnectivityResult(profileId?: string): AmneziaHelperConnectivityResult | undefined {
    const entry = profileId ? this.sessions.get(profileId) : this.getActiveEntry()
    const result = entry?.session.connectivityResult
    return result
      ? {
          ...result,
          endpoint: { ...result.endpoint },
          stages: result.stages.map((stage) => ({ ...stage })),
          diagnostic: result.diagnostic ? cloneDiagnostic(result.diagnostic) : undefined
        }
      : undefined
  }

  private appendData(
    entry: AmneziaHelperEntry,
    stream: AmneziaHelperLogEntry['stream'],
    data: Buffer
  ): void {
    data
      .toString()
      .split(/\r?\n/)
      .filter(Boolean)
      .forEach((message) => this.appendLog(entry, stream, message))
  }

  private appendLog(
    entry: AmneziaHelperEntry,
    stream: AmneziaHelperLogEntry['stream'],
    message: string
  ): void {
    entry.logs.push({
      at: this.now(),
      stream,
      message
    })
    if (entry.logs.length > maxLogEntries) {
      entry.logs.splice(0, entry.logs.length - maxLogEntries)
    }
    const backendDiagnostic = parseBackendDiagnostics(message)
    if (stream === 'manager' || stream === 'stderr' || backendDiagnostic) {
      entry.session.startupDiagnostics.push(backendDiagnostic?.message ?? message)
      if (entry.session.startupDiagnostics.length > 50) {
        entry.session.startupDiagnostics.splice(0, entry.session.startupDiagnostics.length - 50)
      }
    }
    if (backendDiagnostic && isBackendRuntimeFailureDiagnostic(backendDiagnostic.kind)) {
      this.pushRuntimeDiagnostic(
        entry,
        mapBackendDiagnosticKindToRuntimeCategory(backendDiagnostic.kind),
        'backend_output',
        backendDiagnostic.message
      )
    }
  }

  private async stopChild(entry: AmneziaHelperEntry): Promise<void> {
    const child = entry.child
    if (!child || child.killed) {
      await this.cleanupEntry(entry)
      return
    }

    const timers: NodeJS.Timeout[] = []
    const closePromise = entry.closePromise ?? Promise.resolve()

    try {
      child.kill('SIGINT')

      timers.push(
        setTimeout(() => {
          if (this.isChildAlive(child)) child.kill('SIGTERM')
        }, 3000)
      )
      timers.push(
        setTimeout(() => {
          if (this.isChildAlive(child)) child.kill('SIGKILL')
        }, 6000)
      )

      await Promise.race([
        closePromise,
        new Promise<void>((resolve) => {
          timers.push(setTimeout(resolve, 8000))
        })
      ])

      if (entry.session.status === 'stopping' && this.isChildAlive(child)) {
        child.kill('SIGKILL')
        entry.session.status = 'failed'
        entry.session.lastError = 'Helper did not stop before timeout'
        entry.session.stoppedAt = this.now()
        this.appendLog(entry, 'manager', entry.session.lastError)
      }
    } finally {
      timers.forEach((timer) => clearTimeout(timer))
    }
  }

  private async handleProcessClose(
    entry: AmneziaHelperEntry,
    code: number | null,
    signal: NodeJS.Signals | null
  ): Promise<void> {
    if (entry.session.status === 'stopping' || code === 0) {
      entry.session.status = 'stopped'
      entry.session.readiness = 'unknown'
      entry.session.connectivityStatus = 'unknown'
      entry.session.validationStage = 'not_started'
      this.appendLog(entry, 'manager', `helper backend stopped code=${code} signal=${signal ?? ''}`)
    } else {
      entry.session.status = 'failed'
      entry.session.readiness = 'failed'
      entry.session.connectivityStatus = 'failed'
      entry.session.lastError = `Helper exited unexpectedly code=${code} signal=${signal ?? ''}`
      this.appendLog(entry, 'manager', entry.session.lastError)
    }

    entry.session.stoppedAt = this.now()
    await this.publishRoutingState(entry)
    await this.publishTunBypassState(entry, undefined)
    await this.cleanupEntry(entry)
    entry.resolveClose?.()
  }

  private async failEntry(
    entry: AmneziaHelperEntry,
    error: unknown,
    diagnosticKind: AmneziaHelperBackendDiagnosticKind = 'startup_failed',
    stage = 'runtime'
  ): Promise<void> {
    entry.session.status = 'failed'
    entry.session.readiness = 'failed'
    entry.session.connectivityStatus = 'failed'
    entry.session.lastError = error instanceof Error ? error.message : String(error)
    entry.session.stoppedAt = this.now()
    this.pushRuntimeDiagnostic(
      entry,
      mapBackendDiagnosticKindToRuntimeCategory(diagnosticKind),
      stage,
      entry.session.lastError,
      {
        diagnosticKind
      }
    )
    this.appendLog(entry, 'manager', entry.session.lastError)
    await this.publishRoutingState(entry)
    await this.publishTunBypassState(entry, undefined)
    await this.cleanupEntry(entry)
    entry.resolveClose?.()
  }

  private async cleanupEntry(entry: AmneziaHelperEntry): Promise<void> {
    entry.child = undefined
    if (entry.session.tempConfigPath) {
      await rm(entry.session.tempConfigPath, { force: true }).catch(() => {})
    }
  }

  private isChildAlive(child: ChildProcess): boolean {
    if (!child.pid) return false
    try {
      process.kill(child.pid, 0)
      return true
    } catch {
      return false
    }
  }

  private resolveBackend(): ResolvedAmneziaHelperBackend {
    return resolveHelperBackend({
      mode: this.backendMode,
      command: this.command,
      proxyBackendPath: this.proxyBackendPath,
      helperStubPath: this.helperStubPath,
      productionBackendPath: this.productionBackendPath,
      resourcesFilesDir: this.resourcesFilesDir
    })
  }

  private async prepareRuntimeConfig(
    config: AmneziaHelperRuntimeConfig,
    backendMode: AmneziaHelperBackendMode
  ): Promise<AmneziaHelperRuntimeConfig> {
    const localProxy = config.localProxy
    const port = localProxy.port > 0 ? localProxy.port : await this.allocatePort(localProxy.host)

    return withLocalProxyEndpoint(
      {
        ...config,
        execution: {
          ...config.execution,
          backendMode,
          readiness: {
            ...config.execution.readiness,
            timeoutMs: this.readinessTimeoutMs
          }
        }
      },
      {
        ...localProxy,
        port
      }
    )
  }

  private async prepareTunBypassForStart(
    entry: AmneziaHelperEntry,
    runtimeConfig: AmneziaHelperRuntimeConfig
  ): Promise<boolean> {
    const tunEnabled = await this.isTunEnabled()
    if (entry.session.backendMode === 'stub') {
      entry.session.tunBypass = createAmneziaHelperTunBypassNotRequired(
        'stub backend does not open an upstream tunnel',
        this.now
      )
      await this.publishTunBypassState(entry, undefined)
      return true
    }

    const resolution = await this.resolveTunBypass({ runtimeConfig, tunEnabled: true })
    entry.session.tunBypass = resolution
    if (resolution.status === 'resolved') {
      await this.publishTunBypassState(entry, resolution)
      this.appendLog(
        entry,
        'manager',
        tunEnabled
          ? `TUN helper upstream bypass prepared for ${resolution.routeExcludeAddresses.length} address(es)`
          : `TUN helper upstream bypass prepared for future TUN use with ${resolution.routeExcludeAddresses.length} address(es)`
      )
      return true
    }

    if (!tunEnabled) {
      await this.publishTunBypassState(entry, resolution)
      this.appendLog(
        entry,
        'manager',
        `TUN helper upstream bypass resolution failed while TUN is disabled: ${
          resolution.error ?? 'unknown'
        }`
      )
      return true
    }

    entry.session.status = 'failed'
    entry.session.readiness = 'failed'
    entry.session.connectivityStatus = 'failed'
    entry.session.lastError =
      resolution.error ?? 'Amnezia helper upstream endpoint could not be resolved for TUN bypass'
    entry.session.stoppedAt = this.now()
    this.pushRuntimeDiagnostic(
      entry,
      'tun_bypass_resolution_failure',
      'tun_bypass_resolution',
      entry.session.lastError,
      {
        endpointHost: resolution.endpointHost ?? '',
        endpointPort: resolution.endpointPort ?? 0
      }
    )
    await this.publishTunBypassState(entry, resolution)
    await this.publishRoutingState(entry)
    this.appendLog(entry, 'manager', entry.session.lastError)
    await this.cleanupEntry(entry)
    return false
  }

  private async watchReadiness(entry: AmneziaHelperEntry): Promise<void> {
    const endpoint = entry.session.localEndpoint
    if (!endpoint) {
      entry.session.readiness = 'failed'
      entry.session.lastError = 'Local proxy endpoint is missing'
      this.pushRuntimeDiagnostic(
        entry,
        'endpoint_unreachable',
        'endpoint_readiness',
        entry.session.lastError
      )
      this.appendLog(entry, 'manager', entry.session.lastError)
      await this.publishRoutingState(entry)
      return
    }

    const deadline = this.now() + this.readinessTimeoutMs
    while (this.now() < deadline && activeStatuses.has(entry.session.status)) {
      if (await canConnect(endpoint.host, endpoint.port)) {
        entry.session.readiness = 'ready'
        this.appendLog(entry, 'manager', `local proxy ready at ${endpoint.host}:${endpoint.port}`)
        await this.publishRoutingState(entry)
        return
      }
      await new Promise((resolve) => setTimeout(resolve, this.readinessPollIntervalMs))
    }

    if (activeStatuses.has(entry.session.status)) {
      entry.session.status = 'failed'
      entry.session.readiness = 'failed'
      entry.session.connectivityStatus = 'failed'
      entry.session.lastError = `Local proxy did not become ready at ${endpoint.host}:${endpoint.port}`
      this.pushRuntimeDiagnostic(
        entry,
        'startup_timeout',
        'endpoint_readiness',
        entry.session.lastError
      )
      this.appendLog(entry, 'manager', entry.session.lastError)
      await this.publishRoutingState(entry)
      entry.child?.kill('SIGKILL')
    }
  }

  private updateSessionRoutingTarget(entry: AmneziaHelperEntry): void {
    entry.session.routingTarget = createAmneziaHelperRoutingTarget(entry.session, this.now)
  }

  private async publishRoutingState(entry: AmneziaHelperEntry): Promise<void> {
    this.updateSessionRoutingTarget(entry)
    try {
      await this.syncRoutingState(cloneSession(entry.session))
    } catch (error) {
      this.appendLog(
        entry,
        'manager',
        `helper routing synchronization failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  }

  private async publishTunBypassState(
    entry: AmneziaHelperEntry,
    resolution: AmneziaHelperTunBypassResolution | undefined
  ): Promise<void> {
    try {
      await this.syncTunBypassState(resolution)
    } catch (error) {
      this.appendLog(
        entry,
        'manager',
        `helper TUN bypass synchronization failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  }

  private applyConnectivityResult(
    entry: AmneziaHelperEntry,
    result: AmneziaHelperConnectivityResult
  ): void {
    entry.session.connectivityStatus = result.status
    entry.session.validationStage = result.validationStage
    entry.session.lastConnectivityCheckAt = result.checkedAt
    entry.session.lastConnectivityLatencyMs = result.latencyMs
    entry.session.lastConnectivityError = result.diagnostic?.message
    entry.session.connectivityResult = {
      ...result,
      endpoint: { ...result.endpoint },
      stages: result.stages.map((stage) => ({ ...stage })),
      diagnostic: result.diagnostic ? cloneDiagnostic(result.diagnostic) : undefined
    }
    if (result.diagnostic) {
      this.pushRuntimeDiagnostic(
        entry,
        result.diagnostic.category,
        result.diagnostic.stage,
        result.diagnostic.message,
        result.diagnostic.details
      )
    }
  }

  private async validateAndPublishUdpCapability(
    entry: AmneziaHelperEntry,
    endpoint: AmneziaHelperLocalEndpoint
  ): Promise<void> {
    this.appendLog(entry, 'manager', 'UDP capability validation started')
    const capability = await this.validateUdpCapabilityImpl({
      profileId: entry.session.profileId,
      endpoint,
      now: this.now
    })
    entry.session.udpCapability = capability
    this.appendLog(
      entry,
      'manager',
      `UDP capability ${capability.udpSupport} reason=${capability.udpReasonCode}`
    )
    await this.publishRoutingState(entry)
  }

  private pushRuntimeDiagnostic(
    entry: AmneziaHelperEntry,
    category: AmneziaHelperRuntimeDiagnostic['category'],
    stage: string,
    message: string | undefined,
    details?: Record<string, string | number | boolean>
  ): void {
    if (!message) return
    entry.session.runtimeDiagnostics.push(
      createAmneziaHelperDiagnostic(category, stage, message, this.now(), details)
    )
    if (entry.session.runtimeDiagnostics.length > 50) {
      entry.session.runtimeDiagnostics.splice(0, entry.session.runtimeDiagnostics.length - 50)
    }
  }
}

export async function startAmneziaHelper(profileId: string): Promise<AmneziaHelperSession> {
  const manager = await getDefaultAmneziaHelperManager()
  return manager.start(profileId)
}

export async function ensureCurrentAmneziaHelperRunning(): Promise<
  AmneziaHelperSession | undefined
> {
  const [{ getProfileConfig }, { getProfileRuntimeCapabilities }] = await Promise.all([
    import('../config/profile'),
    import('../../core/profiles/managed-profile')
  ])
  const profileConfig = await getProfileConfig()
  const current = profileConfig.items?.find((item) => item.id === profileConfig.current)

  if (!current || (current.profileKind !== 'amnezia' && current.compatibility !== 'amnezia')) {
    return undefined
  }

  if (!getProfileRuntimeCapabilities(current).canActivate) {
    return undefined
  }

  const status = await getAmneziaHelperStatus(current.id)
  if (
    status.profileId === current.id &&
    (status.status === 'starting' || status.status === 'running')
  ) {
    return status
  }

  return startAmneziaHelper(current.id)
}

export async function syncCurrentAmneziaHelperWithRuntimeMode(): Promise<void> {
  const [{ getControledMihomoConfig }, { getAppConfig }] = await Promise.all([
    import('../config/controledMihomo'),
    import('../config/app')
  ])
  const [mihomoConfig, appConfig] = await Promise.all([getControledMihomoConfig(), getAppConfig()])
  if (mihomoConfig.tun?.enable || appConfig.proxyMode) {
    await ensureCurrentAmneziaHelperRunning()
  } else {
    await stopAllAmneziaHelpers()
  }
}

export async function stopAmneziaHelper(profileId?: string): Promise<AmneziaHelperSession> {
  if (!defaultManager) {
    return {
      profileId: profileId ?? '',
      sessionId: '',
      status: 'idle',
      command: '',
      args: [],
      backendMode: 'production',
      readiness: 'unknown',
      startupDiagnostics: [],
      runtimeDiagnostics: [],
      configStatus: 'not_generated',
      connectivityStatus: 'unknown',
      validationStage: 'not_started',
      udpCapability: createInitialAmneziaHelperUdpCapability('production')
    }
  }

  return defaultManager.stop(profileId)
}

export async function stopAllAmneziaHelpers(): Promise<void> {
  if (defaultManager) await defaultManager.stopAll()
}

export async function getAmneziaHelperStatus(profileId?: string): Promise<AmneziaHelperSession> {
  if (!defaultManager) {
    return {
      profileId: profileId ?? '',
      sessionId: '',
      status: 'idle',
      command: '',
      args: [],
      backendMode: 'production',
      readiness: 'unknown',
      startupDiagnostics: [],
      runtimeDiagnostics: [],
      configStatus: 'not_generated',
      connectivityStatus: 'unknown',
      validationStage: 'not_started',
      udpCapability: createInitialAmneziaHelperUdpCapability('production')
    }
  }

  return defaultManager.getStatus(profileId)
}

export async function getAmneziaHelperStartupPreflight(
  profileId: string
): Promise<AmneziaHelperStartupPreflightResult> {
  const manager = await getDefaultAmneziaHelperManager()
  return manager.preflight(profileId)
}

export async function getAmneziaHelperLogs(profileId?: string): Promise<AmneziaHelperLogEntry[]> {
  return defaultManager ? defaultManager.getLogs(profileId) : []
}

export async function validateAmneziaHelperConnectivity(
  profileId: string
): Promise<AmneziaHelperConnectivityResult> {
  const manager = await getDefaultAmneziaHelperManager()
  return manager.validateConnectivity(profileId)
}

export async function getLastAmneziaHelperConnectivityResult(
  profileId?: string
): Promise<AmneziaHelperConnectivityResult | undefined> {
  return defaultManager?.getLastConnectivityResult(profileId)
}

async function getDefaultAmneziaHelperManager(): Promise<AmneziaHelperManager> {
  if (defaultManager) return defaultManager

  const [{ dataDir, resourcesFilesDir }, { getAmneziaProfileDetails }] = await Promise.all([
    import('../utils/dirs'),
    import('../config/amneziaImport')
  ])

  const filesDir = resourcesFilesDir()
  const backendMode = getConfiguredBackendMode()
  defaultManager = new AmneziaHelperManager({
    runtimeDir: path.join(dataDir(), 'runtime', 'amnezia-helper'),
    proxyBackendPath: resolveBackendScriptPath(filesDir, 'amnezia-helper-proxy-backend.cjs'),
    helperStubPath: resolveHelperStubPath(filesDir),
    backendMode,
    productionBackendPath: process.env.KOALA_AMNEZIA_HELPER_BACKEND_PATH,
    resourcesFilesDir: filesDir,
    loadExecutionPlan: async (profileId) => {
      const details = await getAmneziaProfileDetails(profileId)
      return details.executionPlan as DesktopRuntimeExecutionPlan | undefined
    },
    syncRoutingState: syncAmneziaHelperRoutingState,
    isTunEnabled: isCurrentTunEnabled,
    syncTunBypassState: syncAmneziaHelperTunBypassState
  })

  return defaultManager
}

async function syncAmneziaHelperRoutingState(session: AmneziaHelperSession): Promise<void> {
  const { changed } = updateAmneziaHelperRoutingTargetFromSession(session)
  if (!changed) return

  const { mihomoHotReloadConfig } = await import('../core/mihomoApi')
  await mihomoHotReloadConfig()
}

async function syncAmneziaHelperTunBypassState(
  resolution: AmneziaHelperTunBypassResolution | undefined
): Promise<void> {
  const { changed } = updateAmneziaHelperTunBypassState(resolution)
  if (!changed) return

  const { mihomoHotReloadConfig } = await import('../core/mihomoApi')
  await mihomoHotReloadConfig()
}

async function isCurrentTunEnabled(): Promise<boolean> {
  try {
    const { getRuntimeConfig } = await import('../core/factory')
    const runtimeConfig = await getRuntimeConfig()
    if (runtimeConfig?.tun) return runtimeConfig.tun.enable ?? false
  } catch {
    // Fall back to controlled Mihomo config if the generated runtime config is unavailable.
  }

  const { getControledMihomoConfig } = await import('../config/controledMihomo')
  const controledConfig = await getControledMihomoConfig()
  return controledConfig.tun?.enable ?? false
}

function getConfiguredBackendMode(): AmneziaHelperBackendMode {
  const value = process.env.KOALA_AMNEZIA_HELPER_BACKEND_MODE
  if (value === 'production' || value === 'stub' || value === 'proxy-prototype') return value
  if (process.env.KOALA_AMNEZIA_HELPER_BACKEND_PATH) return 'production'
  return 'production'
}

function resolveHelperStubPath(resourcesFilesDir: string): string {
  return resolveBackendScriptPath(resourcesFilesDir, 'amnezia-helper-stub.cjs')
}

function resolveBackendScriptPath(resourcesFilesDir: string, filename: string): string {
  const resourcePath = path.join(resourcesFilesDir, filename)
  const candidates = [
    resourcePath,
    path.join(process.cwd(), 'src', 'main', 'runtime', filename),
    path.join(__dirname, filename)
  ]

  return candidates.find((candidate) => existsSync(candidate)) ?? resourcePath
}

function cloneSession(session: AmneziaHelperSession): AmneziaHelperSession {
  return {
    ...session,
    args: [...session.args],
    localEndpoint: session.localEndpoint ? { ...session.localEndpoint } : undefined,
    startupDiagnostics: [...session.startupDiagnostics],
    runtimeDiagnostics: session.runtimeDiagnostics.map(cloneDiagnostic),
    tunBypass: cloneTunBypass(session.tunBypass),
    routingTarget: session.routingTarget
      ? {
          ...session.routingTarget,
          endpoint: session.routingTarget.endpoint
            ? { ...session.routingTarget.endpoint }
            : undefined,
          tunBypass: cloneTunBypass(session.routingTarget.tunBypass)
        }
      : undefined,
    connectivityResult: session.connectivityResult
      ? {
          ...session.connectivityResult,
          endpoint: { ...session.connectivityResult.endpoint },
          stages: session.connectivityResult.stages.map((stage) => ({ ...stage })),
          diagnostic: session.connectivityResult.diagnostic
            ? cloneDiagnostic(session.connectivityResult.diagnostic)
            : undefined
        }
      : undefined
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

function cloneDiagnostic(
  diagnostic: AmneziaHelperRuntimeDiagnostic
): AmneziaHelperRuntimeDiagnostic {
  return {
    ...diagnostic,
    details: diagnostic.details ? { ...diagnostic.details } : undefined
  }
}

function isBackendRuntimeFailureDiagnostic(kind: AmneziaHelperBackendDiagnosticKind): boolean {
  return kind !== 'config_accepted' && kind !== 'local_proxy_ready'
}

function mapBackendDiagnosticKindToRuntimeCategory(
  kind: AmneziaHelperBackendDiagnosticKind
): AmneziaHelperRuntimeDiagnostic['category'] {
  switch (kind) {
    case 'backend_permission_denied':
      return 'backend_permission_denied'
    case 'backend_not_executable':
      return 'backend_not_executable'
    case 'backend_spawn_failure':
      return 'backend_spawn_failure'
    case 'unsupported_platform':
      return 'unsupported_platform'
    case 'unsupported_arch':
      return 'unsupported_arch'
    case 'backend_arch_mismatch':
      return 'backend_arch_mismatch'
    case 'backend_unavailable':
      return 'backend_unavailable'
    case 'unsupported_config':
      return 'config_generation_failure'
    case 'startup_failed':
    default:
      return 'startup_timeout'
  }
}

function isConfigPreflightReason(reason: AmneziaHelperStartupPreflightReason): boolean {
  return [
    'missing_execution_plan',
    'missing_helper_descriptor',
    'unsupported_execution_plan',
    'runtime_config_generation_failed',
    'production_config_generation_failed',
    'unsupported_profile_protocol',
    'missing_endpoint',
    'missing_keys',
    'missing_allowed_ips',
    'missing_interface_address',
    'invalid_local_proxy'
  ].includes(reason.code)
}

function formatPreflightReason(reason: AmneziaHelperStartupPreflightReason): string {
  return `${reason.stage}: ${reason.code}: ${reason.message}`
}

async function allocateLocalPort(host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, host, () => {
      const address = server.address()
      server.close(() => {
        if (address && typeof address === 'object') {
          resolve(address.port)
        } else {
          reject(new Error('Failed to allocate local proxy port'))
        }
      })
    })
  })
}

async function canConnect(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port })
    socket.setTimeout(250)
    socket.once('connect', () => {
      socket.end()
      resolve(true)
    })
    socket.once('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.once('error', () => resolve(false))
  })
}
