export type ManagedProfileKind = 'mihomo' | 'amnezia'
export type ManagedProfileSourceType = 'remote_url' | 'local_file' | 'amnezia_vpn_uri' | 'unknown'
export type ManagedRuntimeSupport =
  | 'none'
  | 'planned'
  | 'available'
  | 'translatable'
  | 'requires_helper'
  | 'prototype_available'
export type ManagedValidityStatus = 'valid' | 'invalid' | 'partial'
export type ManagedExecutionStatus =
  | 'not_supported'
  | 'ready_for_runtime'
  | 'error'
  | 'requires_helper'
  | 'dry_run_available'
export type ManagedRuntimeType = 'mihomo' | 'amnezia'
export type ManagedExecutionKind = 'mihomo-native' | 'external-helper' | 'unsupported'

export interface ManagedProfileItemLike {
  id: string
  type: 'remote' | 'local'
  name: string
  profileKind?: ManagedProfileKind
  sourceType?: ManagedProfileSourceType
  runtimeSupport?: ManagedRuntimeSupport
  validityStatus?: ManagedValidityStatus
  executionStatus?: ManagedExecutionStatus
  compatibility?: 'amnezia'
  importedSourceId?: string
  normalizedProfileId?: string
  compatibilityProtocol?: string
}

export interface ManagedProfileConfigLike<
  T extends ManagedProfileItemLike = ManagedProfileItemLike
> {
  current?: string
  items: T[]
}

export interface ManagedProfileMetadata {
  profileKind: ManagedProfileKind
  sourceType: ManagedProfileSourceType
  runtimeSupport: ManagedRuntimeSupport
  validityStatus: ManagedValidityStatus
  executionStatus: ManagedExecutionStatus
}

export interface ProfileRuntimeCapabilities {
  runtimeType: ManagedRuntimeType
  runtimeSupport: ManagedRuntimeSupport
  executionStatus: ManagedExecutionStatus
  executionKind: ManagedExecutionKind
  canActivate: boolean
  canRefresh: boolean
  canRename: boolean
  canDelete: boolean
  canViewDetails: boolean
  canEditConfig: boolean
  canEditRules: boolean
  canOpenConfigFile: boolean
  canDryRun: boolean
  requiresHelper: boolean
  unsupportedReason?: 'runtime_not_supported' | 'helper_required'
}

export interface ProfileBadgeDescriptor {
  key:
    | 'imported'
    | 'amnezia'
    | 'runtime_not_supported'
    | 'runtime_planned'
    | 'runtime_translatable'
    | 'runtime_requires_helper'
    | 'runtime_prototype_available'
    | 'invalid'
    | 'partial'
    | 'mihomo'
  tone: 'neutral' | 'info' | 'warning' | 'danger'
}

export interface UpgradeProfileConfigResult<T extends ManagedProfileItemLike> {
  config: ManagedProfileConfigLike<T>
  changed: boolean
}

export function getManagedProfileMetadata(item: ManagedProfileItemLike): ManagedProfileMetadata {
  const profileKind = getManagedProfileKind(item)

  if (profileKind === 'amnezia') {
    const hasNormalizedProfile = Boolean(item.importedSourceId && item.normalizedProfileId)
    return {
      profileKind,
      sourceType: item.sourceType ?? 'amnezia_vpn_uri',
      runtimeSupport:
        item.runtimeSupport ?? (hasNormalizedProfile ? 'prototype_available' : 'planned'),
      validityStatus: item.validityStatus ?? (hasNormalizedProfile ? 'valid' : 'partial'),
      executionStatus:
        item.executionStatus ?? (hasNormalizedProfile ? 'dry_run_available' : 'not_supported')
    }
  }

  return {
    profileKind,
    sourceType: item.sourceType ?? (item.type === 'remote' ? 'remote_url' : 'local_file'),
    runtimeSupport: item.runtimeSupport ?? 'available',
    validityStatus: item.validityStatus ?? 'valid',
    executionStatus: item.executionStatus ?? 'ready_for_runtime'
  }
}

