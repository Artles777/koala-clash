import {
  AmneziaProductionBackendConfigError,
  AmneziaProductionBackendConfigIssueCode
} from '../../core/profiles/amnezia-helper-production-config'
import {
  AmneziaHelperLocalEndpoint,
  AmneziaHelperRuntimeConfig
} from '../../core/profiles/amnezia-helper-runtime-config'
import { DesktopRuntimeExecutionPlan } from '../../core/profiles/desktop-runtime-adapter'
import { AmneziaHelperTunBypassResolution } from '../../core/routing/amnezia-helper-tun-bypass'
import {
  AmneziaHelperExecutableValidationIssue,
  generateBackendConfig,
  ResolvedAmneziaHelperBackend
} from './amnezia-helper-backend-provider'
import { AmneziaHelperDiagnosticCategory } from './amnezia-helper-connectivity'

export type AmneziaHelperStartupPreflightStatus = 'ok' | 'warning' | 'blocked' | 'unknown'
export type AmneziaHelperStartupPreflightTunBypassStatus =
  | 'not_required'
  | 'resolved'
  | 'failed'
  | 'unknown'

export type AmneziaHelperStartupPreflightReasonCode =
  | 'helper_binary_missing'
  | 'helper_binary_not_executable'
  | 'helper_binary_permission_denied'
  | 'unsupported_platform'
  | 'unsupported_arch'
  | 'helper_binary_platform_mismatch'
  | 'helper_binary_arch_mismatch'
  | 'backend_unavailable'
  | 'missing_execution_plan'
  | 'missing_helper_descriptor'
  | 'unsupported_execution_plan'
  | 'runtime_config_generation_failed'
  | 'production_config_generation_failed'
  | 'unsupported_profile_protocol'
  | 'missing_endpoint'
  | 'missing_keys'
  | 'missing_allowed_ips'
  | 'missing_interface_address'
  | 'invalid_local_proxy'
  | 'tun_bypass_resolution_failure'

export interface AmneziaHelperStartupPreflightReason {
  code: AmneziaHelperStartupPreflightReasonCode
  stage: string
  message: string
  details?: Record<string, string | number | boolean>
}

export interface AmneziaHelperStartupPreflightResult {
  profileId: string
  checkedAt: number
  canStart: boolean
  backendStatus: AmneziaHelperStartupPreflightStatus
  profileStatus: AmneziaHelperStartupPreflightStatus
  endpointStatus: AmneziaHelperStartupPreflightStatus
  configStatus: AmneziaHelperStartupPreflightStatus
  tunBypassStatus: AmneziaHelperStartupPreflightTunBypassStatus
  blockingReasons: AmneziaHelperStartupPreflightReason[]
  warnings: AmneziaHelperStartupPreflightReason[]
  backend: {
    mode: ResolvedAmneziaHelperBackend['mode']
    kind: ResolvedAmneziaHelperBackend['kind']
    available: boolean
    command: string
    executablePath: string
  }
  localEndpoint?: AmneziaHelperLocalEndpoint
  tunBypass?: AmneziaHelperTunBypassResolution
}

export interface CreateAmneziaHelperStartupPreflightInput {
  profileId: string
  plan?: DesktopRuntimeExecutionPlan
  planLoadError?: unknown
  backend: ResolvedAmneziaHelperBackend
  prepareRuntimeConfig?: (
    config: AmneziaHelperRuntimeConfig,
    backendMode: ResolvedAmneziaHelperBackend['mode']
  ) => Promise<AmneziaHelperRuntimeConfig> | AmneziaHelperRuntimeConfig
  tunEnabled?: boolean
  resolveTunBypass?: (input: {
    runtimeConfig: AmneziaHelperRuntimeConfig
    tunEnabled: boolean
  }) => Promise<AmneziaHelperTunBypassResolution> | AmneziaHelperTunBypassResolution
  now?: () => number
}

