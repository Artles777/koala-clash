import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { ChildProcess, spawn as nodeSpawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { PassThrough } from 'node:stream'
import {
  AmneziaHelperManager,
  AmneziaHelperSession,
  AmneziaHelperSessionStatus
} from '../src/main/runtime/amnezia-helper-manager'
import type { AmneziaHelperRuntimeConfig } from '../src/core/profiles/amnezia-helper-runtime-config'
import {
  AmneziaHelperConnectivityResult,
  ValidateAmneziaHelperConnectivityInput
} from '../src/main/runtime/amnezia-helper-connectivity'
import {
  AmneziaHelperTunBypassResolution,
  createAmneziaHelperTunBypassFailed
} from '../src/core/routing/amnezia-helper-tun-bypass'
import { getExecutionPlan } from '../src/core/profiles/desktop-runtime-adapter'
import { NormalizedProfile } from '../src/core/profiles/normalized-profile'

const helperStubPath = path.resolve('src/main/runtime/amnezia-helper-stub.cjs')
const proxyBackendPath = path.resolve('src/main/runtime/amnezia-helper-proxy-backend.cjs')
const platform = ['win32', 'linux', 'darwin'].includes(process.platform)
  ? process.platform
  : 'linux'

let cleanupTasks: Array<() => Promise<void>> = []

describe('Amnezia helper manager', () => {
  afterEach(async () => {
    const tasks = cleanupTasks
    cleanupTasks = []
    await Promise.all(tasks.map((task) => task()))
  })

  it('creates a running session and captures helper logs', async () => {
    const { manager } = await createManager()

    const session = await manager.start('amnezia-1')
    const running = await waitForReadiness(manager, 'amnezia-1', 'ready')
    const logs = await waitForLog(manager, 'amnezia-1', 'READY profile=amnezia-1')

    assert.equal(session.status, 'running')
    assert.equal(running.profileId, 'amnezia-1')
    assert.equal(running.readiness, 'ready')
    assert.equal(running.backendMode, 'proxy-prototype')
    assert.equal(running.configStatus, 'generated')
    assert.equal(running.localEndpoint?.host, '127.0.0.1')
    assert.ok(running.localEndpoint?.port)
    assert.ok(running.pid)
    assert.ok(running.tempConfigPath)
    assert.ok(existsSync(running.tempConfigPath))
    assert.ok(logs.some((log) => log.stream === 'stdout'))
  })

  it('publishes routing target updates when helper readiness changes', async () => {
    const routingUpdates: AmneziaHelperSession[] = []
    const { manager } = await createManager({
      syncRoutingState: (session) => {
        routingUpdates.push(session)
      }
    })

    await manager.start('amnezia-1')
    const ready = await waitForReadiness(manager, 'amnezia-1', 'ready')

    assert.equal(ready.routingTarget?.status, 'injected')
    assert.equal(ready.routingTarget?.groupName, 'AMNEZIA_HELPER')
    assert.equal(ready.routingTarget?.endpoint?.port, ready.localEndpoint?.port)
    assert.ok(routingUpdates.some((session) => session.routingTarget?.status === 'injected'))

    const stopped = await manager.stop('amnezia-1')
    assert.equal(stopped.routingTarget?.status, 'unavailable')
    assert.ok(routingUpdates.some((session) => session.routingTarget?.reason === 'helper_stopped'))
  })

  it('prevents duplicate starts for the same profile by returning the active session', async () => {
    const { manager } = await createManager()

    const first = await manager.start('amnezia-1')
    const second = await manager.start('amnezia-1')

    assert.equal(second.sessionId, first.sessionId)
    assert.equal(second.status, 'running')
  })

  it('exposes running-but-not-ready before the local proxy starts listening', async () => {
    const { manager } = await createManager({
      env: {
        ...process.env,
        KOALA_AMNEZIA_HELPER_BACKEND_READY_DELAY_MS: '200'
      }
    })

    const session = await manager.start('amnezia-1')

    assert.equal(session.status, 'running')
    assert.equal(session.readiness, 'checking')

    const ready = await waitForReadiness(manager, 'amnezia-1', 'ready')
    assert.equal(ready.readiness, 'ready')
  })

  it('blocks a second active helper session for a different profile', async () => {
    const { manager } = await createManager()

    await manager.start('amnezia-1')

    await assert.rejects(
      () => manager.start('amnezia-2'),
      /Another Amnezia helper session is already active/
    )
  })

  it('stops a running session and removes the temp config', async () => {
    const { manager } = await createManager()

    const running = await manager.start('amnezia-1')
    assert.ok(running.tempConfigPath)

    const stopped = await manager.stop('amnezia-1')

    assert.equal(stopped.status, 'stopped')
    assert.ok(stopped.stoppedAt)
    assert.equal(existsSync(running.tempConfigPath), false)
  })

  it('safely handles stopping a non-running helper', async () => {
    const { manager } = await createManager()

    const stopped = await manager.stop('amnezia-1')

    assert.equal(stopped.status, 'idle')
    assert.equal(stopped.profileId, 'amnezia-1')
  })

  it('marks the session as failed when the helper crashes', async () => {
    const { manager } = await createManager({
      env: {
        ...process.env,
        KOALA_AMNEZIA_HELPER_BACKEND_CRASH_AFTER_MS: '50'
      }
    })

    await manager.start('amnezia-1')
    const failed = await waitForStatus(manager, 'amnezia-1', 'failed', 3000)
    const logs = manager.getLogs('amnezia-1')

    assert.equal(failed.status, 'failed')
    assert.match(failed.lastError ?? '', /code=42/)
    assert.ok(logs.some((log) => log.message.includes('simulated crash')))
  })

  it('returns a failed session with diagnostics when the production backend is unavailable', async () => {
    const { manager } = await createManager({
      backendMode: 'production',
      productionBackendPath: path.join(os.tmpdir(), 'missing-amnezia-helper-backend')
    })

    const failed = await manager.start('amnezia-1')

    assert.equal(failed.status, 'failed')
    assert.equal(failed.backendMode, 'production')
    assert.equal(failed.readiness, 'failed')
    assert.equal(failed.configStatus, 'not_generated')
    assert.match(failed.lastError ?? '', /helper executable is missing/)
    assert.ok(
      failed.runtimeDiagnostics.some((diagnostic) => diagnostic.category === 'backend_unavailable')
    )
  })

  it('blocks helper startup under TUN when upstream bypass resolution fails', async () => {
    const tunUpdates: Array<AmneziaHelperTunBypassResolution | undefined> = []
    const { manager } = await createManager({
      isTunEnabled: () => true,
      resolveTunBypass: async () =>
        createAmneziaHelperTunBypassFailed({
          endpointHost: 'missing.example.test',
          error: 'ENOTFOUND'
        }),
      syncTunBypassState: (resolution) => {
        tunUpdates.push(resolution)
      }
    })

    const failed = await manager.start('amnezia-1')

    assert.equal(failed.status, 'failed')
    assert.equal(failed.readiness, 'failed')
    assert.equal(failed.pid, undefined)
    assert.equal(failed.tunBypass?.status, 'failed')
    assert.ok(
      failed.runtimeDiagnostics.some(
        (diagnostic) => diagnostic.category === 'tun_bypass_resolution_failure'
      )
    )
    assert.equal(tunUpdates.at(-1)?.status, 'failed')
  })

  it('classifies production helper spawn failures as backend_spawn_failure', async () => {
    const helperPath = await createExecutable('amnezia-helper')
    const { manager } = await createManager({
      backendMode: 'production',
      productionBackendPath: helperPath,
      spawnProcess: createFailingSpawn(new Error('spawn failed: EACCES'))
    })

    await assert.rejects(() => manager.start('amnezia-1'), /spawn failed/)
    const failed = manager.getStatus('amnezia-1')

    assert.equal(failed.status, 'failed')
    assert.equal(failed.readiness, 'failed')
    assert.ok(
      failed.runtimeDiagnostics.some(
        (diagnostic) => diagnostic.category === 'backend_spawn_failure'
      )
    )
  })

  it('tracks connectivity validation transitions and retains the last result', async () => {
    const validation = createDeferred<AmneziaHelperConnectivityResult>()
    const { manager } = await createManager({
      validateConnectivity: async ({ profileId, endpoint }) => {
        await validation.promise
        return createConnectivityResult(profileId, endpoint.port)
      }
    })

    await manager.start('amnezia-1')
    const ready = await waitForReadiness(manager, 'amnezia-1', 'ready')
    const validationPromise = manager.validateConnectivity('amnezia-1')

    assert.equal(manager.getStatus('amnezia-1').connectivityStatus, 'checking')
    validation.resolve(createConnectivityResult('amnezia-1', ready.localEndpoint?.port ?? 0))

    const result = await validationPromise
    const status = manager.getStatus('amnezia-1')
    const retained = manager.getLastConnectivityResult('amnezia-1')

    assert.equal(result.status, 'verified')
    assert.equal(status.connectivityStatus, 'verified')
    assert.equal(status.validationStage, 'upstream_request')
    assert.equal(status.lastConnectivityLatencyMs, 7)
    assert.equal(retained?.status, 'verified')
    assert.equal(retained?.endpoint.port, ready.localEndpoint?.port)
  })

  it('stores structured diagnostics for failed connectivity validation', async () => {
    const { manager } = await createManager({
      validateConnectivity: async ({ profileId, endpoint }) => ({
        profileId,
        status: 'failed',
        validationStage: 'socks5_handshake',
        checkedAt: Date.now(),
        durationMs: 20,
        endpoint,
        stages: [
          { stage: 'tcp_connect', status: 'passed', durationMs: 3 },
          {
            stage: 'socks5_handshake',
            status: 'failed',
            durationMs: 17,
            message: 'SOCKS5 greeting failed'
          }
        ],
        diagnostic: {
          category: 'proxy_handshake_failure',
          stage: 'socks5_handshake',
          message: 'SOCKS5 greeting failed',
          at: Date.now()
        }
      })
    })

    await manager.start('amnezia-1')
    await waitForReadiness(manager, 'amnezia-1', 'ready')
    const result = await manager.validateConnectivity('amnezia-1')
    const status = manager.getStatus('amnezia-1')

    assert.equal(result.status, 'failed')
    assert.equal(status.connectivityStatus, 'failed')
    assert.equal(status.lastConnectivityError, 'SOCKS5 greeting failed')
    assert.ok(
      status.runtimeDiagnostics.some(
        (diagnostic) => diagnostic.category === 'proxy_handshake_failure'
      )
    )
  })
})

async function createManager(
  input: {
    env?: NodeJS.ProcessEnv
    backendMode?: 'production' | 'proxy-prototype' | 'stub'
    productionBackendPath?: string
    spawnProcess?: typeof nodeSpawn
    validateConnectivity?: (
      input: ValidateAmneziaHelperConnectivityInput
    ) => Promise<AmneziaHelperConnectivityResult>
    syncRoutingState?: (session: AmneziaHelperSession) => Promise<void> | void
    isTunEnabled?: () => Promise<boolean> | boolean
    resolveTunBypass?: (input: {
      runtimeConfig: AmneziaHelperRuntimeConfig
      tunEnabled: boolean
    }) => Promise<AmneziaHelperTunBypassResolution>
    syncTunBypassState?: (
      resolution: AmneziaHelperTunBypassResolution | undefined
    ) => Promise<void> | void
  } = {}
): Promise<{
  manager: AmneziaHelperManager
}> {
  const runtimeDir = await mkdtemp(path.join(os.tmpdir(), 'koala-amnezia-helper-'))
  const manager = new AmneziaHelperManager({
    runtimeDir,
    proxyBackendPath,
    helperStubPath,
    backendMode: input.backendMode ?? 'proxy-prototype',
    productionBackendPath: input.productionBackendPath,
    spawnProcess: input.spawnProcess,
    env: input.env,
    validateConnectivity: input.validateConnectivity,
    syncRoutingState: input.syncRoutingState,
    isTunEnabled: input.isTunEnabled,
    resolveTunBypass: input.resolveTunBypass,
    syncTunBypassState: input.syncTunBypassState,
    loadExecutionPlan: async (profileId) =>
      getExecutionPlan(createNormalizedProfile(profileId), platform)
  })

  cleanupTasks.push(async () => {
    await manager.stopAll()
    await rm(runtimeDir, { recursive: true, force: true })
  })

  return { manager }
}

async function createExecutable(name: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'koala-amnezia-helper-binary-'))
  cleanupTasks.push(async () => rm(dir, { recursive: true, force: true }))
  const filePath = path.join(dir, name)
  await writeFile(filePath, '#!/bin/sh\nexit 0\n', 'utf-8')
  await chmod(filePath, 0o755)
  return filePath
}

