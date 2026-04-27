import { readFile } from 'fs/promises'
import {
  AmneziaHelperArtifactTarget,
  allAmneziaHelperArtifactTargets
} from './amnezia-helper-artifacts'
import {
  AmneziaHelperReleaseReadinessStatus,
  AmneziaHelperVerificationDiagnostic,
  AmneziaHelperVerificationReport,
  AmneziaHelperVerificationRuntimeScenario,
  AmneziaHelperVerificationStageName,
  AmneziaHelperVerificationStageStatus,
  classifyVerificationReleaseReadiness
} from './amnezia-helper-verification'

type AmneziaHelperMatrixStabilityStatus = NonNullable<
  AmneziaHelperVerificationReport['stabilityResult']
>['summary']['status']

export interface AmneziaHelperSmokeReportInput {
  report: AmneziaHelperVerificationReport
  path?: string
}

export interface AmneziaHelperCompatibilityMatrixRow {
  platform: string
  arch: string
  reportId?: string
  reportPath?: string
  generatedAt?: number
  buildId?: string
  appVersion?: string
  scenario?: AmneziaHelperVerificationReport['scenario']
  runtimeScenario: AmneziaHelperVerificationRuntimeScenario
  packaged?: boolean
  backendKind?: AmneziaHelperVerificationReport['backendKind']
  backendSource?: AmneziaHelperVerificationReport['backendSource']
  helperPathUsed?: string
  helperChecksumSha256?: string
  helperVersion?: string
  startupResult: AmneziaHelperVerificationStageStatus | 'missing'
  readinessResult: AmneziaHelperVerificationStageStatus | 'missing'
  connectivityResult: AmneziaHelperVerificationStageStatus | 'missing'
  routingInjectionResult: AmneziaHelperVerificationStageStatus | 'missing'
  cleanupResult: AmneziaHelperVerificationStageStatus | 'missing'
  tunEnabled: boolean
  tunDnsHijackEnabled: boolean
  tunDnsEnhancedMode: AmneziaHelperVerificationReport['tunDnsEnhancedMode']
  helperRuleReliability: AmneziaHelperVerificationReport['helperRuleReliability']
  helperRuleReliabilityReason: AmneziaHelperVerificationReport['helperRuleReliabilityReason']
  helperRulesHaveDomainRules: boolean
  helperRulesIpCidrOnly: boolean
  udpSupport: AmneziaHelperVerificationReport['udpSupport']
  udpValidated: boolean
  udpReasonCode: AmneziaHelperVerificationReport['udpReasonCode']
  runtimeAdvertisesUdp: boolean
  helperTunBypassActive: boolean
  helperTunBypassIps: string[]
  helperTunBypassResolutionStatus: AmneziaHelperVerificationReport['helperTunBypassResolutionStatus']
  tunScenarioResult: AmneziaHelperVerificationReport['tunScenarioResult']
  tunSafetyBlocked: boolean
  cleanupRestored?: boolean
  stabilityStatus?: AmneziaHelperMatrixStabilityStatus
  lifecycleStressPassed: boolean
  reloadResiliencePassed: boolean
  recoveryPassed: boolean
  soakDurationMs: number
  repeatedStartStopCount: number
  staleStateDetected: boolean
  cleanupLeakDetected: boolean
  blockerStatus: AmneziaHelperReleaseReadinessStatus
  blockers: string[]
  warnings: string[]
  diagnosticsSummary: Array<{
    code: string
    count: number
    stages: AmneziaHelperVerificationStageName[]
  }>
}

export interface AmneziaHelperCompatibilityMatrix {
  schemaVersion: 1
  generatedAt: number
  requiredTargets: AmneziaHelperArtifactTarget[]
  rows: AmneziaHelperCompatibilityMatrixRow[]
  summary: {
    releaseStatus: AmneziaHelperReleaseReadinessStatus
    totalTargets: number
    supported: number
    warning: number
    blocked: number
    missing: number
    message: string
  }
}

export interface AggregateAmneziaHelperSmokeReportsOptions {
  reports: AmneziaHelperSmokeReportInput[]
  requiredTargets?: AmneziaHelperArtifactTarget[]
  requiredRuntimeScenarios?: AmneziaHelperVerificationRuntimeScenario[]
  now?: () => number
}

export async function loadAmneziaHelperSmokeReport(
  filePath: string
): Promise<AmneziaHelperSmokeReportInput> {
  const report = JSON.parse(await readFile(filePath, 'utf-8')) as AmneziaHelperVerificationReport
  return { report, path: filePath }
}