export async function createAmneziaHelperStartupPreflight(
  input: CreateAmneziaHelperStartupPreflightInput
): Promise<AmneziaHelperStartupPreflightResult> {
  const now = input.now ?? Date.now
  const blockingReasons: AmneziaHelperStartupPreflightReason[] = []
  const warnings: AmneziaHelperStartupPreflightReason[] = []
  let profileStatus: AmneziaHelperStartupPreflightStatus = 'unknown'
  let endpointStatus: AmneziaHelperStartupPreflightStatus = 'unknown'
  let configStatus: AmneziaHelperStartupPreflightStatus = 'unknown'
  let tunBypassStatus: AmneziaHelperStartupPreflightTunBypassStatus = input.tunEnabled
    ? 'unknown'
    : 'not_required'
  let runtimeConfig: AmneziaHelperRuntimeConfig | undefined
  let tunBypass: AmneziaHelperTunBypassResolution | undefined

  const addBlocker = (reason: AmneziaHelperStartupPreflightReason): void => {
    blockingReasons.push(reason)
  }
  const addWarning = (reason: AmneziaHelperStartupPreflightReason): void => {
    warnings.push(reason)
  }

  const backendStatus = collectBackendReasons(input.backend, addBlocker)

  if (input.planLoadError) {
    addBlocker({
      code: 'missing_execution_plan',
      stage: 'execution_plan',
      message: `Amnezia helper execution plan could not be loaded: ${stringifyError(input.planLoadError)}`
    })
    profileStatus = 'blocked'
  } else if (!input.plan) {
    addBlocker({
      code: 'missing_execution_plan',
      stage: 'execution_plan',
      message: 'Amnezia helper execution plan is missing for this profile'
    })
    profileStatus = 'blocked'
  } else if (!input.plan.helper) {
    addBlocker({
      code: 'missing_helper_descriptor',
      stage: 'execution_plan',
      message: 'Amnezia helper descriptor is missing from the execution plan',
      details: {
        planStatus: input.plan.status,
        executionKind: input.plan.kind
      }
    })
    profileStatus = 'blocked'
  } else if (input.plan.status !== 'ready' && input.plan.status !== 'dry_run') {
    addBlocker({
      code: 'unsupported_execution_plan',
      stage: 'execution_plan',
      message: `Amnezia helper execution plan is not startable: ${input.plan.status}`,
      details: {
        planStatus: input.plan.status,
        executionKind: input.plan.kind
      }
    })
    profileStatus = 'blocked'
  } else {
    profileStatus = 'ok'
    for (const blocker of input.plan.compatibility.blockers) {
      addBlocker({
        code: mapCompatibilityBlockerToReason(blocker),
        stage: 'execution_plan',
        message: blocker
      })
      profileStatus = 'blocked'
    }
    for (const warning of input.plan.compatibility.warnings) {
      addWarning({
        code: 'unsupported_execution_plan',
        stage: 'execution_plan',
        message: warning
      })
      if (profileStatus === 'ok') profileStatus = 'warning'
    }
  }

  if (input.plan?.helper) {
    try {
      runtimeConfig = await (input.prepareRuntimeConfig ?? ((config) => config))(
        input.plan.helper.config,
        input.backend.mode
      )
      endpointStatus = hasEndpoint(runtimeConfig) ? 'ok' : 'blocked'
      if (endpointStatus === 'blocked') {
        addBlocker({
          code: 'missing_endpoint',
          stage: 'runtime_config',
          message: 'Amnezia profile endpoint is missing or invalid'
        })
      }
    } catch (error) {
      addBlocker({
        code: 'runtime_config_generation_failed',
        stage: 'runtime_config',
        message: stringifyError(error)
      })
      configStatus = 'blocked'
      profileStatus = 'blocked'
    }
  }

  if (runtimeConfig) {
    try {
      generateBackendConfig(input.backend, runtimeConfig)
      if (configStatus !== 'blocked') configStatus = 'ok'
      if (endpointStatus === 'unknown') endpointStatus = 'ok'
    } catch (error) {
      configStatus = 'blocked'
      if (error instanceof AmneziaProductionBackendConfigError) {
        for (const issue of error.issues) {
          const reason = productionIssueToReason(issue.code)
          addBlocker({
            code: reason,
            stage: 'production_config',
            message: issue.message,
            details: {
              path: issue.path
            }
          })
          if (reason === 'missing_endpoint') endpointStatus = 'blocked'
          if (
            reason === 'missing_keys' ||
            reason === 'missing_allowed_ips' ||
            reason === 'missing_interface_address' ||
            reason === 'unsupported_profile_protocol'
          ) {
            profileStatus = 'blocked'
          }
        }
      } else {
        addBlocker({
          code: 'production_config_generation_failed',
          stage: 'production_config',
          message: stringifyError(error)
        })
      }
    }
  } else if (configStatus === 'unknown') {
    configStatus = 'blocked'
  }

  if (runtimeConfig?.localProxy) {
    runtimeConfig = { ...runtimeConfig, localProxy: { ...runtimeConfig.localProxy } }
  }

  if (runtimeConfig && input.tunEnabled) {
    if (input.backend.mode === 'stub') {
      tunBypassStatus = 'not_required'
    } else if (input.resolveTunBypass) {
      tunBypass = await input.resolveTunBypass({ runtimeConfig, tunEnabled: true })
      tunBypassStatus = tunBypass.status === 'resolved' ? 'resolved' : 'failed'
      if (tunBypass.status === 'failed') {
        addBlocker({
          code: 'tun_bypass_resolution_failure',
          stage: 'tun_bypass_resolution',
          message:
            tunBypass.error ??
            'Amnezia helper upstream endpoint could not be resolved for TUN bypass',
          details: {
            endpointHost: tunBypass.endpointHost ?? '',
            endpointPort: tunBypass.endpointPort ?? 0
          }
        })
      } else {
        for (const warning of tunBypass.warnings) {
          addWarning({
            code: 'tun_bypass_resolution_failure',
            stage: 'tun_bypass_resolution',
            message: warning
          })
        }
      }
    }
  }

  const dedupedBlockers = dedupeReasons(blockingReasons)
  const dedupedWarnings = dedupeReasons(warnings)

  return {
    profileId: input.profileId,
    checkedAt: now(),
    canStart: dedupedBlockers.length === 0,
    backendStatus,
    profileStatus: normalizeStatus(profileStatus, dedupedBlockers, [
      'missing_execution_plan',
      'missing_helper_descriptor',
      'unsupported_execution_plan',
      'unsupported_profile_protocol',
      'missing_keys',
      'missing_allowed_ips',
      'missing_interface_address'
    ]),
    endpointStatus: normalizeStatus(endpointStatus, dedupedBlockers, ['missing_endpoint']),
    configStatus: normalizeStatus(configStatus, dedupedBlockers, [
      'runtime_config_generation_failed',
      'production_config_generation_failed',
      'invalid_local_proxy',
      'missing_keys',
      'missing_allowed_ips',
      'missing_interface_address',
      'unsupported_profile_protocol'
    ]),
    tunBypassStatus,
    blockingReasons: dedupedBlockers,
    warnings: dedupedWarnings,
    backend: {
      mode: input.backend.mode,
      kind: input.backend.kind,
      available: input.backend.available,
      command: input.backend.command,
      executablePath: input.backend.executablePath
    },
    localEndpoint: runtimeConfig?.localProxy ? { ...runtimeConfig.localProxy } : undefined,
    tunBypass
  }
}

