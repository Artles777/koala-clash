import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  formatVlessImportErrorMessage,
  formatVlessParseErrorMessage,
  formatVlessRuntimeErrorMessage,
  getVlessDraftPresentation,
  getVlessProfileDetails,
  getVlessProfilePresentation,
  getVlessTroubleshootingHints
} from '../src/renderer/src/utils/vless-profile-presentation'
import { parseVlessUri } from '../src/shared/lib/vless/parser'

const uuid = '00000000-0000-4000-8000-000000000000'

describe('VLESS profile presentation', () => {
  it('maps VLESS profile metadata to a badge and compact summary', () => {
    const presentation = getVlessProfilePresentation({
      sourceType: 'vless_uri',
      source: {
        vless: {
          host: 'example.com',
          port: 443,
          transport: 'ws',
          security: 'tls'
        }
      }
    })

    assert.equal(presentation?.badge, 'VLESS')
    assert.equal(presentation?.summary, 'example.com:443 · ws/tls')
  })

  it('does not label normal local profiles as VLESS', () => {
    assert.equal(getVlessProfilePresentation({ sourceType: undefined, source: undefined }), null)
  })

  it('does not label profiles with malformed VLESS metadata', () => {
    assert.equal(
      getVlessProfilePresentation({
        sourceType: 'vless_uri',
        source: {
          vless: {
            host: '',
            port: 0,
            transport: 'ws',
            security: 'tls'
          }
        }
      }),
      null
    )
  })

  it('uses the display-name fallback generated from host and port when fragment is missing', () => {
    const parsed = parseVlessUri(`vless://${uuid}@example.com:8443?security=reality&pbk=abc&sni=site.test`)
    assert.equal(parsed.ok, true)
    if (!parsed.ok) return

    const presentation = getVlessDraftPresentation(parsed.draft)
    assert.equal(presentation.summary, 'example.com:8443 · tcp/reality')
  })

  it('maps parser errors to user-friendly messages', () => {
    const parsed = parseVlessUri(`vless://bad@example.com:443`)
    assert.equal(parsed.ok, false)
    if (parsed.ok) return

    assert.equal(formatVlessParseErrorMessage(parsed.errors[0]), 'The VLESS UUID is invalid')
  })

  it('maps duplicate and validation import failures to user-friendly messages', () => {
    assert.equal(
      formatVlessImportErrorMessage('This VLESS link has already been imported'),
      'This VLESS link has already been imported'
    )
    assert.equal(
      formatVlessImportErrorMessage(
        'Generated VLESS Mihomo profile failed validation: proxy missing reality-opts'
      ),
      'Mihomo rejected the generated VLESS profile: proxy missing reality-opts'
    )
  })

  it('maps VLESS metadata to safe details without UUID or raw-link leakage', () => {
    const details = getVlessProfileDetails({
      sourceType: 'vless_uri',
      source: {
        vless: {
          host: 'edge.example',
          port: 443,
          transport: 'xhttp',
          security: 'reality',
          serverName: 'sni.example',
          flow: 'xtls-rprx-vision',
          packetEncoding: 'xudp'
        }
      }
    })

    assert.deepEqual(details, [
      { label: 'Source', value: 'Imported VLESS' },
      { label: 'Server', value: 'edge.example:443' },
      { label: 'Transport', value: 'xHTTP' },
      { label: 'Security', value: 'REALITY' },
      { label: 'SNI / server name', value: 'sni.example' },
      { label: 'Flow', value: 'xtls-rprx-vision' },
      { label: 'Packet encoding', value: 'xudp' }
    ])

    const serialized = JSON.stringify(details)
    assert.equal(serialized.includes(uuid), false)
    assert.equal(serialized.includes('vless://'), false)
  })

  it('provides troubleshooting hints for transport, reality, and packet encoding', () => {
    const hints = getVlessTroubleshootingHints({
      sourceType: 'vless_uri',
      source: {
        vless: {
          host: 'edge.example',
          port: 443,
          transport: 'httpupgrade',
          security: 'reality',
          packetEncoding: 'packetaddr'
        }
      }
    })

    assert.equal(hints.some((hint) => hint.includes('REALITY')), true)
    assert.equal(hints.some((hint) => hint.includes('HTTP Upgrade')), true)
    assert.equal(hints.some((hint) => hint.includes('packet encoding')), true)
  })

  it('maps runtime failures to VLESS-specific troubleshooting messages', () => {
    const profile = {
      sourceType: 'vless_uri' as const,
      source: {
        vless: {
          host: 'edge.example',
          port: 443,
          transport: 'xhttp' as const,
          security: 'tls' as const
        }
      }
    }

    assert.match(
      formatVlessRuntimeErrorMessage('TLS handshake failed: certificate is invalid', profile),
      /VLESS TLS runtime failure/
    )
    assert.match(
      formatVlessRuntimeErrorMessage('xhttp stream-up download bad status: 404', profile),
      /VLESS transport runtime failure/
    )
    assert.equal(
      formatVlessRuntimeErrorMessage('xhttp stream-up download bad status: 404'),
      'xhttp stream-up download bad status: 404'
    )
  })
})
