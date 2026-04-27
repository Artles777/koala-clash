import * as assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, it } from 'node:test'
import {
  AmneziaHelperCompatibilityMatrix,
  AmneziaHelperCompatibilityMatrixRow
} from '../src/main/runtime/amnezia-helper-matrix'
import {
  categorizePlatformValidationIssue,
  createAmneziaHelperPlatformValidationEvidenceLayout,
  createAmneziaHelperPlatformValidationIssuePackage,
  createAmneziaHelperPlatformValidationPlan,
  createAmneziaHelperPlatformValidationReportPath,
  createAmneziaHelperPlatformValidationSummary
} from '../src/main/runtime/amnezia-helper-platform-validation'

let cleanupTasks: Array<() => Promise<void>> = []

describe('Amnezia helper real platform validation support', () => {
  afterEach(async () => {
    const tasks = cleanupTasks
    cleanupTasks = []
    await Promise.all(tasks.map((task) => task()))
  })

  it('generates target-OS runbook commands for proxy, TUN, and stability smoke', () => {
    const plan = createAmneziaHelperPlatformValidationPlan({
      targets: [{ platform: 'linux', arch: 'x64' }],
      reportsDir: 'reports',
      packagedAppPath: '/opt/Koala Clash',
      fixtureProfilePath: '/private/amnezia-profile.json',
      buildId: 'build-42',
      appVersion: '1.2.0',
      helperRules: ['DOMAIN-SUFFIX,example.com'],
      stabilityCycles: 3,
      now: () => 1710000000000
    })

    assert.equal(plan.schemaVersion, 1)
    assert.equal(plan.commands.length, 3)
    assert.deepEqual(
      plan.commands.map((command) => command.scenario),
      ['proxy_smoke', 'tun_smoke', 'stability']
    )
    assert.ok(plan.commands[0].command.includes('--scenario packaged'))
    assert.ok(plan.commands[1].command.includes('--tun'))
    assert.ok(plan.commands[1].command.includes("--helper-rule 'DOMAIN-SUFFIX,example.com'"))
    assert.ok(plan.commands[2].command.includes('--stability'))
    assert.ok(plan.commands[2].command.includes('--stability-cycles 3'))
    assert.ok(plan.aggregationCommand.includes('--require-tun'))
    assert.ok(plan.summaryCommand.includes('amnezia-helper:platform-validation'))
    assert.ok(plan.issuePackageCommand.includes('package'))
  })

  it('creates run-scoped evidence layout and report naming helpers', () => {
    const layout = createAmneziaHelperPlatformValidationEvidenceLayout({
      evidenceDir: 'release-validation',
      runId: 'RC 1',
      targets: [{ platform: 'darwin', arch: 'arm64' }],
      now: () => 1710000000000
    })
    const reportPath = createAmneziaHelperPlatformValidationReportPath({
      reportsDir: layout.reportsDir,
      target: { platform: 'darwin', arch: 'arm64' },
      scenario: 'tun_smoke',
      nestedByTarget: true
    })

    assert.equal(layout.runId, 'RC-1')
    assert.equal(layout.rootDir, 'release-validation')
    assert.equal(layout.reportsDir, 'release-validation/RC-1/reports')
    assert.equal(
      reportPath,
      'release-validation/RC-1/reports/darwin-arm64/smoke-darwin-arm64-tun.json'
    )
    assert.equal(layout.reportPaths.length, 3)
    assert.ok(layout.issuePackagePath.endsWith('amnezia-helper-platform-validation-issues.json'))
  })

  it('plans run-scoped evidence commands when run id or evidence dir is provided', () => {
    const plan = createAmneziaHelperPlatformValidationPlan({
      targets: [{ platform: 'win32', arch: 'x64' }],
      evidenceDir: 'evidence',
      runId: 'build 42',
      now: () => 1710000000000
    })

    assert.equal(plan.runId, 'build-42')
    assert.ok(plan.evidenceLayout)
    assert.ok(plan.commands[0].reportPath.includes('evidence/build-42/reports/win32-x64/'))
    assert.ok(plan.aggregationCommand.includes('evidence/build-42/amnezia-helper-matrix.json'))
    assert.equal(plan.commandOrder.length, 7)
  })

  it('summarizes real platform evidence across proxy, TUN, and stability rows', () => {
    const matrix = createMatrix([
      createMatrixRow({ runtimeScenario: 'proxy', stabilityStatus: 'passed' }),
      createMatrixRow({ runtimeScenario: 'tun', helperTunBypassActive: true })
    ])
    const summary = createAmneziaHelperPlatformValidationSummary({
      matrix,
      now: () => 1710000000100
    })

    assert.equal(summary.releaseReadiness, 'supported')
    assert.equal(summary.targets[0].proxyScenarioResult, 'passed')
    assert.equal(summary.targets[0].tunScenarioResult, 'passed')
    assert.equal(summary.targets[0].stabilityResult, 'passed')
    assert.equal(summary.targets[0].helperChecksumSha256, 'checksum-linux-x64')
    assert.equal(summary.targets[0].helperVersion, '1.2.3')
    assert.deepEqual(summary.issues, [])
  })

  it('blocks phase-22 readiness when required stability evidence is missing', () => {
    const matrix = createMatrix([
      createMatrixRow({ runtimeScenario: 'proxy' }),
      createMatrixRow({ runtimeScenario: 'tun' })
    ])
    const summary = createAmneziaHelperPlatformValidationSummary({ matrix })

    assert.equal(summary.releaseReadiness, 'blocked')
    assert.equal(summary.targets[0].stabilityResult, 'missing')
    assert.ok(summary.issues.some((issue) => issue.code === 'stability_not_run'))
    assert.ok(summary.issues.some((issue) => issue.category === 'stability'))
  })

  it('keeps blocker and warning diagnostics categorized for support tracking', () => {
    const matrix = createMatrix([
      createMatrixRow({
        runtimeScenario: 'tun',
        blockerStatus: 'blocked',
        blockers: ['tun_bypass_missing'],
        warnings: ['udp:udp_not_validated']
      })
    ])
    const summary = createAmneziaHelperPlatformValidationSummary({
      matrix,
      requireTun: false,
      requireStability: false
    })

    assert.equal(categorizePlatformValidationIssue('tun_bypass_missing'), 'tun')
    assert.equal(categorizePlatformValidationIssue('udp:udp_not_validated'), 'udp')
    assert.ok(
      summary.issues.some(
        (issue) =>
          issue.code === 'tun_bypass_missing' &&
          issue.severity === 'blocker' &&
          issue.category === 'tun' &&
          issue.scenario === 'tun_smoke' &&
          issue.reproductionHint?.includes('reports/linux-x64-tun.json')
      )
    )
    assert.ok(
      summary.issues.some(
        (issue) =>
          issue.code === 'udp:udp_not_validated' &&
          issue.severity === 'warning' &&
          issue.category === 'udp'
      )
    )
  })

  it('packages blocker and warning evidence for issue filing', () => {
    const matrix = createMatrix([
      createMatrixRow({
        runtimeScenario: 'proxy',
        blockerStatus: 'blocked',
        blockers: ['connectivity_not_passed'],
        warnings: ['helper_version_missing']
      })
    ])
    const summary = createAmneziaHelperPlatformValidationSummary({
      matrix,
      requireTun: false,
      requireStability: false
    })
    const issuePackage = createAmneziaHelperPlatformValidationIssuePackage({
      summary,
      sourceSummaryPath: 'evidence/summary.json',
      sourceMatrixPath: 'evidence/matrix.json',
      reportsDir: 'evidence/reports',
      runId: 'build-1',
      now: () => 1710000000200
    })

    assert.equal(issuePackage.format, 'koala-clash.amnezia-helper-platform-evidence')
    assert.equal(issuePackage.runId, 'build-1')
    assert.equal(issuePackage.blockerCount, 1)
    assert.equal(issuePackage.warningCount, 1)
    assert.ok(
      issuePackage.issueFilingSummary.some((item) => item.includes('connectivity_not_passed'))
    )
  })

  it('emits a machine-readable platform validation summary from the CLI', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'koala-amnezia-platform-validation-'))
    cleanupTasks.push(async () => rm(dir, { recursive: true, force: true }))
    const matrixPath = path.join(dir, 'matrix.json')
    const matrix = createMatrix([
      createMatrixRow({ runtimeScenario: 'proxy', stabilityStatus: 'passed' }),
      createMatrixRow({ runtimeScenario: 'tun' })
    ])
    await writeFile(matrixPath, `${JSON.stringify(matrix, null, 2)}\n`, 'utf-8')

    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        'scripts/amnezia-helper-platform-validation.ts',
        'summarize',
        '--matrix',
        matrixPath,
        '--compact'
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf-8'
      }
    )

    assert.equal(result.status, 0, result.stderr)
    const summary = JSON.parse(result.stdout) as ReturnType<
      typeof createAmneziaHelperPlatformValidationSummary
    >
    assert.equal(summary.schemaVersion, 1)
    assert.equal(summary.releaseReadiness, 'supported')
    assert.equal(summary.targets[0].tunScenarioResult, 'passed')
  })

  it('emits a machine-readable issue package from the CLI', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'koala-amnezia-platform-issues-'))
    cleanupTasks.push(async () => rm(dir, { recursive: true, force: true }))
    const summaryPath = path.join(dir, 'summary.json')
    const matrix = createMatrix([
      createMatrixRow({
        runtimeScenario: 'tun',
        blockerStatus: 'blocked',
        blockers: ['tun_bypass_missing']
      })
    ])
    const summary = createAmneziaHelperPlatformValidationSummary({ matrix })
    await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf-8')

    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        'scripts/amnezia-helper-platform-validation.ts',
        'package',
        '--summary',
        summaryPath,
        '--run-id',
        'build-1',
        '--compact'
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf-8'
      }
    )

    assert.equal(result.status, 0, result.stderr)
    const issuePackage = JSON.parse(result.stdout) as ReturnType<
      typeof createAmneziaHelperPlatformValidationIssuePackage
    >
    assert.equal(issuePackage.schemaVersion, 1)
    assert.equal(issuePackage.runId, 'build-1')
    assert.ok(issuePackage.blockers.some((issue) => issue.code === 'tun_bypass_missing'))
  })
})