export function getProfileRuntimeCapabilities(
  item: ManagedProfileItemLike
): ProfileRuntimeCapabilities {
  const metadata = getManagedProfileMetadata(item)

  if (metadata.profileKind === 'amnezia') {
    const helperRuntimeAvailable =
      metadata.validityStatus === 'valid' &&
      (metadata.runtimeSupport === 'prototype_available' ||
        metadata.runtimeSupport === 'requires_helper')

    return {
      runtimeType: 'amnezia',
      runtimeSupport: metadata.runtimeSupport,
      executionStatus: metadata.executionStatus,
      executionKind:
        metadata.runtimeSupport === 'prototype_available' ||
        metadata.runtimeSupport === 'requires_helper'
          ? 'external-helper'
          : 'unsupported',
      canActivate: helperRuntimeAvailable,
      canRefresh: false,
      canRename: true,
      canDelete: true,
      canViewDetails: true,
      canEditConfig: false,
      canEditRules: helperRuntimeAvailable,
      canOpenConfigFile: false,
      canDryRun:
        metadata.runtimeSupport === 'prototype_available' &&
        metadata.executionStatus === 'dry_run_available',
      requiresHelper:
        metadata.runtimeSupport === 'prototype_available' ||
        metadata.runtimeSupport === 'requires_helper',
      unsupportedReason:
        metadata.runtimeSupport === 'prototype_available' ||
        metadata.runtimeSupport === 'requires_helper'
          ? 'helper_required'
          : 'runtime_not_supported'
    }
  }

  return {
    runtimeType: 'mihomo',
    runtimeSupport: metadata.runtimeSupport,
    executionStatus: metadata.executionStatus,
    executionKind: 'mihomo-native',
    canActivate:
      metadata.runtimeSupport === 'available' && metadata.executionStatus === 'ready_for_runtime',
    canRefresh: item.type === 'remote',
    canRename: true,
    canDelete: true,
    canViewDetails: false,
    canEditConfig: true,
    canEditRules: true,
    canOpenConfigFile: true,
    canDryRun: false,
    requiresHelper: false
  }
}

export function getProfileBadgeDescriptors(item: ManagedProfileItemLike): ProfileBadgeDescriptor[] {
  const metadata = getManagedProfileMetadata(item)

  if (metadata.profileKind !== 'amnezia') return []

  const badges: ProfileBadgeDescriptor[] = [
    { key: 'imported', tone: 'neutral' },
    { key: 'amnezia', tone: 'info' },
    ...getRuntimeSupportBadges(metadata.runtimeSupport)
  ]

  if (metadata.validityStatus === 'invalid') {
    badges.push({ key: 'invalid', tone: 'danger' })
  } else if (metadata.validityStatus === 'partial') {
    badges.push({ key: 'partial', tone: 'warning' })
  }

  return badges
}

export function createMihomoManagedProfileFields(
  type: 'remote' | 'local'
): Pick<
  ManagedProfileItemLike,
  'profileKind' | 'sourceType' | 'runtimeSupport' | 'validityStatus' | 'executionStatus'
> {
  return {
    profileKind: 'mihomo',
    sourceType: type === 'remote' ? 'remote_url' : 'local_file',
    runtimeSupport: 'available',
    validityStatus: 'valid',
    executionStatus: 'ready_for_runtime'
  }
}

export function createAmneziaManagedProfileFields(input: {
  sourceId: string
  normalizedProfileId: string
}): Pick<
  ManagedProfileItemLike,
  | 'profileKind'
  | 'sourceType'
  | 'runtimeSupport'
  | 'validityStatus'
  | 'executionStatus'
  | 'compatibility'
  | 'importedSourceId'
  | 'normalizedProfileId'
> {
  return {
    profileKind: 'amnezia',
    sourceType: 'amnezia_vpn_uri',
    runtimeSupport: 'prototype_available',
    validityStatus: 'valid',
    executionStatus: 'dry_run_available',
    compatibility: 'amnezia',
    importedSourceId: input.sourceId,
    normalizedProfileId: input.normalizedProfileId
  }
}

