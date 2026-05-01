import {
  getRealtimePresetDefinition,
  listRealtimePresetDefinitions,
  type RealtimePresetSmokeResult,
  type RealtimePresetValidationSource,
  type RealtimePresetValidationState,
  type RealtimePresetValidationStatus,
  type RealtimeUdpConfidence
} from './realtime-reliability'

export type RealtimePresetEvidenceScope = 'local' | 'packaged'
export type RealtimePresetRuntimeScenario = 'proxy' | 'tun' | 'unknown'
export type RealtimePresetQualityStatus =
  | 'validated'
  | 'smoke_passed'
  | 'partial'
  | 'failed'
  | 'not_tested'
  | 'missing'
export type RealtimePresetQualityTone = 'success' | 'warning' | 'danger' | 'muted'
export type RealtimePresetQualityPresentationScope = RealtimePresetEvidenceScope | 'none'

export interface RealtimePresetEvidenceInput extends RealtimePresetValidationState {
  profileId?: string
}

export interface RealtimePresetObservedIpEvidenceSummary {
  count: number
  ipCount: number
  processes: string[]
}

export interface RealtimePresetEvidenceReportRow {
  presetId: string
  presetTitle: string
  profileId?: string
  profileName?: string
  platform: string
  arch?: string
  runtimeScenario: RealtimePresetRuntimeScenario
  tunEnabled: boolean
  helperMode?: string
  udpConfidence?: RealtimeUdpConfidence
  validationStatus: RealtimePresetValidationStatus
  validationSource: RealtimePresetValidationSource
  smokeResult?: RealtimePresetSmokeResult
  lastValidatedAt?: number
  validationSummary?: string
  validationExpired: boolean
  environmentChanged: boolean
  stale: boolean
  staleAfter?: number
  freshnessReasons: string[]
  observedIpEvidence: RealtimePresetObservedIpEvidenceSummary
  evidenceScope: RealtimePresetEvidenceScope
  buildId?: string
  appVersion?: string
  runId?: string
  reportPath?: string
  majorWarnings: string[]
}

export interface RealtimePresetEvidenceReport {
  schemaVersion: 1
  format: 'koala-clash.realtime-preset-evidence'
  generatedAt: number
  runId?: string
  buildId?: string
  appVersion?: string
  evidenceScope: RealtimePresetEvidenceScope
  rows: RealtimePresetEvidenceReportRow[]
}

export interface CreateRealtimePresetEvidenceReportInput {
  evidence: RealtimePresetEvidenceInput[]
  generatedAt?: number
  runId?: string
  buildId?: string
  appVersion?: string
  platform?: string
  arch?: string
  evidenceScope?: RealtimePresetEvidenceScope
  profileNamesById?: Record<string, string>
  reportPath?: string
}

export interface RealtimePresetQualityMatrixRow {
  presetId: string
  presetTitle: string
  platform: string
  runtimeScenario: RealtimePresetRuntimeScenario
  latestStatus: RealtimePresetQualityStatus
  totalEvidence: number
  packagedEvidenceCount: number
  localEvidenceCount: number
  validatedCount: number
  smokePassedCount: number
  partialCount: number
  failedCount: number
  staleCount: number
  observedIpEvidenceCount: number
  latestValidatedAt?: number
  latestBuildId?: string
  latestAppVersion?: string
  latestReportPath?: string
  majorWarnings: string[]
}

export interface RealtimePresetQualityMatrix {
  schemaVersion: 1
  format: 'koala-clash.realtime-preset-quality-matrix'
  generatedAt: number
  rows: RealtimePresetQualityMatrixRow[]
  summary: {
    totalRows: number
    packagedEvidenceRows: number
    localOnlyRows: number
    validatedRows: number
    smokePassedRows: number
    partialRows: number
    failedRows: number
    missingRows: number
    staleRows: number
    majorWarnings: string[]
  }
}

export interface AggregateRealtimePresetEvidenceReportsInput {
  reports: RealtimePresetEvidenceReport[]
  requiredPresetIds?: string[]
  requiredPlatforms?: string[]
  requiredRuntimeScenarios?: RealtimePresetRuntimeScenario[]
  generatedAt?: number
}

