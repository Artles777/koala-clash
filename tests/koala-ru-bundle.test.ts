import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createKoalaRuBundleRule,
  pinKoalaRuBundleRulesLast
} from '../src/core/routing/mihomo-rule-provider-presets'

describe('pinKoalaRuBundleRulesLast', () => {
  it('preserves the original target when pinning before MATCH', () => {
    const rules = [
      'DOMAIN,foo.com,REJECT',
      'RULE-SET,ru-bundle,🚀 PROXY',
      'GEOIP,CN,DIRECT',
      'MATCH,Auto'
    ]

    const pinned = pinKoalaRuBundleRulesLast(rules)

    assert.deepEqual(pinned, [
      'DOMAIN,foo.com,REJECT',
      'GEOIP,CN,DIRECT',
      'RULE-SET,ru-bundle,🚀 PROXY',
      'MATCH,Auto'
    ])
  })

  it('preserves trailing flags such as no-resolve', () => {
    const rules = ['RULE-SET,ru-bundle,PROXY,no-resolve', 'MATCH,DIRECT']

    const [pinned] = pinKoalaRuBundleRulesLast(rules)

    assert.equal(pinned, 'RULE-SET,ru-bundle,PROXY,no-resolve')
  })

  it('uses the last rule target when multiple ru-bundle rules are present', () => {
    const rules = [
      'RULE-SET,ru-bundle,DIRECT',
      'GEOIP,RU,DIRECT',
      'RULE-SET,ru-bundle,🚀 PROXY',
      'MATCH,DIRECT'
    ]

    const pinned = pinKoalaRuBundleRulesLast(rules)

    assert.deepEqual(pinned, [
      'GEOIP,RU,DIRECT',
      'RULE-SET,ru-bundle,🚀 PROXY',
      'MATCH,DIRECT'
    ])
  })

  it('falls back to the default rule when no ru-bundle rule is configured', () => {
    const rules = ['GEOIP,CN,DIRECT', 'MATCH,Auto']

    assert.deepEqual(pinKoalaRuBundleRulesLast(rules), rules)
  })

  it('emits the default ru-bundle rule when seeded via createKoalaRuBundleRule', () => {
    const seeded = createKoalaRuBundleRule()
    const pinned = pinKoalaRuBundleRulesLast([seeded, 'MATCH,DIRECT'])
    assert.deepEqual(pinned, ['RULE-SET,ru-bundle,PROXY', 'MATCH,DIRECT'])
  })
})
