import {
  AmneziaHelperArtifactTarget,
  allAmneziaHelperArtifactTargets
} from './amnezia-helper-artifacts'
import {
  AmneziaHelperCompatibilityMatrix,
  AmneziaHelperCompatibilityMatrixRow
} from './amnezia-helper-matrix'
import {
  AmneziaHelperReleaseReadinessStatus,
  AmneziaHelperVerificationRuntimeScenario
} from './amnezia-helper-verification'

export type AmneziaHelperPlatformValidationScenario = 'proxy_smoke' | 'tun_smoke' | 'stability'

export type AmneziaHelperPlatformValidationScenarioResult =
  | 'passed'
  | 'warning'
  | 'failed'
  | 'missing'
  | 'skipped'

export type AmneziaHelperPlatformValidationIssueSeverity = 'blocker' | 'warning'
export type AmneziaHelperPlatformValidationEvidenceFormat =
  'koala-clash.amnezia-helper-platform-evidence'

export type AmneziaHelperPlatformValidationIssueCategory =
  | 'artifact'
  | 'packaging'
  | 'self_check'
  | 'startup'
  | 'readiness'
  | 'connectivity'
  | 'routing'
  | 'tun'
  | 'dns_rules'
  | 'udp'
  | 'stability'
  | 'cleanup'
  | 'fixture'
  | 'evidence'
  | 'unknown'

export interface AmneziaHelperPlatformValidationRunCommand {
  id: string
  platform: string
  arch: string
  scenario: AmneziaHelperPlatformValidationScenario
  command: string
  reportPath: string
  mustRunOnTargetOs: true
  description: string
}

export interface AmneziaHelperPlatformValidationEvidenceLayout {
  schemaVersion: 1
  runId: string
  rootDir: string
  reportsDir: string
  matrixPath: string
  summaryPath: string
  issuePackagePath: string
  runbookPath: string
  reportPaths: Array<{
    platform: string
    arch: string
    scenario: AmneziaHelperPlatformValidationScenario
    path: string
  }>
}

export interface AmneziaHelperPlatformValidationPlan {
  schemaVersion: 1
  generatedAt: number
  runId: string
  evidenceLayout?: AmneziaHelperPlatformValidationEvidenceLayout
  targets: AmneziaHelperArtifactTarget[]
  scenarios: AmneziaHelperPlatformValidationScenario[]
  commands: AmneziaHelperPlatformValidationRunCommand[]
  aggregationCommand: string
  summaryCommand: string
  issuePackageCommand: string
  commandOrder: string[]
  notes: string[]
}

export interface CreateAmneziaHelperPlatformValidationPlanOptions {
  targets?: AmneziaHelperArtifactTarget[]
  includeTun?: boolean
  includeStability?: boolean
  reportsDir?: string
  packagedAppPath?: string
  fixtureProfilePath?: string
  buildId?: string
  appVersion?: string
  helperRules?: string[]
  dnsEnhancedMode?: string
  dnsHijack?: boolean
  stabilityCycles?: number
  soakDurationMs?: number
  soakIntervalMs?: number
  packageManagerCommand?: string
  evidenceDir?: string
  runId?: string
  now?: () => number
}

export interface AmneziaHelperPlatformValidationIssue {
  id: string
  category: AmneziaHelperPlatformValidationIssueCategory
  severity: AmneziaHelperPlatformValidationIssueSeverity
  platform: string
  arch: string
  scenario?: AmneziaHelperPlatformValidationScenario
  runtimeScenario?: AmneziaHelperVerificationRuntimeScenario
  code: string
  reportReference?: string
  notes?: string
  reproductionHint?: string
}

export interface AmneziaHelperPlatformValidationIssuePackage {
  schemaVersion: 1
  format: AmneziaHelperPlatformValidationEvidenceFormat
  generatedAt: number
  runId?: string
  releaseReadiness: AmneziaHelperReleaseReadinessStatus
  sourceSummaryPath?: string
  sourceMatrixPath?: string
  reportsDir?: string
  blockerCount: number
  warningCount: number
  blockers: AmneziaHelperPlatformValidationIssue[]
  warnings: AmneziaHelperPlatformValidationIssue[]
  issueFilingSummary: string[]
}