function createFailingSpawn(error: Error): typeof nodeSpawn {
  return (() => {
    const child = new EventEmitter() as ChildProcess
    Object.assign(child, {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      pid: 4242,
      killed: false,
      kill: () => true
    })
    process.nextTick(() => child.emit('error', error))
    return child
  }) as typeof nodeSpawn
}

function createConnectivityResult(
  profileId: string,
  port: number
): AmneziaHelperConnectivityResult {
  return {
    profileId,
    status: 'verified',
    validationStage: 'upstream_request',
    checkedAt: Date.now(),
    durationMs: 42,
    latencyMs: 7,
    endpoint: {
      host: '127.0.0.1',
      port,
      protocol: 'socks5'
    },
    stages: [
      { stage: 'tcp_connect', status: 'passed', durationMs: 7 },
      { stage: 'socks5_handshake', status: 'passed', durationMs: 10 },
      { stage: 'upstream_request', status: 'passed', durationMs: 25 }
    ]
  }
}

function createDeferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}

async function waitForReadiness(
  manager: AmneziaHelperManager,
  profileId: string,
  readiness: 'unknown' | 'checking' | 'ready' | 'failed',
  timeoutMs = 3000
) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const session = manager.getStatus(profileId)
    if (session.readiness === readiness) return session
    await new Promise((resolve) => setTimeout(resolve, 25))
  }

  assert.fail(`Timed out waiting for readiness ${readiness}`)
}