export function aggregateAmneziaHelperSmokeReports(
  options: AggregateAmneziaHelperSmokeReportsOptions
): AmneziaHelperCompatibilityMatrix {
  const now = options.now ?? Date.now
  const requiredTargets = options.requiredTargets ?? allAmneziaHelperArtifactTargets()
  const requiredRuntimeScenarios = options.requiredRuntimeScenarios ?? ['proxy']
  const latestReports = selectLatestReportsByTarget(options.reports)
  const rows = requiredTargets.flatMap((target) =>
    requiredRuntimeScenarios.map((runtimeScenario) => {
      const report = latestReports.get(targetKey(target, runtimeScenario))
      return report
        ? createMatrixRowFromReport(report)
        : createMissingMatrixRow(target.platform, target.arch, runtimeScenario)
    })
  )

  for (const [key, report] of latestReports) {
    if (
      !requiredTargets.some((target) =>
        requiredRuntimeScenarios.some(
          (runtimeScenario) => targetKey(target, runtimeScenario) === key
        )
      )
    ) {
      rows.push(createMatrixRowFromReport(report))
    }
  }

  return finalizeCompatibilityMatrix({
    generatedAt: now(),
    requiredTargets,
    rows
  })
}

export function classifyMatrixReleaseStatus(
  rows: AmneziaHelperCompatibilityMatrixRow[]
): AmneziaHelperReleaseReadinessStatus {
  if (rows.some((row) => row.blockerStatus === 'blocked')) return 'blocked'
  if (rows.some((row) => row.blockerStatus === 'warning')) return 'warning'
  return 'supported'
}

function selectLatestReportsByTarget(
  inputs: AmneziaHelperSmokeReportInput[]
): Map<string, AmneziaHelperSmokeReportInput> {
  const result = new Map<string, AmneziaHelperSmokeReportInput>()

  for (const input of inputs) {
    const key = reportKey(input.report)
    const current = result.get(key)
    if (!current || input.report.generatedAt >= current.report.generatedAt) {
      result.set(key, input)
    }
  }

  return result
}

function createMatrixRowFromReport(
  input: AmneziaHelperSmokeReportInput
): AmneziaHelperCompatibilityMatrixRow {
  const readiness =
    input.report.releaseReadiness ?? classifyVerificationReleaseReadiness(input.report)
  return {
    platform: input.report.platform,
    arch: input.report.arch,
    reportId: input.report.id,
    reportPath: input.path,
    generatedAt: input.report.generatedAt,
    buildId: input.report.buildId,
    appVersion: input.report.appVersion,
    scenario: input.report.scenario,
    runtimeScenario: input.report.runtimeScenario ?? 'proxy',
    packaged: input.report.packaged,
    backendKind: input.report.backendKind,
    backendSource: input.report.backendSource,
    helperPathUsed: input.report.helperPathUsed,
    helperChecksumSha256: input.report.helperChecksumSha256,
    helperVersion: input.report.helperVersion,
    startupResult: getStageStatus(input.report, 'startup'),
    readinessResult: getStageStatus(input.report, 'readiness'),
    connectivityResult: getStageStatus(input.report, 'connectivity'),
    routingInjectionResult: getStageStatus(input.report, 'routing_injection'),
    cleanupResult: getStageStatus(input.report, 'cleanup'),
    tunEnabled: input.report.tunEnabled ?? false,
    tunDnsHijackEnabled: input.report.tunDnsHijackEnabled ?? false,
    tunDnsEnhancedMode: input.report.tunDnsEnhancedMode ?? 'unknown',
    helperRuleReliability: input.report.helperRuleReliability ?? 'reliable',
    helperRuleReliabilityReason: input.report.helperRuleReliabilityReason ?? 'tun_disabled',
    helperRulesHaveDomainRules: input.report.helperRulesHaveDomainRules ?? false,
    helperRulesIpCidrOnly: input.report.helperRulesIpCidrOnly ?? false,
    udpSupport: input.report.udpSupport ?? 'unknown',
    udpValidated: input.report.udpValidated ?? false,
    udpReasonCode: input.report.udpReasonCode ?? 'udp_not_validated',
    runtimeAdvertisesUdp: input.report.runtimeAdvertisesUdp ?? false,
    helperTunBypassActive: input.report.helperTunBypassActive ?? false,
    helperTunBypassIps: [...(input.report.helperTunBypassIps ?? [])],
    helperTunBypassResolutionStatus: input.report.helperTunBypassResolutionStatus ?? 'not_required',
    tunScenarioResult: input.report.tunScenarioResult ?? 'not_run',
    tunSafetyBlocked: input.report.tunSafetyBlocked ?? false,
    cleanupRestored: input.report.cleanupRestored,
    stabilityStatus: input.report.stabilityResult?.summary.status,
    lifecycleStressPassed: input.report.lifecycleStressPassed ?? false,
    reloadResiliencePassed: input.report.reloadResiliencePassed ?? false,
    recoveryPassed: input.report.recoveryPassed ?? false,
    soakDurationMs: input.report.soakDurationMs ?? 0,
    repeatedStartStopCount: input.report.repeatedStartStopCount ?? 0,
    staleStateDetected: input.report.staleStateDetected ?? false,
    cleanupLeakDetected: input.report.cleanupLeakDetected ?? false,
    blockerStatus: readiness.status,
    blockers: [...readiness.blockers],
    warnings: [...readiness.warnings],
    diagnosticsSummary: summarizeDiagnostics(input.report.diagnostics)
  }
}

