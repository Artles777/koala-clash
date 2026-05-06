import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  formatVlessImportErrorMessage,
  formatVlessParseErrorMessage,
  formatVlessRuntimeErrorMessage,
  getVlessProfilePresentation
} from '../src/renderer/src/utils/vless-profile-presentation'
import { parseVlessUri } from '../src/shared/lib/vless/parser'

describe('VLESS profile presentation', () => {
  it('maps VLESS sourceType to a badge and profile-name summary', () => {
    const presentation = getVlessProfilePresentation({
      name: 'Imported VLESS',
      sourceType: 'vless_uri'
    })

    assert.equal(presentation?.badge, 'VLESS')
    assert.equal(presentation?.summary, 'Imported VLESS')
  })

  it('does not label normal local profiles as VLESS', () => {
    assert.equal(getVlessProfilePresentation({ name: 'Local', sourceType: undefined }), null)
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

  it('maps runtime failures to one VLESS-specific activation message', () => {
    const profile = {
      sourceType: 'vless_uri' as const
    }

    assert.match(
      formatVlessRuntimeErrorMessage('TLS handshake failed: certificate is invalid', profile),
      /VLESS profile failed to activate/
    )
    assert.match(
      formatVlessRuntimeErrorMessage('xhttp stream-up download bad status: 404', profile),
      /VLESS profile failed to activate/
    )
    assert.equal(
      formatVlessRuntimeErrorMessage('xhttp stream-up download bad status: 404'),
      'xhttp stream-up download bad status: 404'
    )
  })
})
