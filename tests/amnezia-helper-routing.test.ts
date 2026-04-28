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
  ensureAmneziaCompatibilityProxyGroup,
  injectAmneziaCompatibilityTcpOnlyUdpGuardRules
} from '../src/core/routing/amnezia-compatibility-proxy-group'
import {
  ensureMihomoRuleProviderPresets,
  KOALA_RU_BUNDLE_RULE_PROVIDER,
  KOALA_RU_BUNDLE_RULE_PROVIDER_NAME
} from '../src/core/routing/mihomo-rule-provider-presets'

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
    assert.deepEqual(lastItem(injected.config.proxies), {
      name: AMNEZIA_HELPER_OUTBOUND_NAME,
      type: 'socks5',
      server: '127.0.0.1',
      port: 19080,
      udp: false
    })
    assert.deepEqual(lastItem(injected.config['proxy-groups']), {
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
    assert.equal(lastItem(injected.config.proxies)?.udp, true)
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

  it('adds TCP-only UDP guard rules for Amnezia PROXY rules when helper UDP is not advertised', () => {
    const target = createAmneziaHelperRoutingTarget(createReadySession())
    const config = injectAmneziaCompatibilityTcpOnlyUdpGuardRules(
      {
        rules: [
          'DOMAIN-SUFFIX,linkedin.com,PROXY',
          'PROCESS-NAME,ChatGPT,PROXY',
          'DOMAIN-SUFFIX,example.com,DIRECT',
          'MATCH,PROXY',
          'MATCH,DIRECT'
        ]
      },
      target
    )

    assert.deepEqual(config.rules, [
      'AND,((NETWORK,UDP),(DST-PORT,443),(DOMAIN-SUFFIX,linkedin.com)),REJECT',
      'AND,((NETWORK,UDP),(DST-PORT,443),(PROCESS-NAME,ChatGPT)),REJECT',
      'AND,((NETWORK,UDP),(DST-PORT,443)),REJECT',
      'DOMAIN-SUFFIX,linkedin.com,PROXY',
      'PROCESS-NAME,ChatGPT,PROXY',
      'DOMAIN-SUFFIX,example.com,DIRECT',
      'MATCH,PROXY',
      'MATCH,DIRECT'
    ])
  })

  it('does not add TCP-only UDP guard rules when helper UDP is validated', () => {
    const target = createAmneziaHelperRoutingTarget({
      ...createReadySession(),
      udpCapability: createAmneziaHelperUdpCapability(
        'supported',
        true,
        'udp_associate_validated',
        1710000000000
      )
    })
    const config = injectAmneziaCompatibilityTcpOnlyUdpGuardRules(
      {
        rules: ['DOMAIN-SUFFIX,linkedin.com,PROXY', 'MATCH,DIRECT']
      },
      target
    )

    assert.deepEqual(config.rules, ['DOMAIN-SUFFIX,linkedin.com,PROXY', 'MATCH,DIRECT'])
  })

  it('injects the RU bundle rule-provider only when the runtime rules reference it', () => {
    const withoutPreset = ensureMihomoRuleProviderPresets({
      rules: ['MATCH,DIRECT']
    })

    assert.equal(withoutPreset['rule-providers'], undefined)

    const withPreset = ensureMihomoRuleProviderPresets({
      rules: [`RULE-SET,${KOALA_RU_BUNDLE_RULE_PROVIDER_NAME},PROXY`, 'MATCH,DIRECT']
    })

    assert.deepEqual(withPreset['rule-providers'], {
      [KOALA_RU_BUNDLE_RULE_PROVIDER_NAME]: KOALA_RU_BUNDLE_RULE_PROVIDER
    })
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

function lastItem<T>(items: T[] | undefined): T | undefined {
  return items ? items[items.length - 1] : undefined
}
