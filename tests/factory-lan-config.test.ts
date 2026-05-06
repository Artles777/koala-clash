import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { configureLanSettings } from '../src/core/profiles/lan-settings'

describe('configureLanSettings', () => {
  it('removes allow-lan and lan address lists when LAN access is disabled', () => {
    const profile: Record<string, unknown> = {
      'allow-lan': false,
      'lan-allowed-ips': ['192.168.0.0/16'],
      'lan-disallowed-ips': ['10.0.0.0/8']
    }

    configureLanSettings(profile)

    assert.equal('allow-lan' in profile, false)
    assert.equal('lan-allowed-ips' in profile, false)
    assert.equal('lan-disallowed-ips' in profile, false)
  })

  it('appends loopback to allowed IPs when LAN is enabled and 127.0.0.1/8 is missing', () => {
    const profile: Record<string, unknown> = {
      'allow-lan': true,
      'lan-allowed-ips': ['192.168.0.0/16']
    }

    configureLanSettings(profile)

    assert.deepEqual(profile['lan-allowed-ips'], ['192.168.0.0/16', '127.0.0.1/8'])
  })

  it('drops empty lan-allowed-ips and lan-disallowed-ips arrays', () => {
    const profile: Record<string, unknown> = {
      'allow-lan': true,
      'lan-allowed-ips': [],
      'lan-disallowed-ips': []
    }

    configureLanSettings(profile)

    assert.equal('lan-allowed-ips' in profile, false)
    assert.equal('lan-disallowed-ips' in profile, false)
  })
})
