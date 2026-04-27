import * as assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { afterEach, describe, it } from 'node:test'
import * as os from 'node:os'
import * as path from 'node:path'
import { createInitialAmneziaHelperUdpCapability } from '../src/core/routing/amnezia-helper-udp-capability'
import { createAmneziaHelperRoutingTarget } from '../src/core/routing/amnezia-helper-routing'
import { AmneziaHelperConnectivityResult } from '../src/main/runtime/amnezia-helper-connectivity'
import { AmneziaHelperSession } from '../src/main/runtime/amnezia-helper-manager'
import {
  AmneziaHelperStabilityManager,
  runAmneziaHelperStabilityScenarios
} from '../src/main/runtime/amnezia-helper-stability'

let cleanupTasks: Array<() => Promise<void>> = []

describe('Amnezia helper stability scenarios', () => {
  afterEach(async () => {
    const tasks = cleanupTasks
    cleanupTasks = []
    await Promise.all(tasks.map((task) => task()))
  })

  it('passes repeated lifecycle and reload checks with a stable helper manager', async () => {
    const manager = new FakeStabilityManager()
    let reloadCount = 0

    const report = await runAmneziaHelperStabilityScenarios({
      profileId: 'profile-1',
      manager,
      cycles: 3,
      soakDurationMs: 5,
      soakIntervalMs: 1,
      reload: () => {
        reloadCount += 1
      }
    })

    assert.equal(report.summary.status, 'passed')
    assert.equal(report.lifecycleStressPassed, true)
    assert.equal(report.reloadResiliencePassed, true)
    assert.equal(report.repeatedStartStopCount, 3)
    assert.equal(report.staleStateDetected, false)
    assert.equal(report.cleanupLeakDetected, false)
    assert.equal(report.recoveryPassed, false)
    assert.equal(reloadCount, 1)
    assert.equal(findScenarioStatus(report, 'crash_recovery'), 'skipped')
  })

  it('validates crash cleanup and restart when a crash hook is available', async () => {
    const manager = new FakeStabilityManager()

    const report = await runAmneziaHelperStabilityScenarios({
      profileId: 'profile-1',
      manager,
      cycles: 1,
      soakDurationMs: 5,
      soakIntervalMs: 1,
      crashAndWait: () => {
        manager.crash()
      }
    })

    assert.equal(report.summary.status, 'passed')
    assert.equal(report.recoveryPassed, true)
    assert.equal(findScenarioStatus(report, 'crash_recovery'), 'passed')
  })

  it('reports stale routing state after reload as a reload resilience failure', async () => {
    const manager = new FakeStabilityManager()

    const report = await runAmneziaHelperStabilityScenarios({
      profileId: 'profile-1',
      manager,
      cycles: 1,
      soakDurationMs: 0,
      reload: () => {
        manager.dropRoutingTarget()
      }
    })

    assert.equal(report.summary.status, 'failed')
    assert.equal(report.reloadResiliencePassed, false)
    assert.ok(
      report.diagnostics.some(
        (diagnostic) => diagnostic.code === 'routing_target_missing_after_reload'
      )
    )
  })

  it('detects temporary config cleanup leaks across lifecycle runs', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'koala-amnezia-stability-test-'))
    cleanupTasks.push(async () => rm(dir, { recursive: true, force: true }))
    const leakedConfigPath = path.join(dir, 'leaked-helper-config.json')
    await writeFile(leakedConfigPath, '{}', 'utf-8')
    const manager = new FakeStabilityManager({ tempConfigPath: leakedConfigPath })

    const report = await runAmneziaHelperStabilityScenarios({
      profileId: 'profile-1',
      manager,
      cycles: 1,
      soakDurationMs: 0
    })

    assert.equal(report.summary.status, 'failed')
    assert.equal(report.cleanupLeakDetected, true)
    assert.ok(report.diagnostics.some((diagnostic) => diagnostic.code === 'cleanup_leak_detected'))
  })

  it('runs the TUN reload scenario only when requested', async () => {
    const manager = new FakeStabilityManager()

    const report = await runAmneziaHelperStabilityScenarios({
      profileId: 'profile-1',
      manager,
      cycles: 1,
      soakDurationMs: 0,
      includeTunReloadScenario: true
    })

    assert.equal(report.summary.status, 'passed')
    assert.equal(findScenarioStatus(report, 'tun_reload_resilience'), 'passed')
    assert.equal(report.reloadResiliencePassed, true)
  })
})