export interface RealtimePresetQualityScenarioPresentation {
  runtimeScenario: Exclude<RealtimePresetRuntimeScenario, 'unknown'>
  status: RealtimePresetQualityStatus
  statusLabelKey: string
  tone: RealtimePresetQualityTone
  evidenceScope: RealtimePresetQualityPresentationScope
  evidenceScopeLabelKey: string
  hasPackagedEvidence: boolean
  localOnly: boolean
  stale: boolean
  lastValidatedAt?: number
  warningCodes: string[]
}

export interface RealtimePresetQualityPresetPresentation {
  presetId: string
  presetTitle: string
  platform: string
  bestStatus: RealtimePresetQualityStatus
  bestStatusLabelKey: string
  tone: RealtimePresetQualityTone
  evidenceScope: RealtimePresetQualityPresentationScope
  evidenceScopeLabelKey: string
  freshnessLabelKey: string
  hasPackagedEvidence: boolean
  localOnly: boolean
  stale: boolean
  proxy: RealtimePresetQualityScenarioPresentation
  tun: RealtimePresetQualityScenarioPresentation
  platformRows: RealtimePresetQualityMatrixRow[]
  warningCodes: string[]
}

export function createRealtimePresetEvidenceReport(
  input: CreateRealtimePresetEvidenceReportInput
): RealtimePresetEvidenceReport {
  const generatedAt = input.generatedAt ?? Date.now()
  const evidenceScope = input.evidenceScope ?? 'local'
  const rows = input.evidence
    .filter((entry) => entry.presetId)
    .map((entry) =>
      createEvidenceReportRow(entry, {
        runId: input.runId,
        buildId: input.buildId,
        appVersion: input.appVersion,
        platform: input.platform,
        arch: input.arch,
        evidenceScope,
        profileName: entry.profileId ? input.profileNamesById?.[entry.profileId] : undefined,
        reportPath: input.reportPath
      })
    )
    .sort(compareEvidenceRows)

  return {
    schemaVersion: 1,
    format: 'koala-clash.realtime-preset-evidence',
    generatedAt,
    runId: input.runId,
    buildId: input.buildId,
    appVersion: input.appVersion,
    evidenceScope,
    rows
  }
}

export function aggregateRealtimePresetEvidenceReports(
  input: AggregateRealtimePresetEvidenceReportsInput
): RealtimePresetQualityMatrix {
  const generatedAt = input.generatedAt ?? Date.now()
  const rows = input.reports.flatMap((report) => report.rows)
  const requiredPresetIds = dedupeStrings(
    input.requiredPresetIds && input.requiredPresetIds.length > 0
      ? input.requiredPresetIds
      : rows.length > 0
        ? rows.map((row) => row.presetId)
        : listRealtimePresetDefinitions().map((preset) => preset.id)
  )
  const requiredPlatforms = dedupeStrings(
    input.requiredPlatforms && input.requiredPlatforms.length > 0
      ? input.requiredPlatforms
      : rows.map((row) => row.platform)
  )
  const requiredRuntimeScenarios = dedupeRuntimeScenarios(
    input.requiredRuntimeScenarios && input.requiredRuntimeScenarios.length > 0
      ? input.requiredRuntimeScenarios
      : rows.map((row) => row.runtimeScenario).filter((scenario) => scenario !== 'unknown')
  )
  const grouped = new Map<string, RealtimePresetEvidenceReportRow[]>()
  for (const row of rows) {
    const key = matrixKey(row.presetId, row.platform, row.runtimeScenario)
    grouped.set(key, [...(grouped.get(key) ?? []), row])
  }

  const matrixRows: RealtimePresetQualityMatrixRow[] = []
  const emitMissingRows = requiredPlatforms.length > 0 && requiredRuntimeScenarios.length > 0
  const combinations = emitMissingRows
    ? requiredPresetIds.flatMap((presetId) =>
        requiredPlatforms.flatMap((platform) =>
          requiredRuntimeScenarios.map((runtimeScenario) => ({
            presetId,
            platform,
            runtimeScenario
          }))
        )
      )
    : Array.from(grouped.keys()).map(parseMatrixKey)

  for (const combination of combinations) {
    const key = matrixKey(combination.presetId, combination.platform, combination.runtimeScenario)
    matrixRows.push(
      createMatrixRow({
        presetId: combination.presetId,
        platform: combination.platform,
        runtimeScenario: combination.runtimeScenario,
        rows: grouped.get(key) ?? []
      })
    )
  }

  matrixRows.sort(compareMatrixRows)
  return {
    schemaVersion: 1,
    format: 'koala-clash.realtime-preset-quality-matrix',
    generatedAt,
    rows: matrixRows,
    summary: createMatrixSummary(matrixRows)
  }
}

