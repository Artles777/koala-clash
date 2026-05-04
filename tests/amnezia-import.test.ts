import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { deflateSync } from 'node:zlib'
import { parseAmneziaVpnKey } from '../src/shared/lib/amnezia/parser'
import { AmneziaImportError } from '../src/shared/lib/amnezia/errors'
import { appendAmneziaImport } from '../src/features/amnezia-import/store'

const importedAt = 1710000000000

describe('Amnezia vpn:// import', () => {
  it('imports a valid compressed Amnezia JSON payload', () => {
    const uri = encodeQtCompressedVpnUri(JSON.stringify(createAmneziaJsonPayload()))
    const draft = parseAmneziaVpnKey(uri, {
      sourceId: 'source-1',
      profileId: 'profile-1',
      importedAt
    })

    assert.equal(draft.source.type, 'amnezia_vpn_uri')
    assert.equal(draft.source.raw, uri)
    assert.equal(draft.profile.id, 'profile-1')
    assert.equal(draft.profile.sourceId, 'source-1')
    assert.equal(draft.profile.name, 'Test Amnezia')
    assert.equal(draft.profile.protocol, 'amneziawg')
    assert.deepEqual(draft.profile.transport.endpoint, {
      host: 'vpn.example.com',
      port: 51820
    })
    assert.equal(draft.profile.auth.clientPrivateKey, 'client-private-key')
    assert.equal(draft.profile.peer.publicKey, 'server-public-key')
    assert.equal(draft.profile.amnezia.container, 'amnezia-awg')
    assert.equal(draft.profile.amnezia.obfuscation.junkPacketCount, '4')
  })

  it('normalizes AmneziaWG short obfuscation fields used by vpn keys', () => {
    const uri = encodeQtCompressedVpnUri(
      JSON.stringify(
        createAmneziaJsonPayload({
          Jc: '6',
          Jmin: '8',
          Jmax: '80',
          S1: '28',
          S2: '131',
          H1: '1601146936',
          H2: '493334274',
          I1: '4189671953'
        })
      )
    )

    const draft = parseAmneziaVpnKey(uri, {
      sourceId: 'source-short-obfuscation',
      profileId: 'profile-short-obfuscation',
      importedAt
    })

    assert.equal(draft.profile.protocol, 'amneziawg')
    assert.equal(draft.profile.amnezia.obfuscation.Jc, '6')
    assert.equal(draft.profile.amnezia.obfuscation.Jmin, '8')
    assert.equal(draft.profile.amnezia.obfuscation.Jmax, '80')
    assert.equal(draft.profile.amnezia.obfuscation.S1, '28')
    assert.equal(draft.profile.amnezia.obfuscation.S2, '131')
    assert.equal(draft.profile.amnezia.obfuscation.H1, '1601146936')
    assert.equal(draft.profile.amnezia.obfuscation.H2, '493334274')
    assert.equal(draft.profile.amnezia.obfuscation.I1, '4189671953')
  })

  it('rejects malformed vpn:// input', () => {
    assertAmneziaError(
      () =>
        parseAmneziaVpnKey('vpn://', {
          sourceId: 'source-1',
          profileId: 'profile-1',
          importedAt
        }),
      'malformed_input'
    )
  })

  it('rejects unsupported decoded payloads', () => {
    const uri = encodeQtCompressedVpnUri('hello from an unsupported payload')

    assertAmneziaError(
      () =>
        parseAmneziaVpnKey(uri, {
          sourceId: 'source-1',
          profileId: 'profile-1',
          importedAt
        }),
      'unsupported_payload'
    )
  })

  it('rejects duplicate imports in the import store layer', () => {
    const uri = encodeQtCompressedVpnUri(JSON.stringify(createAmneziaJsonPayload()))
    const draft = parseAmneziaVpnKey(uri, {
      sourceId: 'source-1',
      profileId: 'profile-1',
      importedAt
    })
    const stores = appendAmneziaImport({ sources: [], profiles: [] }, draft.source, draft.profile)

    assertAmneziaError(
      () => appendAmneziaImport(stores, draft.source, draft.profile),
      'duplicate_import'
    )
  })

  it('normalizes a WireGuard config carried inside vpn://', () => {
    const uri = encodeQtCompressedVpnUri(`
[Interface]
PrivateKey = wg-client-private-key
Address = 10.8.0.2/32
DNS = 1.1.1.1, 8.8.8.8

[Peer]
PublicKey = wg-server-public-key
PresharedKey = wg-psk
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = wg.example.com:51820
PersistentKeepalive = 25
`)

    const draft = parseAmneziaVpnKey(uri, {
      sourceId: 'source-2',
      profileId: 'profile-2',
      importedAt
    })

    assert.equal(draft.profile.protocol, 'wireguard')
    assert.equal(draft.profile.transport.endpoint?.host, 'wg.example.com')
    assert.equal(draft.profile.transport.endpoint?.port, 51820)
    assert.deepEqual(draft.profile.interface.addresses, ['10.8.0.2/32'])
    assert.deepEqual(draft.profile.interface.dns, ['1.1.1.1', '8.8.8.8'])
    assert.deepEqual(draft.profile.peer.allowedIps, ['0.0.0.0/0', '::/0'])
  })

  it('reports missing WireGuard keys during validation', () => {
    const payload = createAmneziaJsonPayload({
      client_priv_key: '',
      server_pub_key: ''
    })
    const uri = encodeQtCompressedVpnUri(JSON.stringify(payload))

    assertAmneziaError(
      () =>
        parseAmneziaVpnKey(uri, {
          sourceId: 'source-3',
          profileId: 'profile-3',
          importedAt
        }),
      'missing_keys'
    )
  })
})

function createAmneziaJsonPayload(
  lastConfigPatch: Record<string, unknown> = {}
): Record<string, unknown> {
  const lastConfig = {
    hostName: 'vpn.example.com',
    port: 51820,
    client_priv_key: 'client-private-key',
    server_pub_key: 'server-public-key',
    psk_key: 'psk-key',
    client_ip: '10.8.0.2/32',
    allowed_ips: ['0.0.0.0/0', '::/0'],
    junkPacketCount: '4',
    junkPacketMinSize: '10',
    junkPacketMaxSize: '50',
    initPacketJunkSize: '0',
    responsePacketJunkSize: '0',
    initPacketMagicHeader: '1',
    responsePacketMagicHeader: '2',
    underloadPacketMagicHeader: '3',
    transportPacketMagicHeader: '4',
    ...lastConfigPatch
  }

  return {
    description: 'Test Amnezia',
    hostName: 'vpn.example.com',
    defaultContainer: 'amnezia-awg',
    containers: [
      {
        container: 'amnezia-awg',
        awg: {
          port: 51820,
          protocolVersion: '2',
          last_config: JSON.stringify(lastConfig)
        }
      }
    ]
  }
}

function encodeQtCompressedVpnUri(value: string): string {
  const input = Buffer.from(value, 'utf-8')
  const size = Buffer.alloc(4)
  size.writeUInt32BE(input.length, 0)
  const compressed = deflateSync(input, { level: 8 })
  return `vpn://${Buffer.concat([size, compressed]).toString('base64url')}`
}

function assertAmneziaError(fn: () => void, code: AmneziaImportError['code']): void {
  try {
    fn()
  } catch (error) {
    assert.ok(error instanceof AmneziaImportError)
    assert.equal(error.code, code)
    return
  }

  assert.fail(`Expected AmneziaImportError with code ${code}`)
}