class FakeStabilityManager implements AmneziaHelperStabilityManager {
  private session: AmneziaHelperSession
  private sequence = 0

  constructor(private readonly options: { tempConfigPath?: string } = {}) {
    this.session = createSession('profile-1', 'idle', 'unknown', 'session-0')
  }

  async start(profileId: string): Promise<AmneziaHelperSession> {
    this.sequence += 1
    this.session = createSession(
      profileId,
      'running',
      'ready',
      `session-${this.sequence}`,
      this.options.tempConfigPath
    )
    return cloneSession(this.session)
  }

  async stop(profileId?: string): Promise<AmneziaHelperSession> {
    this.session = createSession(
      profileId ?? this.session.profileId,
      'stopped',
      'unknown',
      this.session.sessionId,
      this.options.tempConfigPath
    )
    return cloneSession(this.session)
  }

  async stopAll(): Promise<void> {
    await this.stop(this.session.profileId)
  }

  getStatus(profileId?: string): AmneziaHelperSession {
    if (profileId && profileId !== this.session.profileId) {
      return createSession(profileId, 'idle', 'unknown', '')
    }
    return cloneSession(this.session)
  }

  async validateConnectivity(profileId: string): Promise<AmneziaHelperConnectivityResult> {
    return {
      profileId,
      status: 'verified',
      validationStage: 'upstream_request',
      checkedAt: Date.now(),
      durationMs: 1,
      latencyMs: 1,
      endpoint: {
        host: '127.0.0.1',
        port: 19080,
        protocol: 'socks5'
      },
      stages: [
        { stage: 'tcp_connect', status: 'passed', durationMs: 1 },
        { stage: 'socks5_handshake', status: 'passed', durationMs: 1 },
        { stage: 'upstream_request', status: 'passed', durationMs: 1 }
      ]
    }
  }

  crash(): void {
    this.session = createSession(
      this.session.profileId,
      'failed',
      'failed',
      this.session.sessionId,
      this.options.tempConfigPath
    )
  }

  dropRoutingTarget(): void {
    this.session = {
      ...this.session,
      routingTarget: {
        ...this.session.routingTarget!,
        status: 'unavailable',
        reason: 'helper_not_ready'
      }
    }
  }
}

function createSession(
  profileId: string,
  status: AmneziaHelperSession['status'],
  readiness: AmneziaHelperSession['readiness'],
  sessionId: string,
  tempConfigPath?: string
): AmneziaHelperSession {
  const session: AmneziaHelperSession = {
    profileId,
    sessionId,
    pid: status === 'running' ? 1234 : undefined,
    status,
    startedAt: status === 'idle' ? undefined : Date.now(),
    stoppedAt: status === 'stopped' || status === 'failed' ? Date.now() : undefined,
    command: 'fake-helper',
    args: [],
    tempConfigPath,
    backendMode: 'proxy-prototype',
    readiness,
    localEndpoint:
      status === 'running'
        ? {
            host: '127.0.0.1',
            port: 19080,
            protocol: 'socks5'
          }
        : undefined,
    startupDiagnostics: [],
    runtimeDiagnostics: [],
    configStatus: 'generated',
    connectivityStatus: status === 'failed' ? 'failed' : 'unknown',
    validationStage: 'not_started',
    udpCapability: createInitialAmneziaHelperUdpCapability('proxy-prototype')
  }
  return {
    ...session,
    routingTarget: createAmneziaHelperRoutingTarget(session)
  }
}

function cloneSession(session: AmneziaHelperSession): AmneziaHelperSession {
  return {
    ...session,
    args: [...session.args],
    localEndpoint: session.localEndpoint ? { ...session.localEndpoint } : undefined,
    startupDiagnostics: [...session.startupDiagnostics],
    runtimeDiagnostics: session.runtimeDiagnostics.map((diagnostic) => ({ ...diagnostic })),
    routingTarget: session.routingTarget
      ? {
          ...session.routingTarget,
          endpoint: session.routingTarget.endpoint
            ? { ...session.routingTarget.endpoint }
            : undefined
        }
      : undefined
  }
}

function findScenarioStatus(
  report: Awaited<ReturnType<typeof runAmneziaHelperStabilityScenarios>>,
  scenario: string
): string | undefined {
  return report.scenarios.find((item) => item.scenario === scenario)?.status
}
