import * as assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, it } from 'node:test'
import {
  AmneziaHelperCompatibilityMatrix,
  aggregateAmneziaHelperSmokeReports,
  classifyMatrixReleaseStatus
} from '../src/main/runtime/amnezia-helper-matrix'
import {
  AmneziaHelperVerificationReport,
  classifyVerificationReleaseReadiness
} from '../src/main/runtime/amnezia-helper-verification'

let cleanupTasks: Array<() => Promise<void>> = []

describe('Amnezia helper compatibility matrix', () => {
  afterEach(async () => {
    const tasks = cleanupTasks
    cleanupTasks = []
    await Promise.all(tasks.map((task) => task()))
  })

  it('classifies fully passing packaged production reports as supported', () => {
    const report = createSmokeReport()
    report.releaseReadiness = classifyVerificationReleaseReadiness(report)
    const matrix = aggregateAmneziaHelperSmokeReports({
      reports: [{ report }],
      requiredTargets: [{ platform: 'linux', arch: 'x64' }]
    })

    assert.equal(report.releaseReadiness.status, 'supported')
    assert.equal(matrix.summary.releaseStatus, 'supported')
    assert.equal(matrix.rows[0].blockerStatus, 'supported')
    assert.equal(matrix.rows[0].helperChecksumSha256, 'checksum-linux-x64')
    assert.equal(matrix.rows[0].helperVersion, '1.2.3')
    assert.equal(matrix.rows[0].lifecycleStressPassed, true)
    assert.equal(matrix.rows[0].reloadResiliencePassed, true)
    assert.equal(matrix.rows[0].recoveryPassed, true)
    assert.equal(matrix.rows[0].repeatedStartStopCount, 3)
  })

  it('keeps warnings non-blocking but visible in the matrix', () => {
    const report = createSmokeReport({
      omitHelperVersion: true,
      fixtureKind: 'default_normalized_profile'
    })
    report.releaseReadiness = classifyVerificationReleaseReadiness(report)
    const matrix = aggregateAmneziaHelperSmokeReports({
      reports: [{ report }],
      requiredTargets: [{ platform: 'linux', arch: 'x64' }]
    })

    assert.equal(report.releaseReadiness.status, 'warning')
    assert.equal(matrix.summary.releaseStatus, 'warning')
    assert.ok(matrix.rows[0].warnings.includes('helper_version_missing'))
    assert.ok(matrix.rows[0].warnings.includes('default_fixture_used'))
  })

  it('blocks release readiness on failed smoke stages and missing reports', () => {
    const failed = createSmokeReport({
      platform: 'darwin',
      arch: 'arm64',
      connectivityStatus: 'failed'
    })
    failed.releaseReadiness = classifyVerificationReleaseReadiness(failed)
    const matrix = aggregateAmneziaHelperSmokeReports({
      reports: [{ report: failed }],
      requiredTargets: [
        { platform: 'darwin', arch: 'arm64' },
        { platform: 'win32', arch: 'x64' }
      ]
    })

    assert.equal(failed.releaseReadiness.status, 'blocked')
    assert.equal(matrix.summary.releaseStatus, 'blocked')
    assert.equal(matrix.summary.blocked, 2)
    assert.ok(matrix.rows.some((row) => row.blockers.includes('connectivity_not_passed')))
    assert.ok(matrix.rows.some((row) => row.blockers.includes('smoke_report_missing')))
  })

  it('uses the newest report for duplicate platform and arch rows', () => {
    const older = createSmokeReport({
      generatedAt: 10,
      connectivityStatus: 'failed'
    })
    older.releaseReadiness = classifyVerificationReleaseReadiness(older)
    const newer = createSmokeReport({
      generatedAt: 20,
      reportId: 'newer-report'
    })
    newer.releaseReadiness = classifyVerificationReleaseReadiness(newer)
    const matrix = aggregateAmneziaHelperSmokeReports({
      reports: [
        { report: older, path: 'older.json' },
        { report: newer, path: 'newer.json' }
      ],
      requiredTargets: [{ platform: 'linux', arch: 'x64' }]
    })

    assert.equal(matrix.rows.length, 1)
    assert.equal(matrix.rows[0].reportId, 'newer-report')
    assert.equal(matrix.rows[0].reportPath, 'newer.json')
    assert.equal(matrix.summary.releaseStatus, 'supported')
  })

  it('keeps proxy and TUN smoke rows separate in the matrix', () => {
    const proxy = createSmokeReport({ reportId: 'proxy-report' })
    const tun = createSmokeReport({ reportId: 'tun-report', runtimeScenario: 'tun' })
    proxy.releaseReadiness = classifyVerificationReleaseReadiness(proxy)
    tun.releaseReadiness = classifyVerificationReleaseReadiness(tun)

    const matrix = aggregateAmneziaHelperSmokeReports({
      reports: [{ report: proxy }, { report: tun }],
      requiredTargets: [{ platform: 'linux', arch: 'x64' }],
      requiredRuntimeScenarios: ['proxy', 'tun']
    })

    assert.equal(matrix.rows.length, 2)
    assert.ok(matrix.rows.some((row) => row.runtimeScenario === 'proxy'))
    const tunRow = matrix.rows.find((row) => row.runtimeScenario === 'tun')
    assert.equal(tunRow?.reportId, 'tun-report')
    assert.equal(tunRow?.tunScenarioResult, 'passed')
    assert.equal(tunRow?.helperTunBypassActive, true)
    assert.equal(tunRow?.helperRuleReliability, 'reliable')
  })

  it('emits a machine-readable matrix from the CLI', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'koala-amnezia-matrix-'))
    cleanupTasks.push(async () => rm(dir, { recursive: true, force: true }))
    const reportPath = path.join(dir, 'linux-x64.json')
    const report = createSmokeReport()
    report.releaseReadiness = classifyVerificationReleaseReadiness(report)
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8')

    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        'scripts/amnezia-helper-matrix.ts',
        '--report',
        reportPath,
        '--target',
        'linux-x64',
        '--compact'
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf-8'
      }
    )

    assert.equal(result.status, 0, result.stderr)
    const matrix = JSON.parse(result.stdout) as AmneziaHelperCompatibilityMatrix
    assert.equal(matrix.schemaVersion, 1)
    assert.equal(matrix.summary.releaseStatus, 'supported')
    assert.equal(matrix.rows[0].platform, 'linux')
    assert.equal(classifyMatrixReleaseStatus(matrix.rows), 'supported')
  })
})