export interface AmneziaHelperPlatformValidationTargetResult {
  platform: string
  arch: string
  buildId?: string
  appVersion?: string
  helperChecksumSha256?: string
  helperVersion?: string
  proxyScenarioResult: AmneziaHelperPlatformValidationScenarioResult
  tunScenarioResult: AmneziaHelperPlatformValidationScenarioResult
  stabilityResult: AmneziaHelperPlatformValidationScenarioResult
  releaseReadiness: AmneziaHelperReleaseReadinessStatus
  reportReferences: string[]
  issues: AmneziaHelperPlatformValidationIssue[]
  diagnosticsSummary: Array<{
    code: string
    count: number
    runtimeScenario: AmneziaHelperVerificationRuntimeScenario
  }>
}

export interface AmneziaHelperPlatformValidationSummary {
  schemaVersion: 1
  generatedAt: number
  matrixGeneratedAt: number
  releaseReadiness: AmneziaHelperReleaseReadinessStatus
  requireTun: boolean
  requireStability: boolean
  targets: AmneziaHelperPlatformValidationTargetResult[]
  issues: AmneziaHelperPlatformValidationIssue[]
  summary: {
    totalTargets: number
    supported: number
    warning: number
    blocked: number
    missing: number
    message: string
  }
}

export interface CreateAmneziaHelperPlatformValidationSummaryOptions {
  matrix: AmneziaHelperCompatibilityMatrix
  requireTun?: boolean
  requireStability?: boolean
  now?: () => number
}

export interface CreateAmneziaHelperPlatformValidationEvidenceLayoutOptions {
  evidenceDir?: string
  reportsDir?: string
  runId?: string
  buildId?: string
  appVersion?: string
  targets?: AmneziaHelperArtifactTarget[]
  includeTun?: boolean
  includeStability?: boolean
  now?: () => number
}

export interface CreateAmneziaHelperPlatformValidationIssuePackageOptions {
  summary: AmneziaHelperPlatformValidationSummary
  sourceSummaryPath?: string
  sourceMatrixPath?: string
  reportsDir?: string
  runId?: string
  now?: () => number
}

const defaultReportsDir = 'smoke-reports'
const defaultEvidenceDir = 'release-evidence/amnezia-helper'

