import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseVlessUri } from '../src/shared/lib/vless/parser'
import { VlessParseErrorCode } from '../src/shared/lib/vless/types'

const uuid = '00000000-0000-4000-8000-000000000000'

describe('VLESS URI parser', () => {
  it('normalizes a minimal tcp VLESS link', () => {
    const result = parseVlessUri(`vless://${uuid}@example.com:443#Display%20Name`)

    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.draft.protocol, 'vless')
    assert.equal(result.draft.uuid, uuid)
    assert.deepEqual(result.draft.server, { host: 'example.com', port: 443 })
    assert.equal(result.draft.name, 'Display Name')
    assert.equal(result.draft.encryption, 'none')
    assert.equal(result.draft.security, 'none')
    assert.deepEqual(result.draft.transport, { type: 'tcp' })
  })

  it('parses ws over tls with common TLS and transport params', () => {
    const result = parseVlessUri(
      `vless://${uuid}@edge.example:443?encryption=none&type=ws&path=%2Fws&host=cdn.edge&security=tls&sni=edge.example&alpn=h2%2Ch3&fp=chrome&insecure=1`
    )

    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.draft.security, 'tls')
    assert.deepEqual(result.draft.transport, {
      type: 'ws',
      path: '/ws',
      host: 'cdn.edge'
    })
    assert.deepEqual(result.draft.tls, {
      serverName: 'edge.example',
      alpn: ['h2', 'h3'],
      fingerprint: 'chrome',
      insecure: true
    })
  })

  it('parses REALITY over grpc with required reality fields', () => {
    const result = parseVlessUri(
      `vless://${uuid}@reality.example:443?security=reality&type=grpc&sni=reality.example&pbk=public-key&sid=abcd&fp=chrome&serviceName=svc&authority=auth.example&flow=xtls-rprx-vision`
    )

    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.draft.security, 'reality')
    assert.equal(result.draft.flow, 'xtls-rprx-vision')
    assert.deepEqual(result.draft.transport, {
      type: 'grpc',
      serviceName: 'svc',
      authority: 'auth.example'
    })
    assert.deepEqual(result.draft.reality, {
      serverName: 'reality.example',
      publicKey: 'public-key',
      shortId: 'abcd',
      fingerprint: 'chrome'
    })
  })

  it('parses packet encoding aliases', () => {
    const xudp = parseVlessUri(`vless://${uuid}@example.com:443?packet-encoding=xudp`)
    assert.equal(xudp.ok, true)
    if (!xudp.ok) return
    assert.equal(xudp.draft.packetEncoding, 'xudp')

    const packetaddr = parseVlessUri(`vless://${uuid}@example.com:443?packetEncoding=packetaddr`)
    assert.equal(packetaddr.ok, true)
    if (!packetaddr.ok) return
    assert.equal(packetaddr.draft.packetEncoding, 'packetaddr')
  })

  it('parses httpupgrade with websocket-style host and path params', () => {
    const result = parseVlessUri(
      `vless://${uuid}@edge.example:443?type=httpupgrade&path=%2Fupgrade&host=cdn.edge&security=tls&sni=edge.example&fp=chrome`
    )

    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.draft.security, 'tls')
    assert.deepEqual(result.draft.transport, {
      type: 'httpupgrade',
      path: '/upgrade',
      host: 'cdn.edge'
    })
  })

  it('parses xhttp with path, host, and mode params', () => {
    const result = parseVlessUri(
      `vless://${uuid}@edge.example:443?type=xhttp&path=%2F&host=cdn.edge&mode=stream-up&security=tls&sni=edge.example&alpn=h2`
    )

    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.draft.security, 'tls')
    assert.deepEqual(result.draft.transport, {
      type: 'xhttp',
      path: '/',
      host: 'cdn.edge',
      mode: 'stream-up'
    })
  })

  it('parses REALITY over xhttp with required reality fields', () => {
    const result = parseVlessUri(
      `vless://${uuid}@edge.example:443?type=xhttp&path=%2F&host=cdn.edge&mode=auto&security=reality&sni=edge.example&pbk=public-key&fp=chrome`
    )

    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.draft.security, 'reality')
    assert.deepEqual(result.draft.transport, {
      type: 'xhttp',
      path: '/',
      host: 'cdn.edge',
      mode: 'auto'
    })
  })

  it('rejects invalid uuid, host, and port', () => {
    assertErrorCodes('vless://not-a-uuid@example.com:443', ['invalid_uuid'])
    assertErrorCodes(`vless://${uuid}@bad_host.example:443`, ['invalid_host'])
    assertErrorCodes(`vless://${uuid}@example.com:0`, ['invalid_port'])
  })

  it('rejects unsupported security and transport variants', () => {
    assertErrorCodes(`vless://${uuid}@example.com:443?security=xtls`, ['unsupported_security'])
    assertErrorCodes(`vless://${uuid}@example.com:443?type=splithttp`, ['unsupported_transport'])
    assertErrorCodes(`vless://${uuid}@example.com:443?type=kcp`, ['unsupported_transport'])
  })

  it('rejects unsupported params and encryption values', () => {
    assertErrorCodes(`vless://${uuid}@example.com:443?encryption=aes-128-gcm`, [
      'unsupported_encryption'
    ])
    assertErrorCodes(`vless://${uuid}@example.com:443?ech=abc`, ['unsupported_param'])
    assertErrorCodes(`vless://${uuid}@example.com:443?packet-encoding=packetaddr2`, [
      'unsupported_packet_encoding'
    ])
    assertErrorCodes(`vless://${uuid}@example.com:443?type=xhttp&mode=duplex`, [
      'unsupported_xhttp_mode'
    ])
  })

  it('rejects transport params on the wrong transport', () => {
    assertErrorCodes(`vless://${uuid}@example.com:443?type=tcp&path=%2Fws`, [
      'unsupported_transport_param'
    ])
    assertErrorCodes(`vless://${uuid}@example.com:443?type=grpc&host=cdn.example`, [
      'unsupported_transport_param'
    ])
    assertErrorCodes(`vless://${uuid}@example.com:443?type=httpupgrade&serviceName=svc`, [
      'unsupported_transport_param'
    ])
    assertErrorCodes(`vless://${uuid}@example.com:443?type=xhttp&authority=auth.example`, [
      'unsupported_transport_param'
    ])
  })

  it('rejects REALITY without required fields and unsupported REALITY transport', () => {
    assertErrorCodes(`vless://${uuid}@example.com:443?security=reality`, [
      'missing_reality_public_key',
      'missing_reality_server_name'
    ])
    assertErrorCodes(
      `vless://${uuid}@example.com:443?security=reality&type=ws&sni=example.com&pbk=public-key`,
      ['unsupported_security_transport']
    )
    assertErrorCodes(
      `vless://${uuid}@example.com:443?security=reality&type=httpupgrade&sni=example.com&pbk=public-key`,
      ['unsupported_security_transport']
    )
  })
})

function assertErrorCodes(uri: string, expected: VlessParseErrorCode[]): void {
  const result = parseVlessUri(uri)
  assert.equal(result.ok, false)
  if (result.ok) return
  const actual = result.errors.map((error) => error.code)
  for (const code of expected) {
    assert.ok(actual.includes(code), `Expected ${code}; got ${actual.join(', ')}`)
  }
}
