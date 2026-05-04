import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createUserFacingProxyGroupEntries,
  createUserFacingProxyGroups,
  getUserFacingProxyDisplayName,
  getUserFacingProxyType
} from '../src/core/ui/proxy-group-presentation'

describe('proxy group presentation', () => {
  it('hides the internal Amnezia helper proxy group from the normal groups list', () => {
    const groups = createUserFacingProxyGroups([
      { name: 'PROXY' },
      { name: 'AMNEZIA_HELPER' },
      { name: 'Fallback' }
    ])

    assert.deepEqual(
      groups.map((group) => group.name),
      ['PROXY', 'Fallback']
    )
  })

  it('shows internal helper targets as one user-facing VPN / Amnezia item', () => {
    assert.equal(getUserFacingProxyDisplayName('AMNEZIA_HELPER'), 'VPN / Amnezia')
    assert.equal(getUserFacingProxyDisplayName('AMNEZIA_HELPER_PROXY'), 'VPN / Amnezia')
    assert.equal(getUserFacingProxyType('AMNEZIA_HELPER', 'Selector'), 'VPN')
    assert.equal(getUserFacingProxyDisplayName('DIRECT'), 'DIRECT')
  })

  it('deduplicates helper group and helper outbound entries in one visible group', () => {
    const entries = createUserFacingProxyGroupEntries([
      { name: 'DIRECT' },
      { name: 'AMNEZIA_HELPER' },
      { name: 'AMNEZIA_HELPER_PROXY' }
    ])

    assert.deepEqual(
      entries.map((entry) => entry.name),
      ['DIRECT', 'AMNEZIA_HELPER']
    )
  })

  it('keeps a directly referenced helper outbound visible when no helper group entry exists', () => {
    const entries = createUserFacingProxyGroupEntries([
      { name: 'DIRECT' },
      { name: 'AMNEZIA_HELPER_PROXY' }
    ])

    assert.deepEqual(
      entries.map((entry) => entry.name),
      ['DIRECT', 'AMNEZIA_HELPER_PROXY']
    )
  })
})