export function upgradeManagedProfileItem<T extends ManagedProfileItemLike>(
  item: T
): { item: T; changed: boolean } {
  if (getManagedProfileKind(item) !== 'amnezia') {
    return { item, changed: false }
  }

  const metadata = getManagedProfileMetadata(item)
  const runtimeSupport = getUpgradedRuntimeSupport(item, metadata)
  const executionStatus = getUpgradedExecutionStatus(item, metadata, runtimeSupport)
  const upgraded = {
    ...item,
    compatibility: 'amnezia',
    profileKind: 'amnezia',
    sourceType: metadata.sourceType,
    runtimeSupport,
    validityStatus: metadata.validityStatus,
    executionStatus
  } as T

  return {
    item: upgraded,
    changed:
      upgraded.compatibility !== item.compatibility ||
      upgraded.profileKind !== item.profileKind ||
      upgraded.sourceType !== item.sourceType ||
      upgraded.runtimeSupport !== item.runtimeSupport ||
      upgraded.validityStatus !== item.validityStatus ||
      upgraded.executionStatus !== item.executionStatus
  }
}

export function upgradeProfileConfigForManagedProfiles<T extends ManagedProfileItemLike>(
  config: ManagedProfileConfigLike<T>
): UpgradeProfileConfigResult<T> {
  let changed = false
  const items = (config.items ?? []).map((item) => {
    const upgraded = upgradeManagedProfileItem(item)
    if (upgraded.changed) changed = true
    return upgraded.item
  })

  const currentItem = items.find((item) => item.id === config.current)
  let current = config.current
  if (!current || (currentItem && !getProfileRuntimeCapabilities(currentItem).canActivate)) {
    current = items.find((item) => getProfileRuntimeCapabilities(item).canActivate)?.id
    changed = current !== config.current
  }

  return {
    config: {
      ...config,
      current,
      items
    },
    changed
  }
}

function getManagedProfileKind(item: ManagedProfileItemLike): ManagedProfileKind {
  return item.profileKind ?? (item.compatibility === 'amnezia' ? 'amnezia' : 'mihomo')
}

function getRuntimeSupportBadges(runtimeSupport: ManagedRuntimeSupport): ProfileBadgeDescriptor[] {
  switch (runtimeSupport) {
    case 'prototype_available':
      return [
        { key: 'runtime_requires_helper', tone: 'warning' },
        { key: 'runtime_prototype_available', tone: 'info' }
      ]
    case 'requires_helper':
      return [{ key: 'runtime_requires_helper', tone: 'warning' }]
    case 'translatable':
      return [{ key: 'runtime_translatable', tone: 'info' }]
    case 'planned':
      return [{ key: 'runtime_planned', tone: 'warning' }]
    case 'none':
      return [{ key: 'runtime_not_supported', tone: 'warning' }]
    case 'available':
      return []
  }
}

function getUpgradedRuntimeSupport(
  item: ManagedProfileItemLike,
  metadata: ManagedProfileMetadata
): ManagedRuntimeSupport {
  const hasNormalizedProfile = Boolean(item.importedSourceId && item.normalizedProfileId)
  if (
    hasNormalizedProfile &&
    (!item.runtimeSupport || item.runtimeSupport === 'planned' || item.runtimeSupport === 'none')
  ) {
    return 'prototype_available'
  }

  return metadata.runtimeSupport
}

function getUpgradedExecutionStatus(
  item: ManagedProfileItemLike,
  metadata: ManagedProfileMetadata,
  runtimeSupport: ManagedRuntimeSupport
): ManagedExecutionStatus {
  if (
    runtimeSupport === 'prototype_available' &&
    (!item.executionStatus || item.executionStatus === 'not_supported')
  ) {
    return 'dry_run_available'
  }

  return metadata.executionStatus
}