function createMatrix(
  rows: AmneziaHelperCompatibilityMatrixRow[]
): AmneziaHelperCompatibilityMatrix {
  const releaseStatus = rows.some((row) => row.blockerStatus === 'blocked')
    ? 'blocked'
    : rows.some((row) => row.blockerStatus === 'warning')
      ? 'warning'
      : 'supported'

  return {
    schemaVersion: 1,
    generatedAt: 1710000000000,
    requiredTargets: [{ platform: 'linux', arch: 'x64' }],
    rows,
    summary: {
      releaseStatus,
      totalTargets: rows.length,
      supported: rows.filter((row) => row.blockerStatus === 'supported').length,
      warning: rows.filter((row) => row.blockerStatus === 'warning').length,
      blocked: rows.filter((row) => row.blockerStatus === 'blocked').length,
      missing: rows.filter((row) => row.blockers.includes('smoke_report_missing')).length,
      message: 'test matrix'
    }
  }
}

function createMatrixRow(
  input: {
    runtimeScenario: 'proxy' | 'tun'
    blockerStatus?: 'supported' | 'warning' | 'blocked'
    blockers?: string[]
    warnings?: string[]
    helperTunBypassActive?: boolean
    stabilityStatus?: 'passed' | 'failed' | 'skipped'
  } = { runtimeScenario: 'proxy' }
): AmneziaHelperCompatibilityMatrixRow {
  const tunEnabled = input.runtimeScenario === 'tun'
  return {
    platform: 'linux',
    arch: 'x64',
    reportId: `linux-x64-${input.runtimeScenario}`,
    reportPath: `reports/linux-x64-${input.runtimeScenario}.json`,
    generatedAt: 1710000000000,
    buildId: 'build-1',
    appVersion: '1.2.0',
    scenario: 'packaged',
    runtimeScenario: input.runtimeScenario,
    packaged: true,
    backendKind: 'production',
    backendSource: 'packaged_app',
    helperPathUsed: '/opt/koala/resources/files/amnezia-helper/linux/x64/amnezia-helper',
    helperChecksumSha256: 'checksum-linux-x64',
    helperVersion: '1.2.3',
    startupResult: 'passed',
    readinessResult: 'passed',
    connectivityResult: 'passed',
    routingInjectionResult: 'passed',
    cleanupResult: 'passed',
    tunEnabled,
    tunDnsHijackEnabled: tunEnabled,
    tunDnsEnhancedMode: tunEnabled ? 'fake-ip' : 'unknown',
    helperRuleReliability: 'reliable',
    helperRuleReliabilityReason: tunEnabled ? 'no_enabled_helper_rules' : 'tun_disabled',
    helperRulesHaveDomainRules: false,
    helperRulesIpCidrOnly: false,
    udpSupport: 'supported',
    udpValidated: true,
    udpReasonCode: 'udp_associate_validated',
    runtimeAdvertisesUdp: true,
    helperTunBypassActive: input.helperTunBypassActive ?? tunEnabled,
    helperTunBypassIps: tunEnabled ? ['203.0.113.10'] : [],
    helperTunBypassResolutionStatus: tunEnabled ? 'resolved' : 'not_required',
    tunScenarioResult: tunEnabled ? 'passed' : 'not_run',
    tunSafetyBlocked: false,
    cleanupRestored: tunEnabled ? true : undefined,
    stabilityStatus: input.stabilityStatus,
    lifecycleStressPassed: input.stabilityStatus === 'passed',
    reloadResiliencePassed: input.stabilityStatus === 'passed',
    recoveryPassed: input.stabilityStatus === 'passed',
    soakDurationMs: input.stabilityStatus === 'passed' ? 1000 : 0,
    repeatedStartStopCount: input.stabilityStatus === 'passed' ? 3 : 0,
    staleStateDetected: false,
    cleanupLeakDetected: false,
    blockerStatus: input.blockerStatus ?? 'supported',
    blockers: input.blockers ?? [],
    warnings: input.warnings ?? [],
    diagnosticsSummary: [
      ...(input.blockers ?? []).map((code) => ({
        code,
        count: 1,
        stages: ['routing_injection' as const]
      })),
      ...(input.warnings ?? []).map((code) => ({
        code,
        count: 1,
        stages: ['connectivity' as const]
      }))
    ]
  }
}