export function classifyRealtimePresetQualityStatus(
  row: Pick<RealtimePresetEvidenceReportRow, 'validationStatus' | 'stale'>
): RealtimePresetQualityStatus {
  if (row.validationStatus === 'validated' && !row.stale) return 'validated'
  if (row.validationStatus === 'smoke_passed' && !row.stale) return 'smoke_passed'
  if (row.validationStatus === 'partial' && !row.stale) return 'partial'
  if (row.validationStatus === 'failed') return 'failed'
  if (row.validationStatus === 'not_tested') return 'not_tested'
  return 'partial'
}

export function createRealtimePresetQualityPresetPresentation(
  matrix: RealtimePresetQualityMatrix | undefined,
  presetId: string,
  platform = 'unknown'
): RealtimePresetQualityPresetPresentation {
  const presetTitle = getRealtimePresetDefinition(presetId)?.title ?? presetId
  const platformRows =
    matrix?.rows.filter(
      (row) => row.presetId === presetId && (platform === 'unknown' || row.platform === platform)
    ) ?? []
  const proxy = createScenarioPresentation(platformRows, 'proxy')
  const tun = createScenarioPresentation(platformRows, 'tun')
  const scenarioPresentations = [proxy, tun]
  const bestScenario = scenarioPresentations
    .slice()
    .sort(
      (left, right) =>
        qualityStatusRank(right.status) - qualityStatusRank(left.status) ||
        Number(right.hasPackagedEvidence) - Number(left.hasPackagedEvidence) ||
        Number(!right.stale) - Number(!left.stale)
    )[0]
  const hasPackagedEvidence = scenarioPresentations.some((scenario) => scenario.hasPackagedEvidence)
  const hasAnyEvidence = scenarioPresentations.some((scenario) => scenario.evidenceScope !== 'none')
  const stale = scenarioPresentations.some((scenario) => scenario.stale)
  const presentationScope: RealtimePresetQualityPresentationScope = hasPackagedEvidence
    ? 'packaged'
    : hasAnyEvidence
      ? 'local'
      : 'none'
  const warningCodes = dedupeStrings([
    ...scenarioPresentations.flatMap((scenario) => scenario.warningCodes),
    ...(hasAnyEvidence && !hasPackagedEvidence ? ['local_evidence_only'] : []),
    ...(stale ? ['stale_evidence_present'] : []),
    ...(platformRows.length === 0 ? ['no_evidence'] : [])
  ])

  return {
    presetId,
    presetTitle,
    platform,
    bestStatus: bestScenario.status,
    bestStatusLabelKey: getRealtimePresetQualityStatusLabelKey(bestScenario.status),
    tone: getRealtimePresetQualityTone(bestScenario.status),
    evidenceScope: presentationScope,
    evidenceScopeLabelKey: getRealtimePresetQualityScopeLabelKey(presentationScope),
    freshnessLabelKey: stale
      ? 'profile.realtimeQualityFreshnessStale'
      : 'profile.realtimeQualityFreshnessFresh',
    hasPackagedEvidence,
    localOnly: hasAnyEvidence && !hasPackagedEvidence,
    stale,
    proxy,
    tun,
    platformRows,
    warningCodes
  }
}

export function createRealtimePresetQualityPlatformPresentations(
  matrix: RealtimePresetQualityMatrix | undefined,
  presetId: string
): RealtimePresetQualityPresetPresentation[] {
  const platforms = dedupeStrings(
    matrix?.rows.filter((row) => row.presetId === presetId).map((row) => row.platform) ?? []
  )
  return platforms.map((platform) =>
    createRealtimePresetQualityPresetPresentation(matrix, presetId, platform)
  )
}

