import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createAmneziaHelperRule } from '../src/core/routing/amnezia-helper-rules'
import {
  evaluateAmneziaHelperRoutingDiagnostic,
  AmneziaHelperRoutingDiagnosticInput
} from '../src/core/routing/amnezia-helper-routing-diagnostics'
import { AmneziaHelperRoutingTarget } from '../src/core/routing/amnezia-helper-routing'

describe('Amnezia helper routing diagnostics', () => {
  it('matches exact DOMAIN rules', () => {
    const result = evaluate({ value: 'example.com' })

    assert.equal(result.matched, true)
    assert.equal(result.matchedRuleType, 'DOMAIN')
    assert.equal(result.matchedRuleValue, 'example.com')
    assert.equal(result.reasonCode, 'helper_rule_match')
    assert.equal(result.resultingTarget?.groupName, 'AMNEZIA_HELPER')
  })

  it('matches DOMAIN-SUFFIX rules', () => {
    const result = evaluate({ value: 'api.suffix.test' })

    assert.equal(result.matched, true)
    assert.equal(result.matchedRuleType, 'DOMAIN-SUFFIX')
    assert.equal(result.matchedRuleValue, 'suffix.test')
  })

  it('matches DOMAIN-KEYWORD rules', () => {
    const result = evaluate({ url: 'https://cdn-keyword.example/path' })

    assert.equal(result.matched, true)
    assert.equal(result.matchedRuleType, 'DOMAIN-KEYWORD')
    assert.equal(result.input.domain, 'cdn-keyword.example')
  })

  it('matches IPv4 IP-CIDR rules', () => {
    const result = evaluate({ value: '10.20.30.40' })

    assert.equal(result.matched, true)
    assert.equal(result.matchedRuleType, 'IP-CIDR')
    assert.equal(result.matchedRuleValue, '10.0.0.0/8')
    assert.equal(result.input.ip, '10.20.30.40')
  })

  it('returns no_rule_match for unmatched inputs', () => {
    const result = evaluate({ value: 'unmatched.example' })

    assert.equal(result.matched, false)
    assert.equal(result.reasonCode, 'no_rule_match')
    assert.equal(result.helperInjected, true)
  })

  it('reports helper_not_injected when a matching rule exists without runtime target', () => {
    const result = evaluate({ value: 'example.com' }, null)

    assert.equal(result.matched, true)
    assert.equal(result.helperInjected, false)
    assert.equal(result.reasonCode, 'helper_not_injected')
  })

  it('reports helper_not_ready for unavailable runtime targets that are still starting', () => {
    const result = evaluate(
      { value: 'example.com' },
      {
        ...createInjectedTarget(),
        status: 'unavailable',
        endpoint: undefined,
        reason: 'helper_not_ready'
      }
    )

    assert.equal(result.matched, true)
    assert.equal(result.helperReady, false)
    assert.equal(result.reasonCode, 'helper_not_ready')
  })

  it('handles invalid input explicitly', () => {
    const result = evaluate({ value: 'not a valid host' })

    assert.equal(result.matched, false)
    assert.equal(result.reasonCode, 'invalid_input')
  })
})

function evaluate(
  input: AmneziaHelperRoutingDiagnosticInput,
  target: AmneziaHelperRoutingTarget | null = createInjectedTarget()
) {
  return evaluateAmneziaHelperRoutingDiagnostic({
    input,
    target: target ?? undefined,
    rules: [
      createAmneziaHelperRule({
        id: 'rule-domain',
        type: 'DOMAIN',
        value: 'example.com'
      }),
      createAmneziaHelperRule({
        id: 'rule-suffix',
        type: 'DOMAIN-SUFFIX',
        value: 'suffix.test'
      }),
      createAmneziaHelperRule({
        id: 'rule-keyword',
        type: 'DOMAIN-KEYWORD',
        value: 'keyword'
      }),
      createAmneziaHelperRule({
        id: 'rule-cidr',
        type: 'IP-CIDR',
        value: '10.0.0.0/8'
      })
    ]
  })
}

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
