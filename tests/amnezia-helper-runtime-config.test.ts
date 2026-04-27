import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createAmneziaHelperRuntimeConfig,
  validateAmneziaHelperRuntimeConfigInput
} from '../src/core/profiles/amnezia-helper-runtime-config'
import { NormalizedProfile } from '../src/core/profiles/normalized-profile'

describe('Amnezia helper runtime config generation', () => {
  it('generates a proxy-mode helper config from a normalized Amnezia profile', () => {
    const profile = createNormalizedProfile()
    const config = createAmneziaHelperRuntimeConfig(profile, {
      backendMode: 'production',
      localProxy: {
        host: '127.0.0.1',
        port: 19080,
        protocol: 'socks5'
      },
      generatedAt: 1710000000000,
      allowEphemeralPort: false
    })

    assert.equal(config.execution.mode, 'proxy')
    assert.equal(config.execution.backendMode, 'production')
    assert.equal(config.remote.host, 'vpn.example.com')
    assert.equal(config.remote.port, 51820)
    assert.equal(config.auth.clientPrivateKey, 'client-private-key')
    assert.equal(config.peer.publicKey, 'server-public-key')
    assert.deepEqual(config.peer.allowedIps, ['0.0.0.0/0', '::/0'])
    assert.deepEqual(config.interface.dns, ['1.1.1.1'])
    assert.equal(config.localProxy.host, '127.0.0.1')
    assert.equal(config.localProxy.port, 19080)
    assert.equal(config.localProxy.protocol, 'socks5')
    assert.equal(config.amnezia.obfuscation.junkPacketCount, '4')
  })

  it('reports missing endpoint and WireGuard keys', () => {
    const issues = validateAmneziaHelperRuntimeConfigInput(
      createNormalizedProfile({
        transport: {
          type: 'udp'
        },
        auth: {},
        peer: {
          allowedIps: []
        }
      })
    )

    assert.ok(issues.some((issue) => issue.code === 'missing_endpoint'))
    assert.ok(issues.some((issue) => issue.code === 'missing_keys'))
  })

  it('rejects unsupported protocols for proxy mode', () => {
    const issues = validateAmneziaHelperRuntimeConfigInput(
      createNormalizedProfile({
        protocol: 'openvpn'
      })
    )

    assert.ok(issues.some((issue) => issue.code === 'unsupported_protocol'))
  })

  it('validates explicit local proxy endpoint values', () => {
    const issues = validateAmneziaHelperRuntimeConfigInput(createNormalizedProfile(), {
      localProxy: {
        host: '',
        port: 0
      },
      allowEphemeralPort: false
    })

    assert.ok(issues.some((issue) => issue.code === 'invalid_local_proxy_host'))
    assert.ok(issues.some((issue) => issue.code === 'invalid_local_proxy_port'))
  })
})

function createNormalizedProfile(patch: Partial<NormalizedProfile> = {}): NormalizedProfile {
  const base: NormalizedProfile = {
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
      clientPrivateKey: 'client-private-key'
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

  return {
    ...base,
    ...patch,
    transport: patch.transport ?? base.transport,
    auth: patch.auth ?? base.auth,
    interface: patch.interface ?? base.interface,
    peer: patch.peer ?? base.peer,
    amnezia: patch.amnezia ?? base.amnezia,
    metadata: patch.metadata ?? base.metadata
  }
}
