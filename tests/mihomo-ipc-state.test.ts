import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  clearActiveMihomoIpcPath,
  getActiveMihomoIpcPath,
  setActiveMihomoIpcPath,
  shouldRestartCoreForMihomoIpcChange
} from '../src/main/core/mihomoIpcState'

describe('Mihomo IPC state', () => {
  it('keeps the active socket path stable until the matching core is cleared', () => {
    clearActiveMihomoIpcPath()

    setActiveMihomoIpcPath('/tmp/koala-clash-mihomo-api-noperm.sock')
    assert.equal(getActiveMihomoIpcPath(), '/tmp/koala-clash-mihomo-api-noperm.sock')

    clearActiveMihomoIpcPath('/tmp/koala-clash-mihomo-api.sock')
    assert.equal(getActiveMihomoIpcPath(), '/tmp/koala-clash-mihomo-api-noperm.sock')

    clearActiveMihomoIpcPath('/tmp/koala-clash-mihomo-api-noperm.sock')
    assert.equal(getActiveMihomoIpcPath(), undefined)
  })

  it('requires a core restart when the active socket no longer matches permission state', () => {
    assert.equal(
      shouldRestartCoreForMihomoIpcChange(
        '/tmp/koala-clash-mihomo-api-noperm.sock',
        '/tmp/koala-clash-mihomo-api.sock'
      ),
      true
    )
    assert.equal(
      shouldRestartCoreForMihomoIpcChange(
        '/tmp/koala-clash-mihomo-api.sock',
        '/tmp/koala-clash-mihomo-api.sock'
      ),
      false
    )
    assert.equal(shouldRestartCoreForMihomoIpcChange(undefined, '/tmp/socket.sock'), false)
  })
})