export function getRealtimePresetQualityStatusLabelKey(
  status: RealtimePresetQualityStatus
): string {
  switch (status) {
    case 'validated':
      return 'profile.realtimeQualityStatusValidated'
    case 'smoke_passed':
      return 'profile.realtimeQualityStatusSmokePassed'
    case 'partial':
      return 'profile.realtimeQualityStatusPartial'
    case 'failed':
      return 'profile.realtimeQualityStatusFailed'
    case 'not_tested':
      return 'profile.realtimeQualityStatusNotTested'
    case 'missing':
      return 'profile.realtimeQualityStatusMissing'
  }
}

export function getRealtimePresetQualityScopeLabelKey(
  scope: RealtimePresetQualityPresentationScope
): string {
  switch (scope) {
    case 'packaged':
      return 'profile.realtimeQualityScopePackaged'
    case 'local':
      return 'profile.realtimeQualityScopeLocal'
    case 'none':
      return 'profile.realtimeQualityScopeNone'
  }
}

export function getRealtimePresetQualityTone(
  status: RealtimePresetQualityStatus
): RealtimePresetQualityTone {
  switch (status) {
    case 'validated':
    case 'smoke_passed':
      return 'success'
    case 'partial':
    case 'not_tested':
      return 'warning'
    case 'failed':
      return 'danger'
    case 'missing':
      return 'muted'
  }
}

function createEvidenceReportRow(
  entry: RealtimePresetEvidenceInput,
  context: {
    runId?: string
    buildId?: string
    appVersion?: string
    platform?: string
    arch?: string
    evidenceScope: RealtimePresetEvidenceScope
    profileName?: string
    reportPath?: string
  }
): RealtimePresetEvidenceReportRow {
  const platformMode = parsePlatformMode(entry.platformModeAtValidation)
  const platform = context.platform ?? platformMode.platform ?? 'unknown'
  const runtimeScenario = platformMode.runtimeScenario
  const stale = Boolean(entry.validationExpired || entry.environmentChanged)
  const observedIpEvidence = {
    count: Math.max(0, entry.observedIpEvidenceCount ?? 0),
    ipCount: dedupeStrings(entry.observedIpEvidenceIps ?? []).length,
    processes: dedupeStrings(entry.observedIpEvidenceProcesses ?? [])
  }
  const row: RealtimePresetEvidenceReportRow = {
    presetId: entry.presetId,
    presetTitle: getRealtimePresetDefinition(entry.presetId)?.title ?? entry.presetId,
    profileId: entry.profileId,
    profileName: context.profileName,
    platform,
    arch: context.arch,
    runtimeScenario,
    tunEnabled: runtimeScenario === 'tun',
    helperMode: entry.helperModeAtValidation,
    udpConfidence: entry.udpConfidenceAtValidation,
    validationStatus: entry.validationStatus,
    validationSource: entry.validationSource,
    smokeResult: entry.smokeResult,
    lastValidatedAt: entry.lastValidatedAt ?? entry.validatedAt,
    validationSummary: entry.validationSummary,
    validationExpired: entry.validationExpired === true,
    environmentChanged: entry.environmentChanged === true,
    stale,
    staleAfter: entry.staleAfter,
    freshnessReasons: dedupeStrings(entry.freshnessReasons ?? []),
    observedIpEvidence,
    evidenceScope: context.evidenceScope,
    buildId: context.buildId,
    appVersion: context.appVersion,
    runId: context.runId,
    reportPath: context.reportPath,
    majorWarnings: []
  }
  return {
    ...row,
    majorWarnings: collectEvidenceWarnings(row)
  }
}