export function createAmneziaHelperPlatformValidationPlan(
  options: CreateAmneziaHelperPlatformValidationPlanOptions = {}
): AmneziaHelperPlatformValidationPlan {
  const now = options.now ?? Date.now
  const targets = options.targets ?? allAmneziaHelperArtifactTargets()
  const includeTun = options.includeTun ?? true
  const includeStability = options.includeStability ?? true
  const generatedAt = now()
  const runId = createPlatformValidationRunId({
    runId: options.runId,
    buildId: options.buildId,
    appVersion: options.appVersion,
    generatedAt
  })
  const evidenceLayout =
    options.evidenceDir || options.runId
      ? createAmneziaHelperPlatformValidationEvidenceLayout({
          evidenceDir: options.evidenceDir,
          reportsDir: options.reportsDir,
          runId,
          targets,
          includeTun,
          includeStability,
          now: () => generatedAt
        })
      : undefined
  const reportsDir = evidenceLayout?.reportsDir ?? options.reportsDir ?? defaultReportsDir
  const packageManagerCommand = options.packageManagerCommand ?? 'pnpm'
  const packagedAppPath = options.packagedAppPath ?? '<packaged-app-path>'
  const fixtureProfilePath = options.fixtureProfilePath ?? '<private-normalized-profile.json>'
  const scenarios: AmneziaHelperPlatformValidationScenario[] = [
    'proxy_smoke',
    ...(includeTun ? (['tun_smoke'] as const) : []),
    ...(includeStability ? (['stability'] as const) : [])
  ]

  const commands = targets.flatMap((target) =>
    scenarios.map((scenario) =>
      createScenarioCommand({
        target,
        scenario,
        reportsDir,
        reportPath: evidenceLayout
          ? getEvidenceLayoutReportPath(evidenceLayout, target, scenario)
          : undefined,
        packageManagerCommand,
        packagedAppPath,
        fixtureProfilePath,
        buildId: options.buildId,
        appVersion: options.appVersion,
        helperRules: options.helperRules ?? [],
        dnsEnhancedMode: options.dnsEnhancedMode ?? 'fake-ip',
        dnsHijack: options.dnsHijack ?? true,
        stabilityCycles: options.stabilityCycles,
        soakDurationMs: options.soakDurationMs,
        soakIntervalMs: options.soakIntervalMs
      })
    )
  )

  const aggregationCommand = [
    packageManagerCommand,
    'amnezia-helper:matrix',
    '--',
    '--reports-dir',
    quoteShell(reportsDir),
    '--all',
    ...(includeTun ? ['--require-tun'] : []),
    '--output',
    quoteShell(evidenceLayout?.matrixPath ?? `${reportsDir}/amnezia-helper-matrix.json`)
  ].join(' ')

  const summaryCommand = [
    packageManagerCommand,
    'amnezia-helper:platform-validation',
    '--',
    'summarize',
    '--matrix',
    quoteShell(evidenceLayout?.matrixPath ?? `${reportsDir}/amnezia-helper-matrix.json`),
    '--output',
    quoteShell(
      evidenceLayout?.summaryPath ?? `${reportsDir}/amnezia-helper-platform-validation-summary.json`
    )
  ].join(' ')

  const issuePackageCommand = [
    packageManagerCommand,
    'amnezia-helper:platform-validation',
    '--',
    'package',
    '--summary',
    quoteShell(
      evidenceLayout?.summaryPath ?? `${reportsDir}/amnezia-helper-platform-validation-summary.json`
    ),
    '--output',
    quoteShell(
      evidenceLayout?.issuePackagePath ??
        `${reportsDir}/amnezia-helper-platform-validation-issues.json`
    )
  ].join(' ')

  return {
    schemaVersion: 1,
    generatedAt,
    runId,
    evidenceLayout,
    targets: targets.map((target) => ({ ...target })),
    scenarios,
    commands,
    aggregationCommand,
    summaryCommand,
    issuePackageCommand,
    commandOrder: [
      'Run proxy smoke on each matching target OS.',
      ...(includeTun ? ['Run TUN smoke on each matching target OS.'] : []),
      ...(includeStability ? ['Run stability smoke on each matching target OS.'] : []),
      'Collect all JSON reports into the reports directory.',
      'Run the matrix aggregation command.',
      'Run the platform validation summary command.',
      'Run the issue package command when blockers or warnings need release tracking.'
    ],
    notes: [
      'Run each smoke command on the matching target OS and architecture with real packaged app artifacts.',
      'Use private normalized Amnezia profile fixtures only; do not commit raw vpn:// keys or private keys.',
      'The aggregation and summary commands can run on any machine after per-platform JSON reports are collected.'
    ]
  }
}

export function createAmneziaHelperPlatformValidationSummary(
  options: CreateAmneziaHelperPlatformValidationSummaryOptions
): AmneziaHelperPlatformValidationSummary {
  const now = options.now ?? Date.now
  const requireTun = options.requireTun ?? true
  const requireStability = options.requireStability ?? true
  const targets = resolveSummaryTargets(options.matrix)
  const targetResults = targets.map((target) =>
    createTargetValidationResult({
      target,
      rows: options.matrix.rows.filter(
        (row) => row.platform === target.platform && row.arch === target.arch
      ),
      requireTun,
      requireStability
    })
  )
  const issues = targetResults.flatMap((target) => target.issues)
  const releaseReadiness = classifyPlatformValidationReadiness(targetResults)
  const supported = targetResults.filter((target) => target.releaseReadiness === 'supported').length
  const warning = targetResults.filter((target) => target.releaseReadiness === 'warning').length
  const blocked = targetResults.filter((target) => target.releaseReadiness === 'blocked').length
  const missing = issues.filter(
    (issue) => issue.code.includes('missing') || issue.code === 'stability_not_run'
  ).length

  return {
    schemaVersion: 1,
    generatedAt: now(),
    matrixGeneratedAt: options.matrix.generatedAt,
    releaseReadiness,
    requireTun,
    requireStability,
    targets: targetResults,
    issues,
    summary: {
      totalTargets: targetResults.length,
      supported,
      warning,
      blocked,
      missing,
      message:
        releaseReadiness === 'blocked'
          ? `Real platform validation is blocked: ${blocked} blocked target(s)`
          : releaseReadiness === 'warning'
            ? `Real platform validation has warnings: ${warning} warning target(s)`
            : `Real platform validation is supported for ${supported} target(s)`
    }
  }
}