function createMissingMatrixRow(
  platform: string,
  arch: string,
  runtimeScenario: AmneziaHelperVerificationRuntimeScenario
): AmneziaHelperCompatibilityMatrixRow {
  return {
    platform,
    arch,
    runtimeScenario,
    startupResult: 'missing',
    readinessResult: 'missing',
    connectivityResult: 'missing',
    routingInjectionResult: 'missing',
    cleanupResult: 'missing',
    tunEnabled: runtimeScenario === 'tun',
    tunDnsHijackEnabled: false,
    tunDnsEnhancedMode: 'unknown',
    helperRuleReliability: runtimeScenario === 'tun' ? 'blocked' : 'reliable',
    helperRuleReliabilityReason:
      runtimeScenario === 'tun' ? 'domain_rules_unknown_dns_mode' : 'tun_disabled',
    helperRulesHaveDomainRules: false,
    helperRulesIpCidrOnly: false,
    udpSupport: 'unknown',
    udpValidated: false,
    udpReasonCode: 'udp_not_validated',
    runtimeAdvertisesUdp: false,
    helperTunBypassActive: false,
    helperTunBypassIps: [],
    helperTunBypassResolutionStatus: runtimeScenario === 'tun' ? 'failed' : 'not_required',
    tunScenarioResult: runtimeScenario === 'tun' ? 'skipped' : 'not_run',
    tunSafetyBlocked: false,
    lifecycleStressPassed: false,
    reloadResiliencePassed: false,
    recoveryPassed: false,
    soakDurationMs: 0,
    repeatedStartStopCount: 0,
    staleStateDetected: false,
    cleanupLeakDetected: false,
    blockerStatus: 'blocked',
    blockers: ['smoke_report_missing'],
    warnings: [],
    diagnosticsSummary: []
  }
}

function finalizeCompatibilityMatrix(input: {
  generatedAt: number
  requiredTargets: AmneziaHelperArtifactTarget[]
  rows: AmneziaHelperCompatibilityMatrixRow[]
}): AmneziaHelperCompatibilityMatrix {
  const releaseStatus = classifyMatrixReleaseStatus(input.rows)
  const supported = input.rows.filter((row) => row.blockerStatus === 'supported').length
  const warning = input.rows.filter((row) => row.blockerStatus === 'warning').length
  const blocked = input.rows.filter((row) => row.blockerStatus === 'blocked').length
  const missing = input.rows.filter((row) => row.blockers.includes('smoke_report_missing')).length

  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    requiredTargets: input.requiredTargets.map((target) => ({ ...target })),
    rows: input.rows,
    summary: {
      releaseStatus,
      totalTargets: input.rows.length,
      supported,
      warning,
      blocked,
      missing,
      message:
        releaseStatus === 'blocked'
          ? `Amnezia helper compatibility matrix is blocked: ${blocked} blocked target(s)`
          : releaseStatus === 'warning'
            ? `Amnezia helper compatibility matrix has warnings: ${warning} warning target(s)`
            : `Amnezia helper compatibility matrix is supported for ${supported} target(s)`
    }
  }
}

function getStageStatus(
  report: AmneziaHelperVerificationReport,
  stage: AmneziaHelperVerificationStageName
): AmneziaHelperVerificationStageStatus | 'missing' {
  return report.stages.find((item) => item.stage === stage)?.status ?? 'missing'
}

function summarizeDiagnostics(
  diagnostics: AmneziaHelperVerificationDiagnostic[]
): AmneziaHelperCompatibilityMatrixRow['diagnosticsSummary'] {
  const counts = new Map<
    string,
    {
      count: number
      stages: Set<AmneziaHelperVerificationStageName>
    }
  >()

  for (const diagnostic of diagnostics) {
    const existing = counts.get(diagnostic.code) ?? {
      count: 0,
      stages: new Set<AmneziaHelperVerificationStageName>()
    }
    existing.count += 1
    existing.stages.add(diagnostic.stage)
    counts.set(diagnostic.code, existing)
  }

  return Array.from(counts.entries()).map(([code, value]) => ({
    code,
    count: value.count,
    stages: Array.from(value.stages)
  }))
}

function targetKey(
  target: AmneziaHelperArtifactTarget,
  runtimeScenario: AmneziaHelperVerificationRuntimeScenario
): string {
  return `${target.platform}/${target.arch}/${runtimeScenario}`
}

function reportKey(report: AmneziaHelperVerificationReport): string {
  return `${report.platform}/${report.arch}/${report.runtimeScenario ?? 'proxy'}`
}