function createMatrixRow(input: {
  presetId: string
  platform: string
  runtimeScenario: RealtimePresetRuntimeScenario
  rows: RealtimePresetEvidenceReportRow[]
}): RealtimePresetQualityMatrixRow {
  const rows = input.rows.slice().sort(compareLatestEvidence)
  const latest = rows[0]
  if (!latest) {
    return {
      presetId: input.presetId,
      presetTitle: getRealtimePresetDefinition(input.presetId)?.title ?? input.presetId,
      platform: input.platform,
      runtimeScenario: input.runtimeScenario,
      latestStatus: 'missing',
      totalEvidence: 0,
      packagedEvidenceCount: 0,
      localEvidenceCount: 0,
      validatedCount: 0,
      smokePassedCount: 0,
      partialCount: 0,
      failedCount: 0,
      staleCount: 0,
      observedIpEvidenceCount: 0,
      majorWarnings: ['no_evidence']
    }
  }

  const packagedEvidenceCount = rows.filter((row) => row.evidenceScope === 'packaged').length
  const staleCount = rows.filter((row) => row.stale).length
  const majorWarnings = dedupeStrings([
    ...rows.flatMap((row) => row.majorWarnings),
    ...(packagedEvidenceCount === 0 ? ['local_evidence_only'] : []),
    ...(staleCount > 0 ? ['stale_evidence_present'] : [])
  ])

  return {
    presetId: input.presetId,
    presetTitle: latest.presetTitle,
    platform: input.platform,
    runtimeScenario: input.runtimeScenario,
    latestStatus: classifyRealtimePresetQualityStatus(latest),
    totalEvidence: rows.length,
    packagedEvidenceCount,
    localEvidenceCount: rows.length - packagedEvidenceCount,
    validatedCount: rows.filter((row) => row.validationStatus === 'validated' && !row.stale).length,
    smokePassedCount: rows.filter((row) => row.validationStatus === 'smoke_passed' && !row.stale)
      .length,
    partialCount: rows.filter((row) => row.validationStatus === 'partial' || row.stale).length,
    failedCount: rows.filter((row) => row.validationStatus === 'failed').length,
    staleCount,
    observedIpEvidenceCount: rows.reduce((sum, row) => sum + row.observedIpEvidence.count, 0),
    latestValidatedAt: latest.lastValidatedAt,
    latestBuildId: latest.buildId,
    latestAppVersion: latest.appVersion,
    latestReportPath: latest.reportPath,
    majorWarnings
  }
}

function createMatrixSummary(
  rows: RealtimePresetQualityMatrixRow[]
): RealtimePresetQualityMatrix['summary'] {
  return {
    totalRows: rows.length,
    packagedEvidenceRows: rows.filter((row) => row.packagedEvidenceCount > 0).length,
    localOnlyRows: rows.filter((row) => row.totalEvidence > 0 && row.packagedEvidenceCount === 0)
      .length,
    validatedRows: rows.filter((row) => row.latestStatus === 'validated').length,
    smokePassedRows: rows.filter((row) => row.latestStatus === 'smoke_passed').length,
    partialRows: rows.filter((row) => row.latestStatus === 'partial').length,
    failedRows: rows.filter((row) => row.latestStatus === 'failed').length,
    missingRows: rows.filter((row) => row.latestStatus === 'missing').length,
    staleRows: rows.filter((row) => row.staleCount > 0).length,
    majorWarnings: dedupeStrings(rows.flatMap((row) => row.majorWarnings))
  }
}

function createScenarioPresentation(
  rows: RealtimePresetQualityMatrixRow[],
  runtimeScenario: Exclude<RealtimePresetRuntimeScenario, 'unknown'>
): RealtimePresetQualityScenarioPresentation {
  const row = rows.find((candidate) => candidate.runtimeScenario === runtimeScenario)
  const status = row?.latestStatus ?? 'missing'
  const hasPackagedEvidence = (row?.packagedEvidenceCount ?? 0) > 0
  const hasLocalEvidence = (row?.localEvidenceCount ?? 0) > 0
  const stale = (row?.staleCount ?? 0) > 0
  const presentationScope: RealtimePresetQualityPresentationScope = hasPackagedEvidence
    ? 'packaged'
    : hasLocalEvidence
      ? 'local'
      : 'none'

  return {
    runtimeScenario,
    status,
    statusLabelKey: getRealtimePresetQualityStatusLabelKey(status),
    tone: getRealtimePresetQualityTone(status),
    evidenceScope: presentationScope,
    evidenceScopeLabelKey: getRealtimePresetQualityScopeLabelKey(presentationScope),
    hasPackagedEvidence,
    localOnly: hasLocalEvidence && !hasPackagedEvidence,
    stale,
    lastValidatedAt: row?.latestValidatedAt,
    warningCodes: row?.majorWarnings ?? ['no_evidence']
  }
}