export function createAmneziaHelperPlatformValidationEvidenceLayout(
  options: CreateAmneziaHelperPlatformValidationEvidenceLayoutOptions = {}
): AmneziaHelperPlatformValidationEvidenceLayout {
  const now = options.now ?? Date.now
  const generatedAt = now()
  const runId = createPlatformValidationRunId({
    runId: options.runId,
    buildId: options.buildId,
    appVersion: options.appVersion,
    generatedAt
  })
  const rootDir = trimTrailingSlash(options.evidenceDir ?? defaultEvidenceDir)
  const reportsDir = trimTrailingSlash(options.reportsDir ?? `${rootDir}/${runId}/reports`)
  const targets = options.targets ?? allAmneziaHelperArtifactTargets()
  const scenarios: AmneziaHelperPlatformValidationScenario[] = [
    'proxy_smoke',
    ...((options.includeTun ?? true) ? (['tun_smoke'] as const) : []),
    ...((options.includeStability ?? true) ? (['stability'] as const) : [])
  ]

  return {
    schemaVersion: 1,
    runId,
    rootDir,
    reportsDir,
    matrixPath: `${rootDir}/${runId}/amnezia-helper-matrix.json`,
    summaryPath: `${rootDir}/${runId}/amnezia-helper-platform-validation-summary.json`,
    issuePackagePath: `${rootDir}/${runId}/amnezia-helper-platform-validation-issues.json`,
    runbookPath: `${rootDir}/${runId}/RUNBOOK.md`,
    reportPaths: targets.flatMap((target) =>
      scenarios.map((scenario) => ({
        platform: target.platform,
        arch: target.arch,
        scenario,
        path: createAmneziaHelperPlatformValidationReportPath({
          reportsDir,
          target,
          scenario,
          nestedByTarget: true
        })
      }))
    )
  }
}

export function createAmneziaHelperPlatformValidationReportPath(input: {
  reportsDir: string
  target: AmneziaHelperArtifactTarget
  scenario: AmneziaHelperPlatformValidationScenario
  nestedByTarget?: boolean
}): string {
  const targetId = `${input.target.platform}-${input.target.arch}`
  const fileName = `smoke-${targetId}-${scenarioSuffix(input.scenario)}.json`
  return input.nestedByTarget
    ? `${trimTrailingSlash(input.reportsDir)}/${targetId}/${fileName}`
    : `${trimTrailingSlash(input.reportsDir)}/${fileName}`
}

export function createAmneziaHelperPlatformValidationIssuePackage(
  options: CreateAmneziaHelperPlatformValidationIssuePackageOptions
): AmneziaHelperPlatformValidationIssuePackage {
  const now = options.now ?? Date.now
  const blockers = options.summary.issues.filter((issue) => issue.severity === 'blocker')
  const warnings = options.summary.issues.filter((issue) => issue.severity === 'warning')

  return {
    schemaVersion: 1,
    format: 'koala-clash.amnezia-helper-platform-evidence',
    generatedAt: now(),
    runId: options.runId,
    releaseReadiness: options.summary.releaseReadiness,
    sourceSummaryPath: options.sourceSummaryPath,
    sourceMatrixPath: options.sourceMatrixPath,
    reportsDir: options.reportsDir,
    blockerCount: blockers.length,
    warningCount: warnings.length,
    blockers,
    warnings,
    issueFilingSummary: [...blockers, ...warnings].map(formatIssueForFiling)
  }
}

