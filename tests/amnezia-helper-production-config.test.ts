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

    assert.equal(config.kind, 'koala-amnezia-helper-production-config')
    assert.equal(config.profile.id, 'amnezia-1')
    assert.equal(config.profile.protocol, 'amneziawg')
    assert.equal(config.execution.mode, 'proxy')
    assert.equal(config.execution.localProxy.host, '127.0.0.1')
    assert.equal(config.execution.localProxy.port, 19080)
    assert.equal(config.remote.host, 'vpn.example.com')
    assert.equal(config.remote.port, 51820)
    assert.equal(config.wireGuard.interface.privateKey, 'client-private-key')
    assert.deepEqual(config.wireGuard.interface.addresses, ['10.8.0.2/32'])
    assert.deepEqual(config.wireGuard.interface.dns, ['1.1.1.1'])
    assert.equal(config.wireGuard.peer.publicKey, 'server-public-key')
    assert.deepEqual(config.wireGuard.peer.allowedIps, ['0.0.0.0/0', '::/0'])
    assert.equal(config.wireGuard.peer.presharedKey, 'psk')
    assert.equal(config.amnezia.obfuscation.junkPacketCount, '4')
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
