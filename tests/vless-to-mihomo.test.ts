import * as assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { describe, it } from 'node:test'
import { parse } from 'yaml'
import { parseVlessUri } from '../src/shared/lib/vless/parser'
import {
  createVlessDisplayName,
  createVlessMihomoProfile,
  createVlessMihomoYaml
} from '../src/shared/lib/vless/to-mihomo'

const execFileAsync = promisify(execFile)
const uuid = '00000000-0000-4000-8000-000000000000'

describe('VLESS draft to Mihomo profile mapping', () => {
  it('maps a minimal tcp draft into a local Mihomo profile', () => {
    const draft = parseDraft(`vless://${uuid}@example.com:443#My%20Proxy`)
    const profile = createVlessMihomoProfile(draft)

    assert.equal(profile.proxyName, 'My Proxy')
    assert.equal(profile.groupName, 'Proxy')
    assert.deepEqual(profile.config['proxy-groups'], [
      {
        name: 'Proxy',
        type: 'select',
        proxies: ['My Proxy', 'DIRECT']
      }
    ])
    assert.deepEqual(profile.config.rules, ['MATCH,Proxy'])
    assert.deepEqual(profile.config.proxies[0], {
      name: 'My Proxy',
      type: 'vless',
      server: 'example.com',
      port: 443,
      uuid,
      udp: true,
      encryption: 'none',
      network: 'tcp'
    })
  })

  it('maps ws tls fields into Mihomo ws-opts and TLS fields', () => {
    const draft = parseDraft(
      `vless://${uuid}@edge.example:443?type=ws&path=%2Fws&host=cdn.edge&security=tls&sni=edge.example&alpn=h2%2Ch3&fp=chrome&insecure=1`
    )
    const proxy = createVlessMihomoProfile(draft).config.proxies[0]

    assert.equal(proxy.tls, true)
    assert.equal(proxy.servername, 'edge.example')
    assert.deepEqual(proxy.alpn, ['h2', 'h3'])
    assert.equal(proxy['client-fingerprint'], 'chrome')
    assert.equal(proxy['skip-cert-verify'], true)
    assert.deepEqual(proxy['ws-opts'], {
      path: '/ws',
      headers: {
        Host: 'cdn.edge'
      }
    })
  })

  it('maps reality fields into Mihomo reality-opts', () => {
    const draft = parseDraft(
      `vless://${uuid}@reality.example:443?security=reality&sni=reality.example&pbk=public-key&sid=abcd&spx=%2F&fp=chrome&flow=xtls-rprx-vision`
    )
    const proxy = createVlessMihomoProfile(draft).config.proxies[0]

    assert.equal(proxy.tls, true)
    assert.equal(proxy.servername, 'reality.example')
    assert.equal(proxy['client-fingerprint'], 'chrome')
    assert.equal(proxy.flow, 'xtls-rprx-vision')
    assert.deepEqual(proxy['reality-opts'], {
      'public-key': 'public-key',
      'short-id': 'abcd',
      'spider-x': '/'
    })
  })

  it('maps packet encoding into Mihomo packet-encoding', () => {
    const draft = parseDraft(`vless://${uuid}@example.com:443?packetEncoding=xudp`)
    const proxy = createVlessMihomoProfile(draft).config.proxies[0]

    assert.equal(proxy['packet-encoding'], 'xudp')
  })

  it('maps httpupgrade into Mihomo websocket upgrade options', () => {
    const draft = parseDraft(
      `vless://${uuid}@edge.example:443?type=httpupgrade&path=%2Fupgrade&host=cdn.edge&security=tls&sni=edge.example`
    )
    const proxy = createVlessMihomoProfile(draft).config.proxies[0]

    assert.equal(proxy.network, 'ws')
    assert.deepEqual(proxy['ws-opts'], {
      path: '/upgrade',
      headers: {
        Host: 'cdn.edge'
      },
      'v2ray-http-upgrade': true
    })
  })

  it('maps xhttp into Mihomo xhttp-opts', () => {
    const draft = parseDraft(
      `vless://${uuid}@edge.example:443?type=xhttp&path=%2F&host=cdn.edge&mode=packet-up&security=tls&sni=edge.example&alpn=h2`
    )
    const proxy = createVlessMihomoProfile(draft).config.proxies[0]

    assert.equal(proxy.network, 'xhttp')
    assert.deepEqual(proxy['xhttp-opts'], {
      path: '/',
      host: 'cdn.edge',
      mode: 'packet-up'
    })
  })

  it('uses a friendly display-name fallback when fragment is missing', () => {
    const draft = parseDraft(`vless://${uuid}@example.com:8443`)

    assert.equal(createVlessDisplayName(draft), 'VLESS example.com:8443')
  })

  it('produces YAML accepted by the bundled Mihomo sidecar for a supported TLS fixture', async () => {
    const corePath = './extra/sidecar/mihomo'
    if (!existsSync(corePath)) return

    const draft = parseDraft(
      `vless://${uuid}@edge.example:443?type=ws&path=%2Fws&host=cdn.edge&security=tls&sni=edge.example&alpn=h2%2Ch3&fp=chrome&insecure=1`
    )
    const yaml = createVlessMihomoYaml(draft)
    const parsed = parse(yaml)

    assert.equal(parsed.proxies[0].type, 'vless')
    await execFileAsync(corePath, ['-t', '-config', Buffer.from(yaml).toString('base64')])
  })

  it('produces YAML accepted by the bundled Mihomo sidecar for expanded vless fixtures', async () => {
    const corePath = './extra/sidecar/mihomo'
    if (!existsSync(corePath)) return

    const fixtures = [
      `vless://${uuid}@edge.example:443?packet-encoding=xudp&security=tls&sni=edge.example`,
      `vless://${uuid}@edge.example:443?type=httpupgrade&path=%2Fupgrade&host=cdn.edge&security=tls&sni=edge.example`,
      `vless://${uuid}@edge.example:443?type=xhttp&path=%2F&host=cdn.edge&mode=auto&security=tls&sni=edge.example&alpn=h2`,
      `vless://${uuid}@edge.example:443?type=xhttp&path=%2F&host=cdn.edge&mode=auto&security=reality&sni=edge.example&pbk=SpxcrfbxTSrm_Ho06GdQcjCiO6Vwzo-WS3cVYlyNTQg&spx=%2F&fp=chrome`
    ]

    for (const uri of fixtures) {
      const yaml = createVlessMihomoYaml(parseDraft(uri))
      await execFileAsync(corePath, ['-t', '-config', Buffer.from(yaml).toString('base64')])
    }
  })
})

function parseDraft(uri: string) {
  const result = parseVlessUri(uri)
  assert.equal(result.ok, true)
  if (!result.ok) throw new Error('Expected valid VLESS draft')
  return result.draft
}