export function categorizePlatformValidationIssue(
  code: string
): AmneziaHelperPlatformValidationIssueCategory {
  if (code.includes('tun_dns') || code.includes('rule_reliability')) return 'dns_rules'
  if (code.includes('tun_bypass') || code.startsWith('tun_')) return 'tun'
  if (code.includes('udp')) return 'udp'
  if (code.includes('missing') || code.includes('not_packaged')) {
    if (code.includes('helper') || code.includes('backend')) return 'artifact'
    if (code.includes('fixture')) return 'fixture'
    return 'evidence'
  }
  if (
    code.includes('permission') ||
    code.includes('arch') ||
    code.includes('unsupported_platform') ||
    code.includes('packaged')
  ) {
    return 'packaging'
  }
  if (code.includes('self_check')) return 'self_check'
  if (code.includes('startup') || code.includes('spawn')) return 'startup'
  if (code.includes('readiness') || code.includes('endpoint')) return 'readiness'
  if (code.includes('connectivity') || code.includes('upstream') || code.includes('handshake')) {
    return 'connectivity'
  }
  if (code.includes('routing')) return 'routing'
  if (
    code.includes('stability') ||
    code.includes('lifecycle') ||
    code.includes('reload') ||
    code.includes('recovery') ||
    code.includes('stale_state')
  ) {
    return 'stability'
  }
  if (code.includes('cleanup') || code.includes('leak')) return 'cleanup'
  if (code.includes('fixture')) return 'fixture'
  return 'unknown'
}

function createScenarioCommand(input: {
  target: AmneziaHelperArtifactTarget
  scenario: AmneziaHelperPlatformValidationScenario
  reportsDir: string
  reportPath?: string
  packageManagerCommand: string
  packagedAppPath: string
  fixtureProfilePath: string
  buildId?: string
  appVersion?: string
  helperRules: string[]
  dnsEnhancedMode: string
  dnsHijack: boolean
  stabilityCycles?: number
  soakDurationMs?: number
  soakIntervalMs?: number
}): AmneziaHelperPlatformValidationRunCommand {
  const targetId = `${input.target.platform}-${input.target.arch}`
  const reportPath =
    input.reportPath ??
    createAmneziaHelperPlatformValidationReportPath({
      reportsDir: input.reportsDir,
      target: input.target,
      scenario: input.scenario
    })
  const args = [
    input.packageManagerCommand,
    'amnezia-helper:smoke',
    '--',
    '--scenario',
    'packaged',
    '--packaged-app-path',
    quoteShell(input.packagedAppPath),
    '--fixture-profile',
    quoteShell(input.fixtureProfilePath),
    '--spawn-self-check',
    '--build-id',
    quoteShell(input.buildId ?? '<release-build-id>'),
    '--app-version',
    quoteShell(input.appVersion ?? '<app-version>'),
    '--report-path',
    quoteShell(reportPath)
  ]

  if (input.scenario === 'tun_smoke') {
    args.push('--tun', '--dns-enhanced-mode', quoteShell(input.dnsEnhancedMode))
    args.push(input.dnsHijack ? '--dns-hijack' : '--no-dns-hijack')
    for (const rule of input.helperRules) {
      args.push('--helper-rule', quoteShell(rule))
    }
  }

  if (input.scenario === 'stability') {
    args.push('--stability')
    if (input.stabilityCycles !== undefined) {
      args.push('--stability-cycles', String(input.stabilityCycles))
    }
    if (input.soakDurationMs !== undefined) {
      args.push('--soak-duration-ms', String(input.soakDurationMs))
    }
    if (input.soakIntervalMs !== undefined) {
      args.push('--soak-interval-ms', String(input.soakIntervalMs))
    }
  }

  return {
    id: `${targetId}-${input.scenario}`,
    platform: input.target.platform,
    arch: input.target.arch,
    scenario: input.scenario,
    command: args.join(' '),
    reportPath,
    mustRunOnTargetOs: true,
    description:
      input.scenario === 'proxy_smoke'
        ? 'Packaged proxy-mode helper smoke with production backend.'
        : input.scenario === 'tun_smoke'
          ? 'Packaged TUN helper smoke with bypass, routing injection, and DNS/rule diagnostics.'
          : 'Packaged lifecycle/reload/recovery/soak stability verification.'
  }
}