async function waitForStatus(
  manager: AmneziaHelperManager,
  profileId: string,
  status: AmneziaHelperSessionStatus,
  timeoutMs = 2000
) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const session = manager.getStatus(profileId)
    if (session.status === status) return session
    await new Promise((resolve) => setTimeout(resolve, 25))
  }

  assert.fail(`Timed out waiting for ${status}`)
}

async function waitForLog(
  manager: AmneziaHelperManager,
  profileId: string,
  pattern: string,
  timeoutMs = 2000
) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const logs = manager.getLogs(profileId)
    if (logs.some((log) => log.message.includes(pattern))) return logs
    await new Promise((resolve) => setTimeout(resolve, 25))
  }

  assert.fail(`Timed out waiting for log: ${pattern}`)
}

function createNormalizedProfile(profileId: string): NormalizedProfile {
  return {
    id: profileId,
    name: 'Test Amnezia',
    sourceId: 'source-1',
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
      clientPrivateKey: 'client-private-key'
    },
    interface: {
      addresses: ['10.8.0.2/32'],
      dns: ['1.1.1.1'],
      mtu: 1280
    },
    peer: {
      endpoint: 'vpn.example.com:51820',
      publicKey: 'server-public-key',
      allowedIps: ['0.0.0.0/0', '::/0'],
      persistentKeepalive: 25
    },
    amnezia: {
      container: 'amnezia-awg',
      obfuscation: {
        junkPacketCount: '4'
      }
    },
    metadata: {
      importedAt: 1710000000000,
      decodedFormat: 'json',
      sourceType: 'amnezia_vpn_uri',
      warnings: []
    }
  }
}
