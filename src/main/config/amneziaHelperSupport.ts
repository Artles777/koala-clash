import { existsSync } from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { AmneziaHelperBackendMode } from '../../core/profiles/amnezia-helper-runtime-config'
import { flattenAmneziaHelperRulePacks } from '../../core/routing/amnezia-helper-rule-packs'
import {
  DISCORD_REALTIME_PRESET_ID,
  applyRealtimePresetValidationFreshness,
  createRealtimePresetManualConfirmation,
  getRealtimePresetDefinition,
  parseRealtimeRuleString,
  runRealtimePresetSmoke as createRealtimePresetSmokeEvidence,
  runRealtimePresetValidationCheck
} from '../../core/routing/realtime-reliability'
import {
  aggregateRealtimePresetEvidenceReports,
  createRealtimePresetEvidenceReport
} from '../../core/routing/realtime-preset-quality'
import {
  evaluateAmneziaHelperTunRuleReliability,
  readAmneziaHelperTunDnsRuntimeState,
  type AmneziaHelperTunDnsRuntimeState
} from '../../core/routing/amnezia-helper-tun-rule-reliability'
import {
  getRealtimePresetValidationEvidence,
  readRealtimePresetValidationStore,
  upsertRealtimePresetValidationEvidence,
  writeRealtimePresetValidationStore,
  type RealtimePresetValidationEvidence
} from '../../features/realtime-preset-validation/store'
import {
  resolveHelperBackend,
  ResolvedAmneziaHelperBackend
} from '../runtime/amnezia-helper-backend-provider'
import {
  checksumFileIfPresent,
  createAmneziaHelperBackendSupportSnapshot,
  createAmneziaHelperDiagnosticsBundle,
  createTunSupportSnapshot,
  AmneziaHelperDiagnosticsBundle,
  AmneziaHelperDiagnosticsExportResult,
  writeAmneziaHelperDiagnosticsBundle
} from '../runtime/amnezia-helper-support'
import {
  getAmneziaHelperLogs,
  getAmneziaHelperStartupPreflight,
  getAmneziaHelperStatus,
  getLastAmneziaHelperConnectivityResult,
  validateAmneziaHelperConnectivity
} from '../runtime/amnezia-helper-manager'
import {
  getActiveAmneziaHelperRoutingTarget,
  getLastAmneziaHelperRoutingTarget
} from '../runtime/amnezia-helper-routing-state'
import {
  getActiveAmneziaHelperTunBypass,
  getLastAmneziaHelperTunBypass
} from '../runtime/amnezia-helper-tun-bypass-state'
import { getLastDirectTunBypass } from '../runtime/direct-tun-bypass-state'
import { getLastLearnedProcessBypass } from '../runtime/learned-process-bypass-state'
import { getLastBypassCapabilityReport } from '../runtime/bypass-capability-state'
import { dataDir, realtimePresetValidationPath, resourcesFilesDir } from '../utils/dirs'
import { getAmneziaHelperRulePacks } from './amneziaHelperRules'

