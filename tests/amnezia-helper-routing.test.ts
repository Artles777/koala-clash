import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  AMNEZIA_HELPER_GROUP_NAME,
  AMNEZIA_HELPER_OUTBOUND_NAME,
  AmneziaHelperRoutingSessionLike,
  MihomoRoutingConfig,
  createAmneziaHelperRoutingTarget,
  injectAmneziaHelperRoutingTarget
} from '../src/core/routing/amnezia-helper-routing'
import { createAmneziaHelperUdpCapability } from '../src/core/routing/amnezia-helper-udp-capability'
import {
  ensureAmneziaCompatibilityFallbackRule,
  ensureAmneziaCompatibilityProxyGroup
} from '../src/core/routing/amnezia-compatibility-proxy-group'

describe('Amnezia helper routing integration', () => {
  it('generates a TCP-only Mihomo local proxy outbound until UDP is validated', () => {
    const target = createAmneziaHelperRoutingTarget(createReadySession(), () => 1710000000000)
    const result = injectAmneziaHelperRoutingTarget({
      proxies: [{ name: 'DIRECT', type: 'direct' }],
      'proxy-groups': [{ name: 'Auto', type: 'select', proxies: ['DIRECT'] }],
      rules: ['MATCH,Auto']
    })

    const injected = injectAmneziaHelperRoutingTarget(result.config, target)

    assert.equal(target.status, 'injected')
    assert.equal(injected.injected, true)
    assert.deepEqual(injected.config.proxies?.at(-1), {
      name: AMNEZIA_HELPER_OUTBOUND_NAME,
      type: 'socks5',
      server: '127.0.0.1',
      port: 19080,
      udp: false
    })
    assert.deepEqual(injected.config['proxy-groups']?.at(-1), {
      name: AMNEZIA_HELPER_GROUP_NAME,
      type: 'select',
      proxies: [AMNEZIA_HELPER_OUTBOUND_NAME]
    })
    assert.deepEqual(injected.config.rules, ['MATCH,Auto'])
  })

  it('advertises UDP only when helper UDP capability is supported and validated', () => {
    const target = createAmneziaHelperRoutingTarget({
      ...createReadySession(),
      udpCapability: createAmneziaHelperUdpCapability(
        'supported',
        true,
        'udp_associate_validated',
        1710000000000
      )
    })

    const config: MihomoRoutingConfig = { proxies: [], 'proxy-groups': [] }
    const injected = injectAmneziaHelperRoutingTarget(config, target)

    assert.equal(injected.injected, true)
    assert.equal(injected.config.proxies?.at(-1)?.udp, true)
  })

  it('does not generate a routing target for stopped helper sessions', () => {
    const target = createAmneziaHelperRoutingTarget({
      ...createReadySession(),
      status: 'stopped',
      readiness: 'unknown'
    })
    const result = injectAmneziaHelperRoutingTarget({}, target)

    assert.equal(target.status, 'unavailable')
    assert.equal(target.reason, 'helper_stopped')
    assert.equal(result.injected, false)
    assert.equal((result.config as MihomoRoutingConfig).proxies, undefined)
  })

  it('does not generate a routing target without a valid local endpoint', () => {
    const target = createAmneziaHelperRoutingTarget({
      profileId: 'amnezia-1',
      status: 'running',
      readiness: 'ready'
    })
    const result = injectAmneziaHelperRoutingTarget({}, target)

    assert.equal(target.status, 'unavailable')
    assert.equal(target.reason, 'missing_endpoint')
    assert.equal(result.injected, false)
  })

  it('keeps helper routing separate when generated names conflict with user config', () => {
    const target = createAmneziaHelperRoutingTarget(createReadySession())
    const result = injectAmneziaHelperRoutingTarget(
      {
        proxies: [{ name: AMNEZIA_HELPER_OUTBOUND_NAME, type: 'direct' }],
        'proxy-groups': []
      },
      target
    )

    assert.equal(result.injected, false)
    assert.equal(result.reason, 'name_conflict')
    assert.equal(result.config.proxies?.length, 1)
  })

  it('makes the Amnezia PROXY group point only to the ready helper target', () => {
    const target = createAmneziaHelperRoutingTarget(createReadySession())
    const config = ensureAmneziaCompatibilityProxyGroup(
      {
        'proxy-groups': [{ name: 'PROXY', type: 'select', proxies: ['DIRECT'] }]
      },
      target
    )

    assert.deepEqual(config['proxy-groups']?.[0], {
      name: 'PROXY',
      type: 'select',
      proxies: [AMNEZIA_HELPER_GROUP_NAME]
    })
  })

  it('keeps Amnezia PROXY blocked while the helper target is unavailable', () => {
    const config = ensureAmneziaCompatibilityProxyGroup({
      'proxy-groups': [{ name: 'PROXY', type: 'select', proxies: [AMNEZIA_HELPER_GROUP_NAME] }]
    })

    assert.deepEqual(config['proxy-groups']?.[0], {
      name: 'PROXY',
      type: 'select',
      proxies: ['REJECT']
    })
  })

  it('adds a reject fallback for Amnezia profiles while the helper target is unavailable', () => {
    const config = ensureAmneziaCompatibilityFallbackRule({
      rules: ['DOMAIN-SUFFIX,linkedin.com,PROXY']
    })

    assert.deepEqual(config.rules, ['DOMAIN-SUFFIX,linkedin.com,PROXY', 'MATCH,REJECT'])
  })

  it('replaces a direct fallback while the Amnezia helper target is unavailable', () => {
    const config = ensureAmneziaCompatibilityFallbackRule({
      rules: ['DOMAIN-SUFFIX,linkedin.com,PROXY', 'MATCH,DIRECT']
    })

    assert.deepEqual(config.rules, ['DOMAIN-SUFFIX,linkedin.com,PROXY', 'MATCH,REJECT'])
  })

  it('keeps fallback rules unchanged when the helper target is injected', () => {
    const target = createAmneziaHelperRoutingTarget(createReadySession())
    const config = ensureAmneziaCompatibilityFallbackRule(
      {
        rules: ['DOMAIN-SUFFIX,linkedin.com,PROXY', 'MATCH,DIRECT']
      },
      target
    )

    assert.deepEqual(config.rules, ['DOMAIN-SUFFIX,linkedin.com,PROXY', 'MATCH,DIRECT'])
  })
})

function createReadySession(): AmneziaHelperRoutingSessionLike {
  return {
    profileId: 'amnezia-1',
    status: 'running',
    readiness: 'ready',
    localEndpoint: {
      host: '127.0.0.1',
      port: 19080,
      protocol: 'socks5'
    }
  }
}