function createTargetValidationResult(input: {
  target: AmneziaHelperArtifactTarget
  rows: AmneziaHelperCompatibilityMatrixRow[]
  requireTun: boolean
  requireStability: boolean
}): AmneziaHelperPlatformValidationTargetResult {
  const proxyRow = input.rows.find((row) => row.runtimeScenario === 'proxy')
  const tunRow = input.rows.find((row) => row.runtimeScenario === 'tun')
  const evidenceRows = [proxyRow, tunRow].filter(
    (row): row is AmneziaHelperCompatibilityMatrixRow => Boolean(row)
  )
  const issues = [
    ...evidenceRows.flatMap((row) => createIssuesFromMatrixRow(row)),
    ...createMissingEvidenceIssues(input.target, {
      proxyRow,
      tunRow,
      requireTun: input.requireTun,
      requireStability: input.requireStability
    })
  ]
  const stabilityResult = classifyStabilityResult(evidenceRows)
  const releaseReadiness = classifyTargetReadiness(evidenceRows, issues)
  const diagnosticCounts = evidenceRows.flatMap((row) =>
    row.diagnosticsSummary.map((diagnostic) => ({
      code: diagnostic.code,
      count: diagnostic.count,
      runtimeScenario: row.runtimeScenario
    }))
  )

  return {
    platform: input.target.platform,
    arch: input.target.arch,
    buildId: firstDefined(evidenceRows.map((row) => row.buildId)),
    appVersion: firstDefined(evidenceRows.map((row) => row.appVersion)),
    helperChecksumSha256: firstDefined(evidenceRows.map((row) => row.helperChecksumSha256)),
    helperVersion: firstDefined(evidenceRows.map((row) => row.helperVersion)),
    proxyScenarioResult: classifyScenarioResult(proxyRow),
    tunScenarioResult: input.requireTun ? classifyScenarioResult(tunRow) : 'skipped',
    stabilityResult,
    releaseReadiness,
    reportReferences: evidenceRows
      .map((row) => row.reportPath ?? row.reportId)
      .filter((value): value is string => Boolean(value)),
    issues: dedupeIssues(issues),
    diagnosticsSummary: diagnosticCounts
  }
}

function createIssuesFromMatrixRow(
  row: AmneziaHelperCompatibilityMatrixRow
): AmneziaHelperPlatformValidationIssue[] {
  const reportReference = row.reportPath ?? row.reportId
  const blockerIssues = row.blockers.map((code) =>
    createIssue({
      code,
      severity: 'blocker',
      row,
      reportReference
    })
  )
  const warningIssues = row.warnings.map((code) =>
    createIssue({
      code,
      severity: 'warning',
      row,
      reportReference
    })
  )

  return [...blockerIssues, ...warningIssues]
}

function createMissingEvidenceIssues(
  target: AmneziaHelperArtifactTarget,
  input: {
    proxyRow?: AmneziaHelperCompatibilityMatrixRow
    tunRow?: AmneziaHelperCompatibilityMatrixRow
    requireTun: boolean
    requireStability: boolean
  }
): AmneziaHelperPlatformValidationIssue[] {
  const issues: AmneziaHelperPlatformValidationIssue[] = []
  if (!input.proxyRow) {
    issues.push(
      createIssue({
        code: 'proxy_smoke_report_missing',
        severity: 'blocker',
        target,
        runtimeScenario: 'proxy',
        notes: 'Run packaged proxy smoke on the target OS.'
      })
    )
  }
  if (input.requireTun && !input.tunRow) {
    issues.push(
      createIssue({
        code: 'tun_smoke_report_missing',
        severity: 'blocker',
        target,
        runtimeScenario: 'tun',
        notes: 'Run packaged TUN smoke on the target OS.'
      })
    )
  }
  if (input.requireStability) {
    const stabilityRows = [input.proxyRow, input.tunRow].filter(
      (row): row is AmneziaHelperCompatibilityMatrixRow => Boolean(row?.stabilityStatus)
    )
    if (stabilityRows.length === 0) {
      issues.push(
        createIssue({
          code: 'stability_not_run',
          severity: 'blocker',
          target,
          notes: 'Run packaged smoke with --stability and include the resulting report.'
        })
      )
    }
  }
  return issues
}

