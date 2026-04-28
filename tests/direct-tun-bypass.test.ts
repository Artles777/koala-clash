import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  injectAmneziaHelperTunBypass,
  createAmneziaHelperTunBypassResolved
} from '../src/core/routing/amnezia-helper-tun-bypass'
import {
  injectDirectTunBypass,
  resolveDirectTunBypass
} from '../src/core/routing/direct-tun-bypass'

describe('DIRECT rule TUN bypass compatibility', () => {
  it('does not inject when TUN is disabled', async () => {
    const config = {
      tun: { enable: false },
      rules: ['IP-CIDR,149.154.160.0/20,DIRECT']
    }
    const resolution = await resolveDirectTunBypass({ config, enabled: true })
    const injection = injectDirectTunBypass(config, resolution)

    assert.equal(resolution.status, 'not_required')
    assert.equal(injection.injected, false)
    assert.equal(injection.reason, 'tun_disabled')
    assert.deepEqual(injection.config, config)
  })

  it('does not inject when the compatibility feature is disabled', async () => {
    const config = {
      tun: { enable: true },
      rules: ['IP-CIDR,149.154.160.0/20,DIRECT']
    }
    const resolution = await resolveDirectTunBypass({ config, enabled: false })
    const injection = injectDirectTunBypass(config, resolution)

    assert.equal(resolution.status, 'disabled')
    assert.equal(injection.injected, false)
    assert.equal(injection.reason, 'feature_disabled')
    assert.deepEqual(injection.config.tun?.['route-exclude-address'], undefined)
  })

  it('injects IP-CIDR DIRECT rules as route exclusions', async () => {
    const config = {
      tun: { enable: true },
      rules: ['IP-CIDR,149.154.160.0/20,DIRECT']
    }
    const resolution = await resolveDirectTunBypass({ config, enabled: true })
    const injection = injectDirectTunBypass(config, resolution)

    assert.equal(resolution.status, 'resolved')
    assert.equal(resolution.active, true)
    assert.deepEqual(resolution.routeExcludeAddresses, ['149.154.160.0/20'])
    assert.equal(injection.injected, true)
    assert.deepEqual(injection.config.tun?.['route-exclude-address'], ['149.154.160.0/20'])
  })

  it('resolves DOMAIN and DOMAIN-SUFFIX DIRECT rules into route exclusions', async () => {
    const config = {
      tun: { enable: true },
      rules: ['DOMAIN,telegram.org,DIRECT', 'DOMAIN-SUFFIX,example.com,DIRECT']
    }
    const resolution = await resolveDirectTunBypass({
      config,
      enabled: true,
      lookup: async (hostname) =>
        hostname === 'telegram.org'
          ? [{ address: '149.154.167.99', family: 4 }]
          : [
              { address: '203.0.113.10', family: 4 },
              { address: '2001:db8::10', family: 6 }
            ]
    })
    const injection = injectDirectTunBypass(config, resolution)

    assert.equal(resolution.status, 'partial')
    assert.deepEqual(resolution.routeExcludeAddresses, [
      '149.154.167.99/32',
      '2001:db8::10/128',
      '203.0.113.10/32'
    ])
    assert.ok(
      resolution.warnings.some((warning) => warning.code === 'domain_suffix_apex_only')
    )
    assert.equal(injection.injected, true)
  })

  it('reports domain resolution failures without pretending bypass is active', async () => {
    const config = {
      tun: { enable: true },
      rules: ['DOMAIN,missing.example.test,DIRECT']
    }
    const resolution = await resolveDirectTunBypass({
      config,
      enabled: true,
      lookup: async () => {
        throw new Error('ENOTFOUND')
      }
    })
    const injection = injectDirectTunBypass(config, resolution)

    assert.equal(resolution.status, 'failed')
    assert.equal(resolution.active, false)
    assert.deepEqual(resolution.routeExcludeAddresses, [])
    assert.equal(resolution.warnings[0].code, 'domain_resolution_failed')
    assert.equal(injection.injected, false)
    assert.equal(injection.reason, 'bypass_not_resolved')
  })

  it('coexists with helper TUN bypass and removes duplicate exclusions', async () => {
    const helperBypass = createAmneziaHelperTunBypassResolved({
      endpointHost: 'vpn.example.com',
      ips: ['203.0.113.10']
    })
    const config = {
      tun: {
        enable: true,
        'route-exclude-address': ['10.0.0.1/32']
      },
      rules: ['IP-CIDR,203.0.113.10/32,DIRECT', 'IP-CIDR,149.154.160.0/20,DIRECT']
    }
    const withHelper = injectAmneziaHelperTunBypass(config, helperBypass).config
    const directResolution = await resolveDirectTunBypass({
      config: withHelper,
      enabled: true
    })
    const withDirect = injectDirectTunBypass(withHelper, directResolution).config

    assert.deepEqual(withDirect.tun?.['route-exclude-address'], [
      '10.0.0.1/32',
      '149.154.160.0/20',
      '203.0.113.10/32'
    ])
  })

  it('keeps PROCESS-NAME DIRECT as unsupported for real TUN bypass', async () => {
    const config = {
      tun: { enable: true },
      rules: ['PROCESS-NAME,UnknownApp,DIRECT']
    }
    const resolution = await resolveDirectTunBypass({ config, enabled: true })
    const injection = injectDirectTunBypass(config, resolution)

    assert.equal(resolution.status, 'failed')
    assert.equal(resolution.unsupportedRuleCount, 1)
    assert.equal(resolution.unsupportedRules[0].reasonCode, 'process_name_unsupported')
    assert.equal(injection.injected, false)
    assert.equal(injection.reason, 'bypass_not_resolved')
  })

  it('uses the built-in Telegram preset for PROCESS-NAME DIRECT under TUN', async () => {
    const config = {
      tun: { enable: true },
      rules: ['PROCESS-NAME,Telegram,DIRECT']
    }
    const resolution = await resolveDirectTunBypass({ config, enabled: true })
    const injection = injectDirectTunBypass(config, resolution)

    assert.equal(resolution.status, 'partial')
    assert.equal(resolution.active, true)
    assert.equal(resolution.supportedRuleCount, 1)
    assert.equal(resolution.unsupportedRuleCount, 0)
    assert.ok(resolution.routeExcludeAddresses.includes('149.154.160.0/20'))
    assert.ok(resolution.routeExcludeAddresses.includes('91.108.4.0/22'))
    assert.ok(resolution.routeExcludeAddresses.includes('2001:67c:4e8::/48'))
    assert.ok(
      resolution.warnings.some((warning) => warning.code === 'process_name_preset_applied')
    )
    assert.equal(injection.injected, true)
    assert.ok(injection.config.tun?.['route-exclude-address']?.includes('149.154.160.0/20'))
  })
})
