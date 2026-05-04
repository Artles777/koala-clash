import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  AMNEZIA_HELPER_RULE_TARGET,
  createAmneziaHelperRule,
  injectAmneziaHelperRules,
  serializeAmneziaHelperRule,
  validateAmneziaHelperRule
} from '../src/core/routing/amnezia-helper-rules'
import { AmneziaHelperRoutingTarget } from '../src/core/routing/amnezia-helper-routing'

describe('Amnezia helper routing rules', () => {
  it('validates and serializes supported MVP rule types', () => {
    const rule = createAmneziaHelperRule({
      id: 'rule-1',
      type: 'DOMAIN-SUFFIX',
      value: 'Example.COM',
      now: 1710000000000
    })

    assert.equal(rule.value, 'example.com')
    assert.equal(rule.target, AMNEZIA_HELPER_RULE_TARGET)
    assert.deepEqual(validateAmneziaHelperRule(rule), [])
    assert.equal(serializeAmneziaHelperRule(rule), 'DOMAIN-SUFFIX,example.com,AMNEZIA_HELPER')
  })

  it('supports process-name rules using names from Mihomo logs', () => {
    const rule = createAmneziaHelperRule({
      id: 'process-rule',
      type: 'PROCESS-NAME',
      value: 'Yandex Helper',
      now: 1710000000000
    })

    assert.equal(rule.value, 'Yandex Helper')
    assert.deepEqual(validateAmneziaHelperRule(rule), [])
    assert.equal(serializeAmneziaHelperRule(rule), 'PROCESS-NAME,Yandex Helper,AMNEZIA_HELPER')
  })

  it('rejects empty, malformed, and duplicate rules', () => {
    const existing = [
      createAmneziaHelperRule({
        id: 'rule-1',
        type: 'DOMAIN',
        value: 'example.com'
      })
    ]

    assert.ok(
      validateAmneziaHelperRule(
        createAmneziaHelperRule({ id: 'rule-2', type: 'DOMAIN', value: '' })
      ).some((issue) => issue.code === 'empty_value')
    )
    assert.ok(
      validateAmneziaHelperRule(
        createAmneziaHelperRule({ id: 'rule-3', type: 'DOMAIN-KEYWORD', value: 'bad value' })
      ).some((issue) => issue.code === 'invalid_value')
    )
    assert.ok(
      validateAmneziaHelperRule(
        createAmneziaHelperRule({ id: 'rule-4', type: 'IP-CIDR', value: '999.0.0.0/8' })
      ).some((issue) => issue.code === 'invalid_value')
    )
    assert.ok(
      validateAmneziaHelperRule(
        createAmneziaHelperRule({ id: 'rule-5', type: 'DOMAIN', value: 'example.com' }),
        existing
      ).some((issue) => issue.code === 'duplicate_rule')
    )
  })

  it('prepends enabled helper rules only when the helper target is injected', () => {
    const rules = [
      createAmneziaHelperRule({
        id: 'rule-1',
        type: 'DOMAIN-SUFFIX',
        value: 'example.com'
      }),
      createAmneziaHelperRule({
        id: 'rule-2',
        type: 'DOMAIN-KEYWORD',
        value: 'internal',
        enabled: false
      }),
      createAmneziaHelperRule({
        id: 'rule-3',
        type: 'IP-CIDR',
        value: '10.0.0.0/8'
      }),
      createAmneziaHelperRule({
        id: 'rule-4',
        type: 'PROCESS-NAME',
        value: 'Yandex Helper'
      })
    ]
    const result = injectAmneziaHelperRules(
      {
        rules: ['MATCH,DIRECT']
      },
      createInjectedTarget(),
      rules
    )

    assert.equal(result.injected, true)
    assert.deepEqual(result.serializedRules, [
      'DOMAIN-SUFFIX,example.com,AMNEZIA_HELPER',
      'IP-CIDR,10.0.0.0/8,AMNEZIA_HELPER',
      'PROCESS-NAME,Yandex Helper,AMNEZIA_HELPER'
    ])
    assert.deepEqual(result.config.rules, [
      'DOMAIN-SUFFIX,example.com,AMNEZIA_HELPER',
      'IP-CIDR,10.0.0.0/8,AMNEZIA_HELPER',
      'PROCESS-NAME,Yandex Helper,AMNEZIA_HELPER',
      'MATCH,DIRECT'
    ])
  })

  it('omits helper rules when the helper target is unavailable', () => {
    const result = injectAmneziaHelperRules(
      {
        rules: ['MATCH,DIRECT']
      },
      {
        ...createInjectedTarget(),
        status: 'unavailable',
        reason: 'helper_stopped'
      },
      [
        createAmneziaHelperRule({
          id: 'rule-1',
          type: 'DOMAIN-SUFFIX',
          value: 'example.com'
        })
      ]
    )

    assert.equal(result.injected, false)
    assert.deepEqual(result.config.rules, ['MATCH,DIRECT'])
  })
})

function createInjectedTarget(): AmneziaHelperRoutingTarget {
  return {
    profileId: 'amnezia-1',
    groupName: 'AMNEZIA_HELPER',
    outboundName: 'AMNEZIA_HELPER_PROXY',
    status: 'injected',
    endpoint: {
      host: '127.0.0.1',
      port: 19080,
      protocol: 'socks5'
    },
    updatedAt: 1710000000000
  }
}
