import * as assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { describe, it } from 'node:test'
import { promisify } from 'node:util'
import path from 'node:path'
import type { NormalizedProfile } from '../src/core/profiles/normalized-profile'
import {
  assessAmneziaMihomoNativeSupport,
  createAmneziaMihomoNativeProfile,
  createAmneziaMihomoNativeYaml
} from '../src/shared/lib/amnezia/to-mihomo'

const execFileAsync = promisify(execFile)

describe('Amnezia Mihomo-native WireGuard conversion', () => {
  it('maps a self-contained AmneziaWG profile to Mihomo WireGuard with amnezia-wg-option', () => {
    const profile = createNormalizedProfile({
      protocol: 'amneziawg',
      amnezia: {
        obfuscation: {
          junkPacketCount: '4',
          junkPacketMinSize: '10',
          junkPacketMaxSize: '50',
          initPacketJunkSize: '20',
          responsePacketJunkSize: '30',
          cookieReplyPacketJunkSize: '40',
          transportPacketJunkSize: '50',
          initPacketMagicHeader: '1601146936',
          responsePacketMagicHeader: '493334274',
          underloadPacketMagicHeader: '123123-123200',
          transportPacketMagicHeader: '32345-32350',
          specialJunk1: '<b 0xf6ab3267fa><c>',
          J2: '<c><b 0xf6ab><t>',
          Itime: '60'
        }
      }
    })

    const result = createAmneziaMihomoNativeProfile(profile)
    const proxy = result.config.proxies[0]
    const peer = (proxy.peers as Record<string, unknown>[])[0]
    const option = proxy['amnezia-wg-option'] as Record<string, unknown>

    assert.equal(proxy.type, 'wireguard')
    assert.equal(proxy.name, 'Test Amnezia')
    assert.equal(proxy['private-key'], privateKey)
    assert.equal(proxy.ip, '172.16.0.2/32')
    assert.equal(proxy.ipv6, 'fd01::2/128')
    assert.equal(proxy['persistent-keepalive'], 25)
    assert.equal(proxy['remote-dns-resolve'], true)
    assert.deepEqual(proxy.dns, ['1.1.1.1', '8.8.8.8'])
    assert.deepEqual(peer, {
      server: '162.159.192.1',
      port: 2480,
      'public-key': publicKey,
      'pre-shared-key': presharedKey,
      'allowed-ips': ['0.0.0.0/0', '::/0']
    })
    assert.equal(option.jc, 4)
    assert.equal(option.jmin, 10)
    assert.equal(option.jmax, 50)
    assert.equal(option.s1, 20)
    assert.equal(option.s2, 30)
    assert.equal(option.s3, 40)
    assert.equal(option.s4, 50)
    assert.equal(option.h1, '1601146936')
    assert.equal(option.h3, '123123-123200')
    assert.equal(option.i1, '<b 0xf6ab3267fa><c>')
    assert.equal(option.j2, '<c><b 0xf6ab><t>')
    assert.equal(option.itime, 60)
    assert.deepEqual(result.config['proxy-groups'][0], {
      name: 'PROXY',
      type: 'fallback',
      proxies: ['Test Amnezia'],
      url: 'http://www.gstatic.com/generate_204',
      interval: 60,
      lazy: true
    })
    assert.deepEqual(result.config.rules, [
      'IP-CIDR,162.159.192.1/32,DIRECT,no-resolve',
      'MATCH,PROXY'
    ])
  })

  it('uses a select proxy-group and pins the endpoint when no AmneziaWG obfuscation is set', () => {
    const profile = createNormalizedProfile({
      protocol: 'wireguard',
      amnezia: {
        container: 'wireguard',
        obfuscation: {}
      }
    })

    const result = createAmneziaMihomoNativeProfile(profile)
    const group = result.config['proxy-groups'][0]

    assert.equal(group.type, 'select')
    assert.deepEqual(group.proxies, ['Test Amnezia'])
    assert.deepEqual(result.config.rules, [
      'IP-CIDR,162.159.192.1/32,DIRECT,no-resolve',
      'MATCH,PROXY'
    ])
  })

  it('emits a DOMAIN endpoint exclude rule when the endpoint is a hostname', () => {
    const profile = createNormalizedProfile({
      transport: {
        type: 'udp',
        endpoint: { host: 'vpn.example.com', port: 51820 },
        mtu: 1408
      },
      peer: {
        endpoint: 'vpn.example.com:51820',
        publicKey,
        allowedIps: ['0.0.0.0/0', '::/0'],
        persistentKeepalive: 25
      }
    })

    const result = createAmneziaMihomoNativeProfile(profile)
    assert.equal(result.config.rules[0], 'DOMAIN,vpn.example.com,DIRECT,no-resolve')
    assert.equal(result.config.rules[result.config.rules.length - 1], 'MATCH,PROXY')
  })

  it('emits an IP-CIDR6 endpoint exclude rule for IPv6 literals', () => {
    const profile = createNormalizedProfile({
      transport: {
        type: 'udp',
        endpoint: { host: '2606:4700::6810:84e5', port: 51820 },
        mtu: 1408
      },
      peer: {
        endpoint: '[2606:4700::6810:84e5]:51820',
        publicKey,
        allowedIps: ['0.0.0.0/0', '::/0'],
        persistentKeepalive: 25
      }
    })

    const result = createAmneziaMihomoNativeProfile(profile)
    assert.equal(result.config.rules[0], 'IP-CIDR6,2606:4700::6810:84e5/128,DIRECT,no-resolve')
  })

  it('maps a self-contained WireGuard profile without AmneziaWG options', () => {
    const profile = createNormalizedProfile({ protocol: 'wireguard' })

    const result = createAmneziaMihomoNativeProfile(profile)
    const proxy = result.config.proxies[0]

    assert.equal(proxy.type, 'wireguard')
    assert.equal(proxy['amnezia-wg-option'], undefined)
  })

  it('rejects profiles missing self-contained runtime fields', () => {
    const profile = createNormalizedProfile({
      interface: {
        addresses: [],
        dns: []
      }
    })

    const assessment = assessAmneziaMihomoNativeSupport(profile)

    assert.equal(assessment.supported, false)
    assert.ok(assessment.blockers.includes('missing_interface_address'))
  })

  it('validates generated Mihomo YAML with the bundled Mihomo core when available', async () => {
    const corePath = path.resolve('extra/sidecar/mihomo')
    if (!existsSync(corePath)) return

    const yaml = createAmneziaMihomoNativeYaml(
      createNormalizedProfile({
        protocol: 'amneziawg',
        amnezia: {
          obfuscation: {
            Jc: '5',
            Jmin: '500',
            Jmax: '501',
            S1: '30',
            S2: '40',
            H1: '123456',
            H2: '67543'
          }
        }
      })
    )
    const encodedConfig = Buffer.from(yaml).toString('base64')

    await execFileAsync(corePath, ['-t', '-config', encodedConfig], {
      timeout: 10000,
      maxBuffer: 1024 * 1024
    })
  })
})

const privateKey = 'eCtXsJZ27+4PbhDkHnB923tkUn2Gj59wZw5wFA75MnU='
const publicKey = 'Cr8hWlKvtDt7nrvf+f0brNQQzabAqrjfBvas9pmowjo='
const presharedKey = '31aIhAPwktDGpH4JDhA8GNvjFXEf/a6+UaQRyOAiyfM='

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
        host: '162.159.192.1',
        port: 2480
      },
      mtu: 1408
    },
    auth: {
      clientPrivateKey: privateKey,
      serverPublicKey: publicKey,
      presharedKey
    },
    interface: {
      addresses: ['172.16.0.2/32', 'fd01::2/128'],
      dns: ['1.1.1.1', '8.8.8.8'],
      mtu: 1408
    },
    peer: {
      endpoint: '162.159.192.1:2480',
      publicKey,
      allowedIps: ['0.0.0.0/0', '::/0'],
      persistentKeepalive: 25
    },
    amnezia: {
      container: 'amnezia-awg',
      obfuscation: {
        Jc: '5'
      }
    },
    metadata: {
      importedAt: 1710000000000,
      decodedFormat: 'zlib',
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