function createIssue(input: {
  code: string
  severity: AmneziaHelperPlatformValidationIssueSeverity
  row?: AmneziaHelperCompatibilityMatrixRow
  target?: AmneziaHelperArtifactTarget
  scenario?: AmneziaHelperPlatformValidationScenario
  runtimeScenario?: AmneziaHelperVerificationRuntimeScenario
  reportReference?: string
  notes?: string
}): AmneziaHelperPlatformValidationIssue {
  const platform = input.row?.platform ?? input.target?.platform ?? 'unknown'
  const arch = input.row?.arch ?? input.target?.arch ?? 'unknown'
  const runtimeScenario = input.runtimeScenario ?? input.row?.runtimeScenario
  const scenario =
    input.scenario ??
    resolveIssueScenario({
      code: input.code,
      runtimeScenario
    })
  const id = [
    platform,
    arch,
    scenario ?? runtimeScenario ?? 'all',
    input.severity,
    input.code.replace(/[^a-zA-Z0-9:_-]/g, '_')
  ].join(':')

  return {
    id,
    category: categorizePlatformValidationIssue(input.code),
    severity: input.severity,
    platform,
    arch,
    scenario,
    runtimeScenario,
    code: input.code,
    reportReference: input.reportReference,
    notes: input.notes,
    reproductionHint: createIssueReproductionHint({
      code: input.code,
      severity: input.severity,
      platform,
      arch,
      scenario,
      reportReference: input.reportReference,
      notes: input.notes
    })
  }
}

function classifyScenarioResult(
  row?: AmneziaHelperCompatibilityMatrixRow
): AmneziaHelperPlatformValidationScenarioResult {
  if (!row) return 'missing'
  if (row.blockers.includes('smoke_report_missing')) return 'missing'
  if (row.blockerStatus === 'blocked') return 'failed'
  if (row.blockerStatus === 'warning') return 'warning'
  return 'passed'
}

function classifyStabilityResult(
  rows: AmneziaHelperCompatibilityMatrixRow[]
): AmneziaHelperPlatformValidationScenarioResult {
  const stabilityStatuses = rows
    .map((row) => row.stabilityStatus)
    .filter((value): value is NonNullable<AmneziaHelperCompatibilityMatrixRow['stabilityStatus']> =>
      Boolean(value)
    )
  if (stabilityStatuses.includes('failed')) return 'failed'
  if (stabilityStatuses.includes('passed')) return 'passed'
  if (stabilityStatuses.includes('skipped')) return 'skipped'
  return 'missing'
}

function classifyTargetReadiness(
  rows: AmneziaHelperCompatibilityMatrixRow[],
  issues: AmneziaHelperPlatformValidationIssue[]
): AmneziaHelperReleaseReadinessStatus {
  if (issues.some((issue) => issue.severity === 'blocker')) return 'blocked'
  if (rows.some((row) => row.blockerStatus === 'blocked')) return 'blocked'
  if (
    issues.some((issue) => issue.severity === 'warning') ||
    rows.some((row) => row.blockerStatus === 'warning')
  ) {
    return 'warning'
  }
  return 'supported'
}

function classifyPlatformValidationReadiness(
  targets: AmneziaHelperPlatformValidationTargetResult[]
): AmneziaHelperReleaseReadinessStatus {
  if (targets.some((target) => target.releaseReadiness === 'blocked')) return 'blocked'
  if (targets.some((target) => target.releaseReadiness === 'warning')) return 'warning'
  return 'supported'
}

function createPlatformValidationRunId(input: {
  runId?: string
  buildId?: string
  appVersion?: string
  generatedAt: number
}): string {
  const explicit = input.runId ?? input.buildId ?? input.appVersion
  if (explicit) return sanitizePathSegment(explicit)
  return `manual-${new Date(input.generatedAt).toISOString().replace(/[:.]/g, '-')}`
}

