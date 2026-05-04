import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  AmneziaProductionBackendConfigError,
  createAmneziaProductionBackendConfig,
  validateAmneziaProductionBackendConfig
} from '../src/core/profiles/amnezia-helper-production-config'
import { createAmneziaHelperRuntimeConfig } from '../src/core/profiles/amnezia-helper-runtime-config'
import { NormalizedProfile } from '../src/core/profiles/normalized-profile'

describe('Amnezia production helper config generation', () => {
  it('maps normalized runtime fields into the production backend config contract', () => {
    const runtimeConfig = createRuntimeConfig()
    const config = createAmneziaProductionBackendConfig(runtimeConfig)

    assert.equal(config.version, 1)
    assert.equal(config.profile.type, 'amneziawg')
    assert.equal(config.profile.sourceKind, 'self_contained')
    assert.equal(config.profile.name, 'Test Amnezia')
    assert.equal(config.profile.endpoint.host, 'vpn.example.com')
    assert.equal(config.profile.endpoint.port, 51820)
    assert.equal(config.profile.keys.privateKey, 'client-private-key')
    assert.equal(config.profile.keys.serverPublicKey, 'server-public-key')
    assert.equal(config.profile.keys.presharedKey, 'psk')
    assert.deepEqual(config.profile.interface.addresses, ['10.8.0.2/32'])
    assert.deepEqual(config.profile.interface.dns, ['1.1.1.1'])
    assert.equal(config.profile.interface.mtu, 1280)
    assert.deepEqual(config.profile.peer.allowedIPs, ['0.0.0.0/0', '::/0'])
    assert.equal(config.profile.peer.persistentKeepalive, 25)
    assert.equal(config.profile.amnezia?.Jc, '4')
    assert.equal(config.localProxy.listenHost, '127.0.0.1')
    assert.equal(config.localProxy.listenPort, 19080)
    assert.deepEqual(config.localProxy.protocols, ['socks5'])
    assert.equal(config.localProxy.udp, true)
  })

  it('rejects missing local proxy, allowed IPs, and interface addresses', () => {
    const issues = validateAmneziaProductionBackendConfig({
      ...createRuntimeConfig(),
      localProxy: {
        host: '127.0.0.1',
        port: 0,
        protocol: 'socks5'
      },
      interface: {
        addresses: [],
        dns: []
      },
      peer: {
        publicKey: 'server-public-key',
        allowedIps: []
      }
    })

    assert.ok(issues.some((issue) => issue.code === 'invalid_local_proxy'))
    assert.ok(issues.some((issue) => issue.code === 'missing_allowed_ips'))
    assert.ok(issues.some((issue) => issue.code === 'missing_interface_address'))
  })

  it('throws a structured error for unsupported backend config', () => {
    assert.throws(
      () =>
        createAmneziaProductionBackendConfig({
          ...createRuntimeConfig(),
          protocol: 'openvpn'
        }),
      (error) =>
        error instanceof AmneziaProductionBackendConfigError &&
        error.issues.some((issue) => issue.code === 'unsupported_protocol')
    )
  })
})

function createRuntimeConfig() {
  return createAmneziaHelperRuntimeConfig(createNormalizedProfile(), {
    backendMode: 'production',
    localProxy: {
      host: '127.0.0.1',
      port: 19080,
      protocol: 'socks5'
    },
    generatedAt: 1710000000000,
    allowEphemeralPort: false
  })
}

function createNormalizedProfile(): NormalizedProfile {
  return {
    id: 'amnezia-1',
    name: 'Test Amnezia',
    sourceId: 'source-1',
    protocol: 'amneziawg',
    enabled: true,
    transport: {
      type: 'udp',
      endpoint: {
        host: 'vpn.example.com',
        port: 51820
      },
      mtu: 1280
    },
    auth: {
      clientPrivateKey: 'client-private-key',
      presharedKey: 'psk'
    },
    interface: {
      addresses: ['10.8.0.2/32'],
      dns: ['1.1.1.1'],
      mtu: 1280
    },
    peer: {
      endpoint: 'vpn.example.com:51820',
      publicKey: 'server-public-key',
      allowedIps: ['0.0.0.0/0', '::/0'],
      persistentKeepalive: 25
    },
    amnezia: {
      container: 'amnezia-awg',
      protocolVersion: 'awg',
      obfuscation: {
        junkPacketCount: '4'
      }
    },
    metadata: {
      importedAt: 1710000000000,
      decodedFormat: 'json',
      sourceType: 'amnezia_vpn_uri',
      warnings: []
    }
  }
}
