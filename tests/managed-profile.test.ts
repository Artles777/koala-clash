import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createAmneziaManagedProfileFields,
  getManagedProfileMetadata,
  getProfileBadgeDescriptors,
  getProfileRuntimeCapabilities,
  upgradeProfileConfigForManagedProfiles,
  ManagedProfileConfigLike,
  ManagedProfileItemLike
} from '../src/core/profiles/managed-profile'

describe('managed profile metadata', () => {
  it('maps imported Amnezia profiles to first-class metadata and badges', () => {
    const item: ManagedProfileItemLike = {
      id: 'amnezia-1',
      type: 'local',
      name: 'Amnezia Test',
      compatibilityProtocol: 'amneziawg',
      ...createAmneziaManagedProfileFields({
        sourceId: 'source-1',
        normalizedProfileId: 'amnezia-1'
      })
    }

    const metadata = getManagedProfileMetadata(item)
    const badges = getProfileBadgeDescriptors(item)

    assert.equal(metadata.profileKind, 'amnezia')
    assert.equal(metadata.sourceType, 'amnezia_vpn_uri')
    assert.equal(metadata.runtimeSupport, 'prototype_available')
    assert.equal(metadata.validityStatus, 'valid')
    assert.equal(metadata.executionStatus, 'dry_run_available')
    assert.deepEqual(
      badges.map((badge) => badge.key),
      ['imported', 'amnezia', 'runtime_requires_helper', 'runtime_prototype_available']
    )
  })

  it('allows valid Amnezia profiles to activate through the helper-backed Mihomo runtime', () => {
    const capabilities = getProfileRuntimeCapabilities({
      id: 'amnezia-1',
      type: 'local',
      name: 'Amnezia Test',
      compatibility: 'amnezia',
      importedSourceId: 'source-1',
      normalizedProfileId: 'amnezia-1'
    })

    assert.equal(capabilities.runtimeType, 'amnezia')
    assert.equal(capabilities.runtimeSupport, 'prototype_available')
    assert.equal(capabilities.executionKind, 'external-helper')
    assert.equal(capabilities.executionStatus, 'dry_run_available')
    assert.equal(capabilities.canActivate, true)
    assert.equal(capabilities.canRefresh, false)
    assert.equal(capabilities.canEditConfig, false)
    assert.equal(capabilities.canEditRules, true)
    assert.equal(capabilities.canOpenConfigFile, false)
    assert.equal(capabilities.canViewDetails, true)
    assert.equal(capabilities.canDryRun, true)
    assert.equal(capabilities.requiresHelper, true)
    assert.equal(capabilities.canRename, true)
    assert.equal(capabilities.canDelete, true)
  })

  it('keeps Mihomo profiles ready for the existing runtime', () => {
    const capabilities = getProfileRuntimeCapabilities({
      id: 'mihomo-1',
      type: 'remote',
      name: 'Mihomo Remote'
    })

    assert.equal(capabilities.runtimeType, 'mihomo')
    assert.equal(capabilities.executionKind, 'mihomo-native')
    assert.equal(capabilities.canActivate, true)
    assert.equal(capabilities.canRefresh, true)
    assert.equal(capabilities.canEditConfig, true)
    assert.equal(capabilities.canEditRules, true)
  })

  it('keeps imported VLESS profiles on the Mihomo-native runtime path', () => {
    const item: ManagedProfileItemLike = {
      id: 'vless-1',
      type: 'local',
      name: 'Imported VLESS',
      profileKind: 'mihomo',
      sourceType: 'vless_uri',
      runtimeSupport: 'available',
      validityStatus: 'valid',
      executionStatus: 'ready_for_runtime'
    }

    const metadata = getManagedProfileMetadata(item)
    const capabilities = getProfileRuntimeCapabilities(item)
    const badges = getProfileBadgeDescriptors(item)

    assert.equal(metadata.profileKind, 'mihomo')
    assert.equal(metadata.sourceType, 'vless_uri')
    assert.equal(capabilities.runtimeType, 'mihomo')
    assert.equal(capabilities.executionKind, 'mihomo-native')
    assert.equal(capabilities.requiresHelper, false)
    assert.deepEqual(badges, [])
  })

  it('upgrades old placeholder Amnezia profiles without clearing helper-backed current selection', () => {
    const config: ManagedProfileConfigLike = {
      current: 'amnezia-1',
      items: [
        {
          id: 'amnezia-1',
          type: 'local',
          name: 'Old Amnezia Placeholder',
          compatibility: 'amnezia',
          importedSourceId: 'source-1',
          normalizedProfileId: 'amnezia-1'
        },
        {
          id: 'mihomo-1',
          type: 'local',
          name: 'Mihomo Local'
        }
      ]
    }
    const result = upgradeProfileConfigForManagedProfiles(config)

    assert.equal(result.changed, true)
    assert.equal(result.config.current, 'amnezia-1')
    assert.equal(result.config.items[0].profileKind, 'amnezia')
    assert.equal(result.config.items[0].sourceType, 'amnezia_vpn_uri')
    assert.equal(result.config.items[0].runtimeSupport, 'prototype_available')
    assert.equal(result.config.items[0].executionStatus, 'dry_run_available')
  })

  it('repairs missing current profile by selecting the first activatable profile', () => {
    const config: ManagedProfileConfigLike = {
      items: [
        {
          id: 'amnezia-1',
          type: 'local',
          name: 'Imported VPN',
          compatibility: 'amnezia',
          importedSourceId: 'source-1',
          normalizedProfileId: 'amnezia-1'
        }
      ]
    }
    const result = upgradeProfileConfigForManagedProfiles(config)

    assert.equal(result.changed, true)
    assert.equal(result.config.current, 'amnezia-1')
  })

  it('marks incomplete legacy Amnezia metadata as partial', () => {
    const metadata = getManagedProfileMetadata({
      id: 'amnezia-1',
      type: 'local',
      name: 'Incomplete Amnezia',
      compatibility: 'amnezia'
    })

    assert.equal(metadata.validityStatus, 'partial')
  })
})
