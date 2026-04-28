import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createAmneziaHelperRule } from '../src/core/routing/amnezia-helper-rules'
import {
  evaluateAmneziaHelperTunRuleReliability,
  readAmneziaHelperTunDnsRuntimeState
} from '../src/core/routing/amnezia-helper-tun-rule-reliability'
import { ensureAmneziaTunRuntimeCompatibility } from '../src/core/routing/amnezia-tun-runtime-compatibility'

type TunCompatibilityConfig = Parameters<typeof ensureAmneziaTunRuntimeCompatibility>[0]

describe('Amnezia TUN runtime compatibility', () => {
  it('does not patch non-TUN configs', () => {
    const config: TunCompatibilityConfig = {
      tun: { enable: false }
    }

    const result = ensureAmneziaTunRuntimeCompatibility(config)

    assert.equal(result.applied, false)
    assert.equal(result.config, config)
    assert.deepEqual(result.changes, [])
  })

  it('adds DNS hijack, Mihomo DNS, and sniffer for Amnezia TUN runtime configs', () => {
    const config: TunCompatibilityConfig = {
      tun: { enable: true }
    }
    const result = ensureAmneziaTunRuntimeCompatibility(config)

    assert.equal(result.applied, true)
    assert.deepEqual(result.config.tun?.['dns-hijack'], ['any:53'])
    assert.equal(result.config.dns?.enable, true)
    assert.equal(result.config.dns?.['enhanced-mode'], 'fake-ip')
    assert.equal(result.config.dns?.['fake-ip-range'], '198.18.0.1/16')
    assert.deepEqual(result.config.dns?.nameserver, [
      'https://1.1.1.1/dns-query',
      'https://8.8.8.8/dns-query'
    ])
    assert.equal(result.config.sniffer?.enable, true)
    assert.equal(result.config.sniffer?.['force-dns-mapping'], true)
    assert.equal(result.config.sniffer?.['parse-pure-ip'], true)
    assert.deepEqual(result.config.sniffer?.sniff?.TLS?.ports, [443])
  })

  it('keeps Amnezia TUN IPv4-only when global IPv6 is disabled', () => {
    const config: TunCompatibilityConfig = {
      ipv6: false,
      tun: { enable: true }
    }
    const result = ensureAmneziaTunRuntimeCompatibility(config)

    assert.equal(result.applied, true)
    assert.deepEqual(result.config.tun?.['inet6-address'], [])
    assert.equal(result.config.dns?.ipv6, false)
    assert.ok(result.changes.includes('tun_ipv6_address_disabled'))
    assert.ok(result.changes.includes('dns_ipv6_disabled'))
  })

  it('preserves explicit DNS and sniffer choices while filling missing TUN pieces', () => {
    const result = ensureAmneziaTunRuntimeCompatibility({
      tun: { enable: true, 'dns-hijack': ['198.18.0.2:53'] },
      dns: {
        enable: true,
        'enhanced-mode': 'redir-host',
        nameserver: ['https://9.9.9.9/dns-query'],
        'default-nameserver': ['tls://9.9.9.9']
      },
      sniffer: {
        enable: true,
        'force-dns-mapping': true,
        'parse-pure-ip': true,
        sniff: {
          TLS: { ports: [8443] }
        }
      }
    } as TunCompatibilityConfig)

    assert.deepEqual(result.config.tun?.['dns-hijack'], ['198.18.0.2:53'])
    assert.equal(result.config.dns?.['enhanced-mode'], 'redir-host')
    assert.deepEqual(result.config.dns?.nameserver, ['https://9.9.9.9/dns-query'])
    assert.deepEqual(result.config.sniffer?.sniff?.TLS?.ports, [8443])
  })

  it('makes domain helper rules reliable under TUN for the generated runtime state', () => {
    const result = ensureAmneziaTunRuntimeCompatibility({
      tun: { enable: true }
    } as TunCompatibilityConfig)
    const state = readAmneziaHelperTunDnsRuntimeState(result.config)
    const reliability = evaluateAmneziaHelperTunRuleReliability({
      ...state,
      rules: [
        createAmneziaHelperRule({
          id: 'rule-1',
          type: 'DOMAIN-SUFFIX',
          value: 'linkedin.com'
        })
      ]
    })

    assert.equal(reliability.reliability, 'reliable')
    assert.equal(reliability.primaryReason, 'domain_rules_fake_ip_dns_hijack')
  })
})