function qualityStatusRank(status: RealtimePresetQualityStatus): number {
  switch (status) {
    case 'validated':
      return 5
    case 'smoke_passed':
      return 4
    case 'partial':
      return 3
    case 'not_tested':
      return 2
    case 'failed':
      return 1
    case 'missing':
      return 0
  }
}

function collectEvidenceWarnings(row: RealtimePresetEvidenceReportRow): string[] {
  const platformWarning = platformFallbackWarning(row.platform)
  return dedupeStrings([
    ...(row.stale ? ['evidence_stale'] : []),
    ...(row.validationExpired ? ['validation_expired'] : []),
    ...(row.environmentChanged ? ['environment_changed'] : []),
    ...(row.validationStatus === 'failed' ? ['validation_failed'] : []),
    ...(row.validationStatus === 'not_tested' ? ['preset_not_tested'] : []),
    ...(row.validationStatus === 'partial' ? ['preset_partially_validated'] : []),
    ...(row.evidenceScope === 'local' ? ['local_evidence_only'] : []),
    ...(row.smokeResult === 'partial' ? ['smoke_partial'] : []),
    ...(row.smokeResult === 'failed' ? ['smoke_failed'] : []),
    ...(row.observedIpEvidence.count === 0 ? ['no_observed_ip_evidence'] : []),
    ...(platformWarning ? [platformWarning] : [])
  ])
}

function platformFallbackWarning(platform: string): string | undefined {
  if (platform === 'darwin') return 'macos_fallback_heavy'
  if (platform === 'win32') return 'windows_native_bypass_requires_service'
  return undefined
}

function parsePlatformMode(value?: string): {
  platform?: string
  runtimeScenario: RealtimePresetRuntimeScenario
} {
  if (!value) return { runtimeScenario: 'unknown' }
  const parts = value.split(':')
  const platform = parts[0] || undefined
  const mode = parts[1]
  if (mode === 'tun' || mode === 'proxy') {
    return { platform, runtimeScenario: mode }
  }
  return { platform, runtimeScenario: 'unknown' }
}

function compareLatestEvidence(
  left: RealtimePresetEvidenceReportRow,
  right: RealtimePresetEvidenceReportRow
): number {
  const timeDiff = (right.lastValidatedAt ?? 0) - (left.lastValidatedAt ?? 0)
  if (timeDiff !== 0) return timeDiff
  if (left.evidenceScope !== right.evidenceScope) {
    return left.evidenceScope === 'packaged' ? -1 : 1
  }
  return compareEvidenceRows(left, right)
}

function compareEvidenceRows(
  left: RealtimePresetEvidenceReportRow,
  right: RealtimePresetEvidenceReportRow
): number {
  return `${left.presetId}:${left.platform}:${left.runtimeScenario}:${left.profileId ?? ''}`.localeCompare(
    `${right.presetId}:${right.platform}:${right.runtimeScenario}:${right.profileId ?? ''}`
  )
}

function compareMatrixRows(
  left: RealtimePresetQualityMatrixRow,
  right: RealtimePresetQualityMatrixRow
): number {
  return `${left.presetId}:${left.platform}:${left.runtimeScenario}`.localeCompare(
    `${right.presetId}:${right.platform}:${right.runtimeScenario}`
  )
}

function matrixKey(
  presetId: string,
  platform: string,
  runtimeScenario: RealtimePresetRuntimeScenario
): string {
  return `${presetId}\u0000${platform}\u0000${runtimeScenario}`
}

function parseMatrixKey(key: string): {
  presetId: string
  platform: string
  runtimeScenario: RealtimePresetRuntimeScenario
} {
  const parts = key.split('\u0000')
  return {
    presetId: parts[0] ?? '',
    platform: parts[1] ?? 'unknown',
    runtimeScenario: normalizeRuntimeScenario(parts[2])
  }
}

function normalizeRuntimeScenario(value?: string): RealtimePresetRuntimeScenario {
  if (value === 'proxy' || value === 'tun') return value
  return 'unknown'
}

function dedupeRuntimeScenarios(
  values: RealtimePresetRuntimeScenario[]
): RealtimePresetRuntimeScenario[] {
  return Array.from(new Set(values.length > 0 ? values : ['proxy', 'tun']))
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0))).sort((a, b) =>
    a.localeCompare(b)
  )
}
