import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatAmneziaImportErrorMessage } from '../src/renderer/src/utils/amnezia-profile-presentation'

describe('Amnezia profile presentation', () => {
  it('maps malformed and duplicate import failures to user-friendly messages', () => {
    assert.equal(
      formatAmneziaImportErrorMessage('Amnezia vpn:// payload is empty or malformed'),
      'This vpn:// key is malformed'
    )
    assert.equal(
      formatAmneziaImportErrorMessage('This profile already exists'),
      'This Amnezia profile has already been imported'
    )
  })

  it('maps unsupported self-contained boundary failures to explicit messages', () => {
    assert.equal(
      formatAmneziaImportErrorMessage(
        'Unsupported Amnezia vpn:// profile. Only self-contained AmneziaWG/WireGuard profiles can be imported.'
      ),
      'Only self-contained AmneziaWG/WireGuard vpn:// profiles are supported'
    )
    assert.equal(
      formatAmneziaImportErrorMessage(
        'Unsupported Amnezia vpn:// profile. Only self-contained AmneziaWG/WireGuard profiles can be imported. Missing or unsupported fields: missing_interface_address'
      ),
      'This profile is missing local address or allowed IPs'
    )
  })

  it('maps generated Mihomo validation failures without losing details', () => {
    assert.equal(
      formatAmneziaImportErrorMessage(
        'Mihomo rejected the generated Amnezia WireGuard profile: proxy missing private-key'
      ),
      'Mihomo rejected the generated Amnezia WireGuard profile: proxy missing private-key'
    )
  })
})
