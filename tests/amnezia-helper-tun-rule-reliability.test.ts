import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createAmneziaHelperRule } from '../src/core/routing/amnezia-helper-rules'
import {
  evaluateAmneziaHelperTunRuleReliability,
  readAmneziaHelperTunDnsRuntimeState
} from '../src/core/routing/amnezia-helper-tun-rule-reliability'

describe('Amnezia helper TUN DNS rule reliability', () => {
  it('treats helper rule reliability as not applicable when TUN is disabled', () => {
    const result = evaluateAmneziaHelperTunRuleReliability({
      tunEnabled: false,
      dnsHijackEnabled: false,
      dnsEnhancedMode: 'unknown',
      rules: [domainRule()]
    })

    assert.equal(result.reliability, 'reliable')
    assert.equal(result.primaryReason, 'tun_disabled')
  })

  it('classifies TUN DNS hijack with fake-ip as reliable for domain rules', () => {
    const result = evaluateAmneziaHelperTunRuleReliability({
      tunEnabled: true,
      dnsEnabled: true,
      dnsHijackEnabled: true,
      dnsEnhancedMode: 'fake-ip',
      rules: [domainRule()]
    })

    assert.equal(result.reliability, 'reliable')
    assert.equal(result.primaryReason, 'domain_rules_fake_ip_dns_hijack')
    assert.equal(result.ruleTypes.hasDomainRules, true)
  })

  it('classifies domain rules without TUN DNS hijack as unlikely', () => {
    const result = evaluateAmneziaHelperTunRuleReliability({
      tunEnabled: true,
      dnsEnabled: true,
      dnsHijackEnabled: false,
      dnsEnhancedMode: 'fake-ip',
      rules: [domainRule()]
    })

    assert.equal(result.reliability, 'unlikely')
    assert.equal(result.primaryReason, 'domain_rules_dns_hijack_missing')
  })

  it('keeps IP-CIDR-only helper rules reliable under TUN', () => {
    const result = evaluateAmneziaHelperTunRuleReliability({
      tunEnabled: true,
      dnsEnabled: true,
      dnsHijackEnabled: false,
      dnsEnhancedMode: 'unknown',
      rules: [
        createAmneziaHelperRule({
          id: 'ip-rule',
          type: 'IP-CIDR',
          value: '203.0.113.0/24',
          now: 1710000000000
        })
      ]
    })

    assert.equal(result.reliability, 'reliable')
    assert.equal(result.primaryReason, 'ip_cidr_only')
    assert.equal(result.ruleTypes.hasIpCidrOnly, true)
  })

  it('keeps process-name helper rules independent from TUN DNS reliability', () => {
    const result = evaluateAmneziaHelperTunRuleReliability({
      tunEnabled: true,
      dnsEnabled: false,
      dnsHijackEnabled: false,
      dnsEnhancedMode: 'unknown',
      rules: [
        createAmneziaHelperRule({
          id: 'process-rule',
          type: 'PROCESS-NAME',
          value: 'Yandex Helper',
          now: 1710000000000
        })
      ]
    })

    assert.equal(result.reliability, 'reliable')
    assert.equal(result.primaryReason, 'non_domain_rules_only')
    assert.equal(result.ruleTypes.hasProcessRules, true)
  })

  it('classifies unknown DNS enhanced mode as degraded for domain rules', () => {
    const result = evaluateAmneziaHelperTunRuleReliability({
      tunEnabled: true,
      dnsEnabled: true,
      dnsHijackEnabled: true,
      dnsEnhancedMode: 'unknown',
      rules: [domainRule()]
    })

    assert.equal(result.reliability, 'degraded')
    assert.equal(result.primaryReason, 'domain_rules_unknown_dns_mode')
  })

  it('reads DNS hijack and enhanced mode from runtime config shape', () => {
    const result = readAmneziaHelperTunDnsRuntimeState({
      tun: {
        enable: true,
        'dns-hijack': ['any:53']
      },
      dns: {
        enable: true,
        'enhanced-mode': 'fake-ip'
      }
    })

    assert.deepEqual(result, {
      tunEnabled: true,
      dnsEnabled: true,
      dnsHijackEnabled: true,
      dnsEnhancedMode: 'fake-ip'
    })
  })
})

function domainRule() {
  return createAmneziaHelperRule({
    id: 'domain-rule',
    type: 'DOMAIN-SUFFIX',
    value: 'example.com',
    now: 1710000000000
  })
}
