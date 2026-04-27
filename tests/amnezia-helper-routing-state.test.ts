import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import {
  clearAmneziaHelperRoutingTarget,
  getActiveAmneziaHelperRoutingTarget,
  updateAmneziaHelperRoutingTargetFromSession
} from '../src/main/runtime/amnezia-helper-routing-state'
import { createAmneziaHelperUdpCapability } from '../src/core/routing/amnezia-helper-udp-capability'

describe('Amnezia helper routing state', () => {
  afterEach(() => {
    clearAmneziaHelperRoutingTarget()
  })

  it('activates a routing target for ready helper sessions and clears it on stop', () => {
    const ready = updateAmneziaHelperRoutingTargetFromSession({
      profileId: 'amnezia-1',
      status: 'running',
      readiness: 'ready',
      backendMode: 'proxy-prototype',
      localEndpoint: {
        host: '127.0.0.1',
        port: 19080,
        protocol: 'socks5'
      }
    })

    assert.equal(ready.changed, true)
    assert.equal(ready.target.status, 'injected')
    assert.equal(getActiveAmneziaHelperRoutingTarget()?.endpoint?.port, 19080)

    const stopped = updateAmneziaHelperRoutingTargetFromSession({
      profileId: 'amnezia-1',
      status: 'stopped',
      readiness: 'unknown',
      backendMode: 'proxy-prototype'
    })

    assert.equal(stopped.changed, true)
    assert.equal(stopped.target.status, 'unavailable')
    assert.equal(getActiveAmneziaHelperRoutingTarget(), undefined)
  })

  it('does not activate routing for the explicit stub backend mode', () => {
    const update = updateAmneziaHelperRoutingTargetFromSession({
      profileId: 'amnezia-1',
      status: 'running',
      readiness: 'ready',
      backendMode: 'stub',
      localEndpoint: {
        host: '127.0.0.1',
        port: 19080,
        protocol: 'socks5'
      }
    })

    assert.equal(update.changed, false)
    assert.equal(update.target.status, 'unavailable')
    assert.equal(update.target.reason, 'stub_backend')
    assert.equal(getActiveAmneziaHelperRoutingTarget(), undefined)
  })

  it('marks routing state changed when UDP capability changes', () => {
    updateAmneziaHelperRoutingTargetFromSession({
      profileId: 'amnezia-1',
      status: 'running',
      readiness: 'ready',
      backendMode: 'production',
      localEndpoint: {
        host: '127.0.0.1',
        port: 19080,
        protocol: 'socks5'
      },
      udpCapability: createAmneziaHelperUdpCapability(
        'unknown',
        false,
        'backend_capability_unknown'
      )
    })

    const update = updateAmneziaHelperRoutingTargetFromSession({
      profileId: 'amnezia-1',
      status: 'running',
      readiness: 'ready',
      backendMode: 'production',
      localEndpoint: {
        host: '127.0.0.1',
        port: 19080,
        protocol: 'socks5'
      },
      udpCapability: createAmneziaHelperUdpCapability(
        'supported',
        true,
        'udp_associate_validated'
      )
    })

    assert.equal(update.changed, true)
    assert.equal(getActiveAmneziaHelperRoutingTarget()?.udpCapability?.udpSupport, 'supported')
  })
})
