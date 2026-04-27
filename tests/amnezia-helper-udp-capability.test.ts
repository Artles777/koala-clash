import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createAmneziaHelperUdpCapability,
  createInitialAmneziaHelperUdpCapability,
  shouldAdvertiseAmneziaHelperUdp
} from '../src/core/routing/amnezia-helper-udp-capability'

describe('Amnezia helper UDP capability', () => {
  it('starts production helpers with unknown and unvalidated UDP support', () => {
    const capability = createInitialAmneziaHelperUdpCapability('production', 1710000000000)

    assert.equal(capability.udpSupport, 'unknown')
    assert.equal(capability.udpValidated, false)
    assert.equal(capability.udpReasonCode, 'backend_capability_unknown')
    assert.equal(shouldAdvertiseAmneziaHelperUdp(capability), false)
  })

  it('marks stub helpers as unsupported for UDP', () => {
    const capability = createInitialAmneziaHelperUdpCapability('stub', 1710000000000)

    assert.equal(capability.udpSupport, 'unsupported')
    assert.equal(capability.udpValidated, false)
    assert.equal(capability.udpReasonCode, 'stub_backend')
    assert.equal(shouldAdvertiseAmneziaHelperUdp(capability), false)
  })

  it('advertises UDP only for supported and validated capability', () => {
    const supported = createAmneziaHelperUdpCapability(
      'supported',
      true,
      'udp_associate_validated',
      1710000000000
    )
    const unsupported = createAmneziaHelperUdpCapability(
      'unsupported',
      false,
      'udp_associate_rejected',
      1710000000000
    )

    assert.equal(shouldAdvertiseAmneziaHelperUdp(supported), true)
    assert.equal(shouldAdvertiseAmneziaHelperUdp(unsupported), false)
  })
})