export async function getAmneziaHelperSupportSnapshot(
  profileId?: string
): Promise<AmneziaHelperDiagnosticsBundle> {
  const backend = resolveSupportBackend()
  const helperChecksumSha256 = backend.available
    ? await checksumFileIfPresent(backend.executablePath)
    : undefined
  const [
    session,
    logs,
    rulePacks,
    lastConnectivityResult,
    tunDnsState,
    runtimeRules,
    startupPreflight
  ] = await Promise.all([
    getAmneziaHelperStatus(profileId),
    getAmneziaHelperLogs(profileId),
    getAmneziaHelperRulePacks(),
    getLastAmneziaHelperConnectivityResult(profileId),
    getCurrentTunDnsState(),
    getCurrentRuntimeRules(),
    profileId ? getAmneziaHelperStartupPreflight(profileId).catch(() => undefined) : undefined
  ])
  const routingTarget =
    session.routingTarget ??
    getLastAmneziaHelperRoutingTarget() ??
    getActiveAmneziaHelperRoutingTarget()
  const activeTunBypass = getActiveAmneziaHelperTunBypass()
  const tunBypass = session.tunBypass ?? getLastAmneziaHelperTunBypass() ?? activeTunBypass
  const directTunBypass = getLastDirectTunBypass()
  const learnedProcessBypass = getLastLearnedProcessBypass()
  const bypassCapabilities = getLastBypassCapabilityReport()
  const effectiveProfileId = profileId ?? session.profileId
  const validationStore = await readRealtimePresetValidationStore(realtimePresetValidationPath())
  const realtimeEvidenceEntries = validationStore.entries.map((entry) => ({
    ...applyRealtimePresetValidationFreshness({
      validation: entry,
      environment: {
        profileId: entry.profileId,
        platform: process.platform,
        tunEnabled: tunDnsState.tunEnabled,
        helperMode: session.backendMode,
        udpConfidence: session.udpCapability.udpValidated ? 'proxy_validated' : 'unknown'
      }
    }),
    profileId: entry.profileId
  }))
  const realtimePresetValidation = effectiveProfileId
    ? getRealtimePresetValidationEvidence(
        { schemaVersion: 1, entries: realtimeEvidenceEntries },
        effectiveProfileId,
        DISCORD_REALTIME_PRESET_ID
      )
    : undefined
  const realtimePresetEvidence = createRealtimePresetEvidenceReport({
    evidence: realtimeEvidenceEntries,
    appVersion: app.getVersion(),
    buildId: process.env.KOALA_BUILD_ID,
    platform: process.platform,
    arch: process.arch,
    evidenceScope: 'local'
  })
  const realtimePresetQuality = aggregateRealtimePresetEvidenceReports({
    reports: [realtimePresetEvidence]
  })
  const ruleReliability = evaluateAmneziaHelperTunRuleReliability({
    ...tunDnsState,
    rules: flattenAmneziaHelperRulePacks(rulePacks, { enabledPacksOnly: true })
  })
  const tun = createTunSupportSnapshot(
    tunDnsState.tunEnabled,
    tunBypass,
    activeTunBypass,
    ruleReliability,
    directTunBypass,
    learnedProcessBypass,
    bypassCapabilities
  )

  return createAmneziaHelperDiagnosticsBundle({
    appVersion: app.getVersion(),
    buildId: process.env.KOALA_BUILD_ID,
    profileId: effectiveProfileId,
    backend: createAmneziaHelperBackendSupportSnapshot({
      backend,
      helperChecksumSha256
    }),
    startupPreflight,
    session,
    logs,
    rulePacks,
    routingTarget,
    lastConnectivityResult,
    tun,
    runtimeRules,
    realtimePresetValidation,
    realtimePresetEvidence,
    realtimePresetQuality,
    directTunBypass,
    learnedProcessBypass,
    bypassCapabilities,
    helperMode: session.backendMode
  })
}

export async function runRealtimePresetValidation(
  profileId: string,
  presetId = DISCORD_REALTIME_PRESET_ID
): Promise<RealtimePresetValidationEvidence> {
  const session = await getAmneziaHelperStatus(profileId)
  const tunDnsState = await getCurrentTunDnsState()
  const routingTarget =
    session.routingTarget ??
    getLastAmneziaHelperRoutingTarget() ??
    getActiveAmneziaHelperRoutingTarget()
  const runtimeRules = (await getCurrentRuntimeRules())
    .map(parseRealtimeRuleString)
    .filter((rule): rule is NonNullable<typeof rule> => Boolean(rule))
  let connectivityProbeAttempted = false
  let connectivityResult = await getLastAmneziaHelperConnectivityResult(profileId)

  if (session.status === 'running' && session.readiness === 'ready') {
    connectivityProbeAttempted = true
    try {
      connectivityResult = await validateAmneziaHelperConnectivity(profileId)
    } catch {
      connectivityResult = await getLastAmneziaHelperConnectivityResult(profileId)
    }
  }

  const evidence = {
    ...runRealtimePresetValidationCheck({
      presetId,
      rules: runtimeRules,
      udp: {
        ...session.udpCapability,
        runtimeAdvertisesUdp:
          session.udpCapability.udpSupport === 'supported' && session.udpCapability.udpValidated
      },
      platform: process.platform,
      tunEnabled: tunDnsState.tunEnabled,
      profileId,
      helperReady: session.status === 'running' && session.readiness === 'ready',
      proxyInjected: routingTarget?.status === 'injected',
      connectivityVerified: connectivityResult?.status === 'verified',
      connectivityProbeAttempted,
      helperMode: session.backendMode,
      platformMode: `${process.platform}:${tunDnsState.tunEnabled ? 'tun' : 'proxy'}`
    }),
    profileId
  }
  await persistRealtimePresetValidation(evidence)
  return evidence
}

