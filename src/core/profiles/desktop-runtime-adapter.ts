import {
  NormalizedProfile,
  NormalizedProfileProtocol,
  validateNormalizedProfile
} from './normalized-profile'
import { ManagedProfileItemLike } from './managed-profile'
import {
  AmneziaHelperBackendMode,
  AmneziaHelperRuntimeConfig,
  createAmneziaHelperRuntimeConfig
} from './amnezia-helper-runtime-config'

export type DesktopRuntimePlatform = 'win32' | 'linux' | 'darwin'
export type DesktopRuntimeExecutionKind = 'mihomo-native' | 'external-helper' | 'unsupported'
export type DesktopRuntimeAdapterId = 'mihomo-core' | 'amnezia-desktop-helper' | 'unsupported'
export type RuntimePlanStatus = 'ready' | 'dry_run' | 'unsupported'

export interface RuntimeAdapterResolution {
  adapterId: DesktopRuntimeAdapterId
  executionKind: DesktopRuntimeExecutionKind
  profileKind: 'mihomo' | 'amnezia' | 'unknown'
}

export interface RuntimeCompatibilityResult {
  compatible: boolean
  adapterId: DesktopRuntimeAdapterId
  executionKind: DesktopRuntimeExecutionKind
  runtimeSupport:
    | 'available'
    | 'translatable'
    | 'requires_helper'
    | 'prototype_available'
    | 'planned'
    | 'none'
  blockers: string[]
  warnings: string[]
  requiresHelper: boolean
  dryRunAvailable: boolean
}

export interface DesktopRuntimeExecutionPlan {
  profileId: string
  platform?: DesktopRuntimePlatform
  adapterId: DesktopRuntimeAdapterId
  kind: DesktopRuntimeExecutionKind
  status: RuntimePlanStatus
  compatibility: RuntimeCompatibilityResult
  helper?: AmneziaHelperProcessDescriptor
}

export interface AmneziaHelperProcessDescriptor {
  backendMode: AmneziaHelperBackendMode
  executable: string
  args: string[]
  configFormat: 'json'
  config: AmneziaHelperRuntimeConfig
  needsElevatedPrivileges: boolean
  notes: string[]
}

const helperSupportedProtocols = new Set<NormalizedProfileProtocol>(['wireguard', 'amneziawg'])

export function toDesktopRuntimePlatform(value: string): DesktopRuntimePlatform | undefined {
  if (value === 'win32' || value === 'linux' || value === 'darwin') return value
  return undefined
}

export function resolveRuntimeAdapter(
  profile: ManagedProfileItemLike | NormalizedProfile | undefined
): RuntimeAdapterResolution {
  if (!profile) {
    return {
      adapterId: 'unsupported',
      executionKind: 'unsupported',
      profileKind: 'unknown'
    }
  }

  if (isNormalizedProfile(profile)) {
    if (helperSupportedProtocols.has(profile.protocol)) {
      return {
        adapterId: 'amnezia-desktop-helper',
        executionKind: 'external-helper',
        profileKind: 'amnezia'
      }
    }

    return {
      adapterId: 'unsupported',
      executionKind: 'unsupported',
      profileKind: 'amnezia'
    }
  }

  if (profile.profileKind === 'amnezia' || profile.compatibility === 'amnezia') {
    return {
      adapterId: 'amnezia-desktop-helper',
      executionKind: 'external-helper',
      profileKind: 'amnezia'
    }
  }

  return {
    adapterId: 'mihomo-core',
    executionKind: 'mihomo-native',
    profileKind: 'mihomo'
  }
}

