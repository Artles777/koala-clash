import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { validateMihomoProfileShape } from '../src/core/profiles/profile-validation'

describe('validateMihomoProfileShape', () => {
  it('accepts a profile with at least one proxy of supported type', () => {
    const parsed = {
      proxies: [{ name: 'WG', type: 'wireguard' }]
    }
    assert.equal(validateMihomoProfileShape(parsed).valid, true)
  })

  it('accepts a profile that only declares proxy-groups', () => {
    const parsed = {
      'proxy-groups': [{ name: 'PROXY', type: 'select', proxies: ['DIRECT'] }]
    }
    assert.equal(validateMihomoProfileShape(parsed).valid, true)
  })

  it('rejects a non-object payload (placeholder, list, scalar)', () => {
    for (const placeholder of [null, undefined, 'plain string', 42, [{ proxies: [] }]]) {
      const result = validateMihomoProfileShape(placeholder)
      assert.equal(result.valid, false)
      assert.equal(result.failure?.code, 'not_object')
    }
  })

  it('rejects a config that has neither proxies nor proxy-groups', () => {
    const result = validateMihomoProfileShape({ rules: ['MATCH,DIRECT'] })
    assert.equal(result.valid, false)
    assert.equal(result.failure?.code, 'missing_proxies_and_groups')
  })

  it('rejects unsupported proxy types so unknown payloads are not activated', () => {
    const result = validateMihomoProfileShape({
      proxies: [{ name: 'P', type: 'shadowsocks-r' }]
    })
    assert.equal(result.valid, false)
    assert.equal(result.failure?.code, 'unsupported_proxy_type')
  })

  it('ignores entries that lack a type field instead of throwing', () => {
    const result = validateMihomoProfileShape({
      proxies: [{ name: 'partial' }, { name: 'WG', type: 'wireguard' }]
    })
    assert.equal(result.valid, true)
  })
})
