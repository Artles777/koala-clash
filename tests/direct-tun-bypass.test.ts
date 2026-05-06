import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  injectDirectTunBypass,
  resolveDirectTunBypass
} from '../src/core/routing/direct-tun-bypass'
import {
  getLastDirectTunBypass,
  updateDirectTunBypassState
} from '../src/main/runtime/direct-tun-bypass-state'

describe('DIRECT rule TUN bypass compatibility', () => {
  it('does not inject when TUN is disabled', async () => {
    const config = {
      tun: { enable: false },
      rules: ['IP-CIDR,149.154.160.0/20,DIRECT']
    }
    const resolution = await resolveDirectTunBypass({ config, enabled: true })
    const injection = injectDirectTunBypass(config, resolution)

    assert.equal(resolution.status, 'not_required')
    assert.equal(resolution.directExcludeOverallStatus, 'inactive')
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
    assert.equal(resolution.directExcludeOverallStatus, 'inactive')
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
    assert.equal(resolution.directExcludeOverallStatus, 'active')
    assert.equal(resolution.active, true)
    assert.equal(resolution.excludableRuleCount, 1)
    assert.equal(resolution.failedRuleCount, 0)
    assert.deepEqual(resolution.routeExcludeAddresses, ['149.154.160.0/20'])
    assert.deepEqual(resolution.resolvedRules, [
      {
        rule: 'IP-CIDR,149.154.160.0/20,DIRECT',
        ruleType: 'IP-CIDR',
        value: '149.154.160.0/20',
        routeExcludeAddresses: ['149.154.160.0/20'],
        coverage: 'exact_route_exclude'
      }
    ])
    assert.equal(injection.injected, true)
    assert.deepEqual(injection.config.tun?.['route-exclude-address'], ['149.154.160.0/20'])
    assert.deepEqual(config.tun?.['route-exclude-address'], undefined)
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
    assert.equal(resolution.directExcludeOverallStatus, 'partial')
    assert.equal(resolution.excludableRuleCount, 2)
    assert.equal(resolution.partialRuleCount, 1)
    assert.equal(resolution.failedRuleCount, 0)
    assert.deepEqual(resolution.routeExcludeAddresses, [
      '149.154.167.99/32',
      '2001:db8::10/128',
      '203.0.113.10/32'
    ])
    assert.deepEqual(resolution.resolvedRules, [
      {
        rule: 'DOMAIN,telegram.org,DIRECT',
        ruleType: 'DOMAIN',
        value: 'telegram.org',
        routeExcludeAddresses: ['149.154.167.99/32'],
        coverage: 'resolved_ip_route_exclude'
      },
      {
        rule: 'DOMAIN-SUFFIX,example.com,DIRECT',
        ruleType: 'DOMAIN-SUFFIX',
        value: 'example.com',
        routeExcludeAddresses: ['2001:db8::10/128', '203.0.113.10/32'],
        coverage: 'partial_resolved_ip_route_exclude'
      }
    ])
    assert.ok(resolution.warnings.some((warning) => warning.code === 'domain_suffix_apex_only'))
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
    assert.equal(resolution.directExcludeOverallStatus, 'blocked')
    assert.equal(resolution.active, false)
    assert.equal(resolution.failedRuleCount, 1)
    assert.deepEqual(resolution.routeExcludeAddresses, [])
    assert.equal(resolution.warnings[0].code, 'domain_resolution_failed')
    assert.equal(injection.injected, false)
    assert.equal(injection.reason, 'bypass_not_resolved')
  })

  it('merges with existing route exclusions and removes duplicates', async () => {
    const config = {
      tun: {
        enable: true,
        'route-exclude-address': ['10.0.0.1/32', '203.0.113.10/32']
      },
      rules: ['IP-CIDR,203.0.113.10/32,DIRECT', 'IP-CIDR,149.154.160.0/20,DIRECT']
    }
    const directResolution = await resolveDirectTunBypass({
      config,
      enabled: true
    })
    const withDirect = injectDirectTunBypass(config, directResolution).config

    assert.deepEqual(withDirect.tun?.['route-exclude-address'], [
      '10.0.0.1/32',
      '149.154.160.0/20',
      '203.0.113.10/32'
    ])
  })

  it('keeps PROCESS-NAME DIRECT as unsupported for true DIRECT exclude', async () => {
    const config = {
      tun: { enable: true },
      rules: ['PROCESS-NAME,UnknownApp,DIRECT']
    }
    const resolution = await resolveDirectTunBypass({ config, enabled: true })
    const injection = injectDirectTunBypass(config, resolution)

    assert.equal(resolution.status, 'failed')
    assert.equal(resolution.directExcludeOverallStatus, 'blocked')
    assert.equal(resolution.unsupportedRuleCount, 1)
    assert.equal(resolution.unsupportedRules[0].reasonCode, 'process_name_unsupported')
    assert.equal(injection.injected, false)
    assert.equal(injection.reason, 'bypass_not_resolved')
  })

  it('does not pretend Telegram PROCESS-NAME DIRECT is a true TUN exclude', async () => {
    const config = {
      tun: { enable: true },
      rules: ['PROCESS-NAME,Telegram,DIRECT']
    }
    const resolution = await resolveDirectTunBypass({ config, enabled: true })
    const injection = injectDirectTunBypass(config, resolution)

    assert.equal(resolution.status, 'failed')
    assert.equal(resolution.directExcludeOverallStatus, 'blocked')
    assert.equal(resolution.active, false)
    assert.equal(resolution.supportedRuleCount, 0)
    assert.equal(resolution.unsupportedRuleCount, 1)
    assert.deepEqual(resolution.routeExcludeAddresses, [])
    assert.equal(resolution.unsupportedRules[0].reasonCode, 'process_name_unsupported')
    assert.equal(injection.injected, false)
    assert.equal(injection.reason, 'bypass_not_resolved')
  })

  it('keeps DOMAIN-KEYWORD DIRECT unsupported for deterministic route excludes', async () => {
    const config = {
      tun: { enable: true },
      rules: ['DOMAIN-KEYWORD,telegram,DIRECT']
    }
    const resolution = await resolveDirectTunBypass({ config, enabled: true })

    assert.equal(resolution.status, 'failed')
    assert.equal(resolution.unsupportedRuleCount, 1)
    assert.equal(resolution.unsupportedRules[0].reasonCode, 'domain_keyword_unsupported')
  })
})

describe('direct-tun-bypass cached state', () => {
  it('clears the cached resolution when stopCore passes undefined', async () => {
    const config = {
      tun: { enable: true },
      rules: ['IP-CIDR,149.154.160.0/20,DIRECT']
    }
    const resolution = await resolveDirectTunBypass({ config, enabled: true })

    updateDirectTunBypassState(resolution)
    const stored = getLastDirectTunBypass()
    assert.equal(stored?.active, true)
    assert.deepEqual(stored?.routeExcludeAddresses, ['149.154.160.0/20'])

    updateDirectTunBypassState(undefined)
    assert.equal(getLastDirectTunBypass(), undefined)
  })
})