export async function runRealtimePresetSmoke(
  profileId: string,
  presetId = DISCORD_REALTIME_PRESET_ID
): Promise<RealtimePresetValidationEvidence> {
  const session = await getAmneziaHelperStatus(profileId)
  const tunDnsState = await getCurrentTunDnsState()
  const routingTarget =
    session.routingTarget ??
    getLastAmneziaHelperRoutingTarget() ??
    getActiveAmneziaHelperRoutingTarget()
  const runtimeRules = (await getCurrentRuntimeRules())
    .map(parseRealtimeRuleString)
    .filter((rule): rule is NonNullable<typeof rule> => Boolean(rule))
  let connectivityProbeAttempted = false
  let connectivityResult = await getLastAmneziaHelperConnectivityResult(profileId)

  if (session.status === 'running' && session.readiness === 'ready') {
    connectivityProbeAttempted = true
    try {
      connectivityResult = await validateAmneziaHelperConnectivity(profileId)
    } catch {
      connectivityResult = await getLastAmneziaHelperConnectivityResult(profileId)
    }
  }

  const observedIpEvidence = getPresetObservedIpEvidence(presetId)
  const evidence = {
    ...createRealtimePresetSmokeEvidence({
      presetId,
      profileId,
      rules: runtimeRules,
      udp: {
        ...session.udpCapability,
        runtimeAdvertisesUdp:
          session.udpCapability.udpSupport === 'supported' && session.udpCapability.udpValidated
      },
      platform: process.platform,
      tunEnabled: tunDnsState.tunEnabled,
      helperReady: session.status === 'running' && session.readiness === 'ready',
      proxyInjected: routingTarget?.status === 'injected',
      connectivityVerified: connectivityResult?.status === 'verified',
      connectivityProbeAttempted,
      helperMode: session.backendMode,
      platformMode: `${process.platform}:${tunDnsState.tunEnabled ? 'tun' : 'proxy'}`,
      observedIpEvidenceCount: observedIpEvidence.count,
      observedIpEvidenceProcesses: observedIpEvidence.processes,
      observedIpEvidenceIps: observedIpEvidence.ips
    }),
    profileId
  }
  await persistRealtimePresetValidation(evidence)
  return evidence
}

export async function confirmRealtimePresetValidation(
  profileId: string,
  note?: string,
  presetId = DISCORD_REALTIME_PRESET_ID
): Promise<RealtimePresetValidationEvidence> {
  const [session, tunDnsState] = await Promise.all([
    getAmneziaHelperStatus(profileId),
    getCurrentTunDnsState()
  ])
  const evidence = {
    ...createRealtimePresetManualConfirmation({
      presetId,
      profileId,
      note,
      helperMode: session.backendMode,
      udpConfidence: session.udpCapability.udpValidated ? 'proxy_validated' : 'unknown',
      platform: process.platform,
      tunEnabled: tunDnsState.tunEnabled,
      platformMode: `${process.platform}:${tunDnsState.tunEnabled ? 'tun' : 'proxy'}`
    }),
    profileId
  }
  await persistRealtimePresetValidation(evidence)
  return evidence
}