function createSmokeReport(
  input: {
    platform?: string
    arch?: string
    generatedAt?: number
    reportId?: string
    connectivityStatus?: 'passed' | 'failed'
    helperVersion?: string
    omitHelperVersion?: boolean
    fixtureKind?: AmneziaHelperVerificationReport['fixture']['kind']
    runtimeScenario?: AmneziaHelperVerificationReport['runtimeScenario']
  } = {}
): AmneziaHelperVerificationReport {
  const platform = input.platform ?? 'linux'
  const arch = input.arch ?? 'x64'
  const generatedAt = input.generatedAt ?? 1710000000000
  const connectivityStatus = input.connectivityStatus ?? 'passed'
  const runtimeScenario = input.runtimeScenario ?? 'proxy'
  const tunEnabled = runtimeScenario === 'tun'
  const failed = connectivityStatus === 'failed'
  const report: AmneziaHelperVerificationReport = {
    schemaVersion: 1,
    id: input.reportId ?? `${platform}-${arch}-report`,
    scenario: 'packaged',
    runtimeScenario,
    buildId: 'build-1',
    appVersion: '1.2.0',
    generatedAt,
    finishedAt: generatedAt + 100,
    durationMs: 100,
    platform,
    arch,
    backendMode: 'production',
    backendKind: 'production',
    backendSource: 'packaged_app',
    packaged: true,
    resourcesFilesDir: '/app/resources/files',
    packagedAppPath: '/app',
    helperPathUsed: `/app/resources/files/amnezia-helper/${platform}/${arch}/amnezia-helper`,
    helperChecksumSha256: `checksum-${platform}-${arch}`,
    helperVersion: input.omitHelperVersion ? undefined : (input.helperVersion ?? '1.2.3'),
    fixture: {
      kind: input.fixtureKind ?? 'normalized_profile_file',
      profileId: 'profile-1',
      profileName: 'Real fixture',
      path: input.fixtureKind === 'default_normalized_profile' ? undefined : '/private/profile.json'
    },
    startupResult: {
      profileId: 'profile-1',
      sessionId: 'session-1',
      pid: 1234,
      status: 'running',
      command: 'amnezia-helper',
      args: [],
      configStatus: 'generated',
      backendMode: 'production'
    },
    readinessResult: {
      status: 'ready',
      localEndpoint: { host: '127.0.0.1', port: 19080, protocol: 'socks5' }
    },
    connectivityResult: {
      profileId: 'profile-1',
      status: failed ? 'failed' : 'verified',
      validationStage: 'upstream_request',
      checkedAt: generatedAt + 50,
      durationMs: 10,
      latencyMs: 3,
      endpoint: { host: '127.0.0.1', port: 19080, protocol: 'socks5' },
      stages: [
        { stage: 'tcp_connect', status: 'passed', durationMs: 1 },
        { stage: 'socks5_handshake', status: 'passed', durationMs: 1 },
        {
          stage: 'upstream_request',
          status: failed ? 'failed' : 'passed',
          durationMs: 8
        }
      ],
      diagnostic: failed
        ? {
            category: 'upstream_request_failure',
            stage: 'upstream_request',
            message: 'upstream request failed',
            at: generatedAt + 60
          }
        : undefined
    },
    routingInjectionState: {
      profileId: 'profile-1',
      outboundName: 'AMNEZIA_HELPER_PROXY',
      groupName: 'AMNEZIA_HELPER',
      status: 'injected',
      updatedAt: generatedAt + 70,
      endpoint: { host: '127.0.0.1', port: 19080, protocol: 'socks5' }
    },
    tunEnabled,
    tunDnsEnabled: tunEnabled ? true : undefined,
    tunDnsHijackEnabled: tunEnabled,
    tunDnsEnhancedMode: tunEnabled ? 'fake-ip' : 'unknown',
    helperRuleReliability: 'reliable',
    helperRuleReliabilityReason: tunEnabled ? 'no_enabled_helper_rules' : 'tun_disabled',
    helperRuleReliabilityReasons: [tunEnabled ? 'no_enabled_helper_rules' : 'tun_disabled'],
    helperRuleReliabilityExplanation: tunEnabled
      ? 'No enabled AMNEZIA_HELPER rules are configured.'
      : 'TUN is disabled, so TUN DNS/fake-ip matching constraints do not apply.',
    helperRulesHaveDomainRules: false,
    helperRulesIpCidrOnly: false,
    udpSupport: 'supported',
    udpValidated: true,
    udpReasonCode: 'udp_associate_validated',
    udpExplanation: 'SOCKS5 UDP ASSOCIATE succeeded against the helper local proxy endpoint.',
    runtimeAdvertisesUdp: true,
    helperTunBypassActive: tunEnabled,
    helperTunBypassIps: tunEnabled ? ['203.0.113.10'] : [],
    helperTunBypassResolutionStatus: tunEnabled ? 'resolved' : 'not_required',
    tunScenarioResult: tunEnabled ? (failed ? 'failed' : 'passed') : 'not_run',
    tunSafetyBlocked: false,
    cleanupRestored: tunEnabled ? true : undefined,
    lifecycleStressPassed: true,
    reloadResiliencePassed: true,
    recoveryPassed: true,
    soakDurationMs: 1000,
    repeatedStartStopCount: 3,
    staleStateDetected: false,
    cleanupLeakDetected: false,
    tunRuntimeInjection: tunEnabled
      ? {
          helperOutboundInjected: true,
          helperRulesConfigured: 0,
          helperRulesInjected: false,
          serializedHelperRules: [],
          helperOutboundUdp: true,
          routeExcludeAddresses: ['203.0.113.10/32']
        }
      : undefined,
    cleanupResult: {
      status: 'stopped',
      stoppedAt: generatedAt + 90,
      tempConfigRemoved: true
    },
    diagnostics: failed
      ? [
          {
            code: 'upstream_request_failure',
            message: 'upstream request failed',
            stage: 'connectivity',
            at: generatedAt + 60
          }
        ]
      : [],
    stages: [
      createStage('backend_resolution', 'passed', generatedAt),
      createStage('self_check', 'passed', generatedAt + 10),
      createStage('startup', 'passed', generatedAt + 20),
      createStage('readiness', 'passed', generatedAt + 30),
      createStage('connectivity', connectivityStatus, generatedAt + 40),
      createStage('routing_injection', 'passed', generatedAt + 50),
      createStage('cleanup', 'passed', generatedAt + 60)
    ],
    summary: failed
      ? {
          status: 'failed',
          failedStage: 'connectivity',
          message: 'connectivity failed'
        }
      : {
          status: 'passed',
          message: 'verification passed'
        },
    releaseReadiness: {
      status: 'blocked',
      blockers: ['verification_not_classified'],
      warnings: []
    }
  }

  return report
}

function createStage(
  stage: AmneziaHelperVerificationReport['stages'][number]['stage'],
  status: AmneziaHelperVerificationReport['stages'][number]['status'],
  at: number
): AmneziaHelperVerificationReport['stages'][number] {
  return {
    stage,
    status,
    startedAt: at,
    finishedAt: at + 1,
    durationMs: 1
  }
}