export function mapStartupPreflightReasonToRuntimeCategory(
  code: AmneziaHelperStartupPreflightReasonCode
): AmneziaHelperDiagnosticCategory {
  switch (code) {
    case 'helper_binary_permission_denied':
      return 'backend_permission_denied'
    case 'helper_binary_not_executable':
      return 'backend_not_executable'
    case 'unsupported_platform':
      return 'unsupported_platform'
    case 'unsupported_arch':
      return 'unsupported_arch'
    case 'helper_binary_platform_mismatch':
    case 'helper_binary_arch_mismatch':
      return 'backend_arch_mismatch'
    case 'helper_binary_missing':
    case 'backend_unavailable':
      return 'backend_unavailable'
    case 'tun_bypass_resolution_failure':
      return 'tun_bypass_resolution_failure'
    case 'runtime_config_generation_failed':
    case 'production_config_generation_failed':
    case 'unsupported_profile_protocol':
    case 'missing_endpoint':
    case 'missing_keys':
    case 'missing_allowed_ips':
    case 'missing_interface_address':
    case 'invalid_local_proxy':
    case 'missing_execution_plan':
    case 'missing_helper_descriptor':
    case 'unsupported_execution_plan':
    default:
      return 'config_generation_failure'
  }
}

function collectBackendReasons(
  backend: ResolvedAmneziaHelperBackend,
  addBlocker: (reason: AmneziaHelperStartupPreflightReason) => void
): AmneziaHelperStartupPreflightStatus {
  if (backend.available) return 'ok'

  const issues = backend.validation?.issues ?? []
  if (issues.length === 0) {
    addBlocker({
      code: 'backend_unavailable',
      stage: 'backend_resolution',
      message: 'Amnezia helper backend is unavailable',
      details: {
        executablePath: backend.executablePath
      }
    })
    return 'blocked'
  }

  for (const issue of issues) {
    addBlocker(validationIssueToReason(issue))
  }

  return 'blocked'
}