export async function exportAmneziaHelperDiagnosticsBundle(
  profileId?: string
): Promise<AmneziaHelperDiagnosticsExportResult> {
  const bundle = await getAmneziaHelperSupportSnapshot(profileId)
  return writeAmneziaHelperDiagnosticsBundle(bundle, path.join(dataDir(), 'diagnostics'))
}

async function persistRealtimePresetValidation(
  evidence: RealtimePresetValidationEvidence
): Promise<void> {
  const filePath = realtimePresetValidationPath()
  const store = await readRealtimePresetValidationStore(filePath)
  await writeRealtimePresetValidationStore(
    filePath,
    upsertRealtimePresetValidationEvidence(store, evidence)
  )
}

function getPresetObservedIpEvidence(presetId: string): {
  count: number
  processes: string[]
  ips: string[]
} {
  const resolution = getLastLearnedProcessBypass()
  if (!resolution) return { count: 0, processes: [], ips: [] }
  const definition = getRealtimePresetDefinition(presetId)
  if (!definition) return { count: 0, processes: [], ips: [] }
  const presetProcessNames = new Set(
    definition.processNames.map((processName) => processName.toLowerCase())
  )
  const entries = resolution.entries.filter(
    (entry) => entry.active && presetProcessNames.has(entry.processName.toLowerCase())
  )
  const processes = [...new Set(entries.map((entry) => entry.processName))].sort((a, b) =>
    a.localeCompare(b)
  )
  const ips = [...new Set(entries.map((entry) => entry.observedIp))].sort((a, b) =>
    a.localeCompare(b)
  )
  return {
    count: entries.length,
    processes,
    ips
  }
}

function resolveSupportBackend(): ResolvedAmneziaHelperBackend {
  const filesDir = resourcesFilesDir()
  return resolveHelperBackend({
    mode: getConfiguredBackendMode(),
    command: process.execPath,
    proxyBackendPath: resolveBackendScriptPath(filesDir, 'amnezia-helper-proxy-backend.cjs'),
    helperStubPath: resolveBackendScriptPath(filesDir, 'amnezia-helper-stub.cjs'),
    productionBackendPath: process.env.KOALA_AMNEZIA_HELPER_BACKEND_PATH,
    resourcesFilesDir: filesDir
  })
}

function getConfiguredBackendMode(): AmneziaHelperBackendMode {
  const value = process.env.KOALA_AMNEZIA_HELPER_BACKEND_MODE
  if (value === 'production' || value === 'stub' || value === 'proxy-prototype') return value
  if (process.env.KOALA_AMNEZIA_HELPER_BACKEND_PATH) return 'production'
  return 'production'
}

function resolveBackendScriptPath(resourcesDir: string, filename: string): string {
  const resourcePath = path.join(resourcesDir, filename)
  const candidates = [
    resourcePath,
    path.join(process.cwd(), 'src', 'main', 'runtime', filename),
    path.join(__dirname, filename)
  ]

  return candidates.find((candidate) => existsSync(candidate)) ?? resourcePath
}

async function getCurrentTunDnsState(): Promise<AmneziaHelperTunDnsRuntimeState> {
  try {
    const { getRuntimeConfig } = await import('../core/factory')
    const runtimeConfig = await getRuntimeConfig()
    if (runtimeConfig?.tun || runtimeConfig?.dns) {
      return readAmneziaHelperTunDnsRuntimeState(runtimeConfig)
    }
  } catch {
    // Fall back to the persisted controlled Mihomo config when runtime config is unavailable.
  }

  const { getControledMihomoConfig } = await import('./controledMihomo')
  const config = await getControledMihomoConfig()
  return readAmneziaHelperTunDnsRuntimeState(config)
}

async function getCurrentRuntimeRules(): Promise<string[]> {
  try {
    const { getRuntimeConfig } = await import('../core/factory')
    const runtimeConfig = await getRuntimeConfig()
    const rules = (runtimeConfig as { rules?: unknown }).rules
    if (Array.isArray(rules)) {
      return rules.filter((rule): rule is string => typeof rule === 'string')
    }
  } catch {
    // Runtime config is unavailable before the first core generation.
  }

  return []
}
