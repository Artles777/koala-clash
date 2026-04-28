import { existsSync } from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { AmneziaHelperBackendMode } from '../../core/profiles/amnezia-helper-runtime-config'
import { flattenAmneziaHelperRulePacks } from '../../core/routing/amnezia-helper-rule-packs'
import {
  evaluateAmneziaHelperTunRuleReliability,
  readAmneziaHelperTunDnsRuntimeState,
  type AmneziaHelperTunDnsRuntimeState
} from '../../core/routing/amnezia-helper-tun-rule-reliability'
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
  getLastAmneziaHelperConnectivityResult
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
import { dataDir, resourcesFilesDir } from '../utils/dirs'
import { getAmneziaHelperRulePacks } from './amneziaHelperRules'

export async function getAmneziaHelperSupportSnapshot(
  profileId?: string
): Promise<AmneziaHelperDiagnosticsBundle> {
  const backend = resolveSupportBackend()
  const helperChecksumSha256 = backend.available
    ? await checksumFileIfPresent(backend.executablePath)
    : undefined
  const [session, logs, rulePacks, lastConnectivityResult, tunDnsState, startupPreflight] =
    await Promise.all([
      getAmneziaHelperStatus(profileId),
      getAmneziaHelperLogs(profileId),
      getAmneziaHelperRulePacks(),
      getLastAmneziaHelperConnectivityResult(profileId),
      getCurrentTunDnsState(),
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
    profileId,
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
    directTunBypass,
    learnedProcessBypass,
    bypassCapabilities
  })
}

export async function exportAmneziaHelperDiagnosticsBundle(
  profileId?: string
): Promise<AmneziaHelperDiagnosticsExportResult> {
  const bundle = await getAmneziaHelperSupportSnapshot(profileId)
  return writeAmneziaHelperDiagnosticsBundle(bundle, path.join(dataDir(), 'diagnostics'))
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