function validationIssueToReason(
  issue: AmneziaHelperExecutableValidationIssue
): AmneziaHelperStartupPreflightReason {
  const code = validationIssueCodeToReason(issue)
  return {
    code,
    stage: 'backend_resolution',
    message: issue.message,
    details: {
      executablePath: issue.path ?? '',
      expectedPlatform: issue.expectedPlatform ?? '',
      expectedArch: issue.expectedArch ?? '',
      actualPlatform: issue.actualPlatform ?? '',
      actualArch: issue.actualArch ?? ''
    }
  }
}

function validationIssueCodeToReason(
  issue: AmneziaHelperExecutableValidationIssue
): AmneziaHelperStartupPreflightReasonCode {
  switch (issue.code) {
    case 'missing':
      return 'helper_binary_missing'
    case 'not_file':
      return 'helper_binary_not_executable'
    case 'permission_denied':
      return 'helper_binary_permission_denied'
    case 'unsupported_platform':
      return 'unsupported_platform'
    case 'unsupported_arch':
      return 'unsupported_arch'
    case 'arch_mismatch':
      return issue.actualPlatform
        ? 'helper_binary_platform_mismatch'
        : 'helper_binary_arch_mismatch'
  }
}

function mapCompatibilityBlockerToReason(blocker: string): AmneziaHelperStartupPreflightReasonCode {
  if (blocker.includes('missing_endpoint')) return 'missing_endpoint'
  if (blocker.includes('missing_keys')) return 'missing_keys'
  if (blocker.includes('unsupported_protocol')) return 'unsupported_profile_protocol'
  return 'unsupported_execution_plan'
}

function productionIssueToReason(
  code: AmneziaProductionBackendConfigIssueCode
): AmneziaHelperStartupPreflightReasonCode {
  switch (code) {
    case 'missing_endpoint':
      return 'missing_endpoint'
    case 'missing_keys':
      return 'missing_keys'
    case 'missing_allowed_ips':
      return 'missing_allowed_ips'
    case 'missing_interface_address':
      return 'missing_interface_address'
    case 'unsupported_protocol':
      return 'unsupported_profile_protocol'
    case 'invalid_local_proxy':
      return 'invalid_local_proxy'
  }
}

function hasEndpoint(config: AmneziaHelperRuntimeConfig): boolean {
  return Boolean(
    config.remote.host && Number.isInteger(config.remote.port) && config.remote.port > 0
  )
}

function normalizeStatus(
  status: AmneziaHelperStartupPreflightStatus,
  blockers: AmneziaHelperStartupPreflightReason[],
  relevantCodes: AmneziaHelperStartupPreflightReasonCode[]
): AmneziaHelperStartupPreflightStatus {
  if (blockers.some((reason) => relevantCodes.includes(reason.code))) return 'blocked'
  return status === 'unknown' ? 'ok' : status
}

function dedupeReasons(
  reasons: AmneziaHelperStartupPreflightReason[]
): AmneziaHelperStartupPreflightReason[] {
  const result: AmneziaHelperStartupPreflightReason[] = []
  const seen = new Set<string>()
  for (const reason of reasons) {
    const key = `${reason.code}:${reason.stage}:${reason.message}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push({
      ...reason,
      details: reason.details ? compactDetails(reason.details) : undefined
    })
  }
  return result
}

function compactDetails(
  details: Record<string, string | number | boolean>
): Record<string, string | number | boolean> | undefined {
  const result: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(details)) {
    if (value !== '') result[key] = value
  }
  return Object.keys(result).length > 0 ? result : undefined
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
