import { existsSync } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import * as path from 'path'
import type {
  RealtimePresetValidationSource,
  RealtimePresetValidationState,
  RealtimePresetValidationStatus
} from '../../core/routing/realtime-reliability'

export interface RealtimePresetValidationEvidence extends RealtimePresetValidationState {
  profileId: string
}

export interface RealtimePresetValidationStore {
  schemaVersion: 1
  entries: RealtimePresetValidationEvidence[]
}

const emptyStore: RealtimePresetValidationStore = {
  schemaVersion: 1,
  entries: []
}

export async function readRealtimePresetValidationStore(
  filePath: string
): Promise<RealtimePresetValidationStore> {
  if (!existsSync(filePath)) return { ...emptyStore, entries: [] }

  const content = await readFile(filePath, 'utf8')
  const parsed = JSON.parse(content) as Partial<RealtimePresetValidationStore>
  return normalizeRealtimePresetValidationStore(parsed)
}

export async function writeRealtimePresetValidationStore(
  filePath: string,
  store: RealtimePresetValidationStore
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(
    filePath,
    `${JSON.stringify(normalizeRealtimePresetValidationStore(store), null, 2)}\n`
  )
}

export function getRealtimePresetValidationEvidence(
  store: RealtimePresetValidationStore,
  profileId: string,
  presetId: string
): RealtimePresetValidationEvidence | undefined {
  return store.entries.find((entry) => entry.profileId === profileId && entry.presetId === presetId)
}

export function upsertRealtimePresetValidationEvidence(
  store: RealtimePresetValidationStore,
  evidence: RealtimePresetValidationEvidence
): RealtimePresetValidationStore {
  const entries = store.entries.filter(
    (entry) => entry.profileId !== evidence.profileId || entry.presetId !== evidence.presetId
  )
  entries.push(normalizeEvidence(evidence))
  entries.sort((a, b) =>
    `${a.profileId}:${a.presetId}`.localeCompare(`${b.profileId}:${b.presetId}`)
  )
  return {
    schemaVersion: 1,
    entries
  }
}

function normalizeRealtimePresetValidationStore(
  store: Partial<RealtimePresetValidationStore>
): RealtimePresetValidationStore {
  return {
    schemaVersion: 1,
    entries: Array.isArray(store.entries) ? store.entries.map(normalizeEvidence) : []
  }
}

function normalizeEvidence(
  evidence: Partial<RealtimePresetValidationEvidence>
): RealtimePresetValidationEvidence {
  const profileId = typeof evidence.profileId === 'string' ? evidence.profileId : ''
  const presetId = typeof evidence.presetId === 'string' ? evidence.presetId : ''
  const validationStatus = normalizeValidationStatus(evidence.validationStatus)
  const validationSource = normalizeValidationSource(evidence.validationSource)
  return {
    profileId,
    presetId,
    validationStatus,
    validatedAt: normalizeNumber(evidence.validatedAt),
    lastValidatedAt: normalizeNumber(evidence.lastValidatedAt ?? evidence.validatedAt),
    validationSource,
    validationSummary:
      typeof evidence.validationSummary === 'string' ? evidence.validationSummary : undefined,
    helperModeAtValidation:
      typeof evidence.helperModeAtValidation === 'string'
        ? evidence.helperModeAtValidation
        : undefined,
    udpConfidenceAtValidation: evidence.udpConfidenceAtValidation,
    platformModeAtValidation:
      typeof evidence.platformModeAtValidation === 'string'
        ? evidence.platformModeAtValidation
        : undefined,
    smokeResult: evidence.smokeResult,
    observedIpEvidenceCount: normalizeNumber(evidence.observedIpEvidenceCount),
    observedIpEvidenceProcesses: Array.isArray(evidence.observedIpEvidenceProcesses)
      ? evidence.observedIpEvidenceProcesses.filter(
          (processName): processName is string => typeof processName === 'string'
        )
      : undefined,
    observedIpEvidenceIps: Array.isArray(evidence.observedIpEvidenceIps)
      ? evidence.observedIpEvidenceIps.filter((ip): ip is string => typeof ip === 'string')
      : undefined,
    validationExpired:
      typeof evidence.validationExpired === 'boolean' ? evidence.validationExpired : undefined,
    staleAfter: normalizeNumber(evidence.staleAfter),
    environmentChanged:
      typeof evidence.environmentChanged === 'boolean' ? evidence.environmentChanged : undefined,
    lastEnvironmentFingerprint:
      typeof evidence.lastEnvironmentFingerprint === 'string'
        ? evidence.lastEnvironmentFingerprint
        : undefined,
    currentEnvironmentFingerprint:
      typeof evidence.currentEnvironmentFingerprint === 'string'
        ? evidence.currentEnvironmentFingerprint
        : undefined,
    freshnessReasons: Array.isArray(evidence.freshnessReasons)
      ? evidence.freshnessReasons.filter((reason): reason is string => typeof reason === 'string')
      : undefined,
    validationNotes: Array.isArray(evidence.validationNotes)
      ? evidence.validationNotes.filter((note): note is string => typeof note === 'string')
      : [],
    validationChecks: Array.isArray(evidence.validationChecks)
      ? evidence.validationChecks
          .filter((check) => typeof check.code === 'string' && typeof check.status === 'string')
          .map((check) => ({
            code: check.code,
            status: check.status,
            message: typeof check.message === 'string' ? check.message : ''
          }))
      : undefined
  }
}

function normalizeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizeValidationStatus(value: unknown): RealtimePresetValidationStatus {
  if (
    value === 'not_tested' ||
    value === 'partial' ||
    value === 'smoke_passed' ||
    value === 'validated' ||
    value === 'failed'
  ) {
    return value
  }
  return 'not_tested'
}

function normalizeValidationSource(value: unknown): RealtimePresetValidationSource {
  if (
    value === 'rule_analysis' ||
    value === 'runtime_state' ||
    value === 'connectivity_probe' ||
    value === 'preset_smoke' ||
    value === 'manual_confirmation' ||
    value === 'runtime_analysis' ||
    value === 'helper_connectivity' ||
    value === 'manual_smoke'
  ) {
    return value
  }
  return 'unknown'
}