export function validateRuntimeCompatibility(
  profile: NormalizedProfile | ManagedProfileItemLike | undefined,
  platformValue: string
): RuntimeCompatibilityResult {
  const platform = toDesktopRuntimePlatform(platformValue)
  const resolution = resolveRuntimeAdapter(profile)

  if (!platform) {
    return unsupportedCompatibility(['unsupported_desktop_platform'])
  }

  if (!profile) {
    return unsupportedCompatibility(['missing_profile'])
  }

  if (!isNormalizedProfile(profile)) {
    if (resolution.executionKind === 'mihomo-native') {
      return {
        compatible: true,
        adapterId: resolution.adapterId,
        executionKind: resolution.executionKind,
        runtimeSupport: 'available',
        blockers: [],
        warnings: [],
        requiresHelper: false,
        dryRunAvailable: false
      }
    }

    return {
      compatible: false,
      adapterId: resolution.adapterId,
      executionKind: resolution.executionKind,
      runtimeSupport: 'requires_helper',
      blockers: ['normalized_profile_required_for_execution_plan'],
      warnings: [],
      requiresHelper: true,
      dryRunAvailable: false
    }
  }

  if (!helperSupportedProtocols.has(profile.protocol)) {
    return {
      compatible: false,
      adapterId: 'unsupported',
      executionKind: 'unsupported',
      runtimeSupport: 'planned',
      blockers: [`protocol_not_supported_by_amnezia_helper:${profile.protocol}`],
      warnings: [],
      requiresHelper: true,
      dryRunAvailable: false
    }
  }

  const issues = validateNormalizedProfile(profile)
  const blockers = issues.map((issue) => `${issue.code}:${issue.path}`)
  const warnings =
    profile.protocol === 'wireguard' && Object.keys(profile.amnezia.obfuscation).length === 0
      ? ['mihomo_wireguard_translation_not_selected_for_phase_2b']
      : []

  return {
    compatible: blockers.length === 0,
    adapterId: 'amnezia-desktop-helper',
    executionKind: 'external-helper',
    runtimeSupport: blockers.length === 0 ? 'prototype_available' : 'requires_helper',
    blockers,
    warnings,
    requiresHelper: true,
    dryRunAvailable: blockers.length === 0
  }
}

export function getExecutionPlan(
  profile: NormalizedProfile,
  platformValue: string
): DesktopRuntimeExecutionPlan {
  const platform = toDesktopRuntimePlatform(platformValue)
  const compatibility = validateRuntimeCompatibility(profile, platformValue)

  if (!platform || !compatibility.compatible || compatibility.executionKind !== 'external-helper') {
    return {
      profileId: profile.id,
      platform,
      adapterId: compatibility.adapterId,
      kind: compatibility.executionKind,
      status: 'unsupported',
      compatibility
    }
  }

  return {
    profileId: profile.id,
    platform,
    adapterId: 'amnezia-desktop-helper',
    kind: 'external-helper',
    status: 'ready',
    compatibility,
    helper: {
      backendMode: 'production',
      executable: getHelperExecutable(platform),
      args: ['run', '--config', '<generated-by-koala-clash>', '--profile-id', profile.id],
      configFormat: 'json',
      config: createAmneziaHelperRuntimeConfig(profile, {
        backendMode: 'production',
        allowEphemeralPort: true
      }),
      needsElevatedPrivileges: true,
      notes: ['proxy_mode', 'mihomo_core_is_not_replaced', 'production_backend_required']
    }
  }
}

function getHelperExecutable(platform: DesktopRuntimePlatform): string {
  return platform === 'win32' ? 'amnezia-helper.exe' : 'amnezia-helper'
}

function unsupportedCompatibility(blockers: string[]): RuntimeCompatibilityResult {
  return {
    compatible: false,
    adapterId: 'unsupported',
    executionKind: 'unsupported',
    runtimeSupport: 'none',
    blockers,
    warnings: [],
    requiresHelper: false,
    dryRunAvailable: false
  }
}

function isNormalizedProfile(
  profile: ManagedProfileItemLike | NormalizedProfile
): profile is NormalizedProfile {
  return (
    'protocol' in profile &&
    'transport' in profile &&
    'auth' in profile &&
    'interface' in profile &&
    'peer' in profile
  )
}
