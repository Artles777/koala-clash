import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createUserFacingProxyGroupEntries,
  createUserFacingProxyGroups,
  getUserFacingProxyDisplayName,
  getUserFacingProxyType
} from '../src/core/ui/proxy-group-presentation'

describe('proxy group presentation', () => {
  it('keeps proxy groups unchanged', () => {
    const groups = createUserFacingProxyGroups([
      { name: 'PROXY' },
      { name: 'VPN' },
      { name: 'Fallback' }
    ])

    assert.deepEqual(
      groups.map((group) => group.name),
      ['PROXY', 'VPN', 'Fallback']
    )
  })

  it('uses raw proxy display values', () => {
    assert.equal(getUserFacingProxyDisplayName('VPN'), 'VPN')
    assert.equal(getUserFacingProxyType('VPN', 'Selector'), 'Selector')
    assert.equal(getUserFacingProxyDisplayName('DIRECT'), 'DIRECT')
  })

  it('keeps group entries unchanged', () => {
    const entries = createUserFacingProxyGroupEntries([
      { name: 'DIRECT' },
      { name: 'VPN' },
      { name: 'Fallback' }
    ])

    assert.deepEqual(
      entries.map((entry) => entry.name),
      ['DIRECT', 'VPN', 'Fallback']
    )
  })
})