function sanitizePathSegment(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return sanitized || 'manual-run'
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/g, '')
}

function scenarioSuffix(scenario: AmneziaHelperPlatformValidationScenario): string {
  switch (scenario) {
    case 'proxy_smoke':
      return 'proxy'
    case 'tun_smoke':
      return 'tun'
    case 'stability':
      return 'stability'
  }
}

function getEvidenceLayoutReportPath(
  layout: AmneziaHelperPlatformValidationEvidenceLayout,
  target: AmneziaHelperArtifactTarget,
  scenario: AmneziaHelperPlatformValidationScenario
): string | undefined {
  return layout.reportPaths.find(
    (report) =>
      report.platform === target.platform &&
      report.arch === target.arch &&
      report.scenario === scenario
  )?.path
}

function resolveIssueScenario(input: {
  code: string
  runtimeScenario?: AmneziaHelperVerificationRuntimeScenario
}): AmneziaHelperPlatformValidationScenario | undefined {
  const category = categorizePlatformValidationIssue(input.code)
  if (category === 'stability' || input.code === 'stability_not_run') return 'stability'
  if (input.runtimeScenario === 'tun') return 'tun_smoke'
  if (input.runtimeScenario === 'proxy') return 'proxy_smoke'
  return undefined
}

function createIssueReproductionHint(input: {
  code: string
  severity: AmneziaHelperPlatformValidationIssueSeverity
  platform: string
  arch: string
  scenario?: AmneziaHelperPlatformValidationScenario
  reportReference?: string
  notes?: string
}): string {
  const target = `${input.platform}/${input.arch}`
  const scenario = input.scenario ? ` ${input.scenario}` : ''
  if (input.code.includes('report_missing') || input.code === 'stability_not_run') {
    return `Run the generated${scenario} command on ${target}, then attach the produced JSON report.`
  }

  const report = input.reportReference
    ? `Open ${input.reportReference}`
    : `Open the ${target}${scenario} smoke report`
  const notes = input.notes ? ` ${input.notes}` : ''
  return `${report} and inspect diagnostics for ${input.code}.${notes}`
}

function formatIssueForFiling(issue: AmneziaHelperPlatformValidationIssue): string {
  const scenario = issue.scenario ? ` ${issue.scenario}` : ''
  const report = issue.reportReference ? ` report=${issue.reportReference}` : ''
  const hint = issue.reproductionHint ? ` hint=${issue.reproductionHint}` : ''
  return `[${issue.severity}] ${issue.platform}/${issue.arch}${scenario} ${issue.category}:${issue.code}${report}${hint}`
}

function resolveSummaryTargets(
  matrix: AmneziaHelperCompatibilityMatrix
): AmneziaHelperArtifactTarget[] {
  if (matrix.requiredTargets.length > 0)
    return matrix.requiredTargets.map((target) => ({ ...target }))

  const seen = new Set<string>()
  return matrix.rows
    .map((row) => ({ platform: row.platform, arch: row.arch }))
    .filter((target): target is AmneziaHelperArtifactTarget => {
      if (!isArtifactPlatform(target.platform) || !isArtifactArch(target.arch)) return false
      const key = `${target.platform}/${target.arch}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function firstDefined<T>(values: Array<T | undefined>): T | undefined {
  return values.find((value): value is T => value !== undefined)
}

function dedupeIssues(
  issues: AmneziaHelperPlatformValidationIssue[]
): AmneziaHelperPlatformValidationIssue[] {
  const seen = new Set<string>()
  return issues.filter((issue) => {
    if (seen.has(issue.id)) return false
    seen.add(issue.id)
    return true
  })
}

function quoteShell(value: string): string {
  if (/^[a-zA-Z0-9_./:=@%+-]+$/.test(value)) return value
  return `'${value.replaceAll("'", "'\\''")}'`
}

function isArtifactPlatform(value: string): value is AmneziaHelperArtifactTarget['platform'] {
  return value === 'win32' || value === 'linux' || value === 'darwin'
}

function isArtifactArch(value: string): value is AmneziaHelperArtifactTarget['arch'] {
  return value === 'x64' || value === 'arm64'
}
