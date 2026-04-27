import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AmneziaHelperRuntimeConfig } from '../src/core/profiles/amnezia-helper-runtime-config'
import {
  createAmneziaHelperTunBypassResolved,
  injectAmneziaHelperTunBypass
} from '../src/core/routing/amnezia-helper-tun-bypass'
import { resolveAmneziaHelperTunBypass } from '../src/main/runtime/amnezia-helper-tun-bypass-resolver'

describe('Amnezia helper TUN bypass', () => {
  it('generates a route exclusion for direct IP helper endpoints', async () => {
    const result = await resolveAmneziaHelperTunBypass({
      runtimeConfig: createRuntimeConfig('203.0.113.10'),
      tunEnabled: true,
      now: () => 1710000000000
    })

    assert.equal(result.status, 'resolved')
    assert.deepEqual(result.ips, ['203.0.113.10'])
    assert.deepEqual(result.routeExcludeAddresses, ['203.0.113.10/32'])
    assert.equal(result.resolvedAt, 1710000000000)
  })

  it('resolves domain helper endpoints into deterministic route exclusions', async () => {
    const result = await resolveAmneziaHelperTunBypass({
      runtimeConfig: createRuntimeConfig('vpn.example.com'),
      tunEnabled: true,
      lookup: async () => [
        { address: '2001:db8::1', family: 6 },
        { address: '198.51.100.20', family: 4 },
        { address: '198.51.100.20', family: 4 }
      ]
    })

    assert.equal(result.status, 'resolved')
    assert.deepEqual(result.ips, ['198.51.100.20', '2001:db8::1'])
    assert.deepEqual(result.routeExcludeAddresses, ['198.51.100.20/32', '2001:db8::1/128'])
  })

  it('reports resolution failures without generating exclusions', async () => {
    const result = await resolveAmneziaHelperTunBypass({
      runtimeConfig: createRuntimeConfig('missing.example.test'),
      tunEnabled: true,
      lookup: async () => {
        throw new Error('ENOTFOUND')
      }
    })

    assert.equal(result.status, 'failed')
    assert.deepEqual(result.routeExcludeAddresses, [])
    assert.match(result.error ?? '', /ENOTFOUND/)
    assert.match(result.warnings[0], /failed to resolve/)
  })

  it('does not inject route exclusions while TUN is disabled', () => {
    const bypass = createAmneziaHelperTunBypassResolved({
      endpointHost: '203.0.113.10',
      ips: ['203.0.113.10']
    })
    const config = {
      tun: { enable: false },
      rules: ['MATCH,DIRECT']
    }
    const result = injectAmneziaHelperTunBypass(config, bypass)

    assert.equal(result.injected, false)
    assert.equal(result.reason, 'tun_disabled')
    assert.deepEqual(result.config, config)
  })

  it('does not inject route exclusions without a resolved active bypass', () => {
    const result = injectAmneziaHelperTunBypass({
      tun: { enable: true },
      proxies: [{ name: 'DIRECT', type: 'direct' }]
    })

    assert.equal(result.injected, false)
    assert.equal(result.reason, 'bypass_not_resolved')
    assert.deepEqual(result.config.tun?.['route-exclude-address'], undefined)
  })

  it('keeps runtime YAML fields intact while merging helper route exclusions', () => {
    const bypass = createAmneziaHelperTunBypassResolved({
      endpointHost: 'vpn.example.com',
      ips: ['203.0.113.10']
    })
    const config = {
      tun: {
        enable: true,
        stack: 'mixed',
        'dns-hijack': ['any:53'],
        'route-exclude-address': ['10.0.0.1/32']
      },
      proxies: [{ name: 'DIRECT', type: 'direct' }],
      rules: ['MATCH,DIRECT']
    }

    const result = injectAmneziaHelperTunBypass(config, bypass)

    assert.equal(result.injected, true)
    assert.deepEqual(result.config.tun?.['route-exclude-address'], [
      '10.0.0.1/32',
      '203.0.113.10/32'
    ])
    assert.deepEqual(result.config.tun?.['dns-hijack'], ['any:53'])
    assert.deepEqual(result.config.proxies, config.proxies)
    assert.deepEqual(result.config.rules, config.rules)
    assert.deepEqual(config.tun['route-exclude-address'], ['10.0.0.1/32'])
  })
})

function createRuntimeConfig(host: string): AmneziaHelperRuntimeConfig {
  return {
    remote: {
      host,
      port: 51820
    }
  } as AmneziaHelperRuntimeConfig
}
