import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  getExecutionPlan,
  resolveRuntimeAdapter,
  validateRuntimeCompatibility
} from '../src/core/profiles/desktop-runtime-adapter'
import { NormalizedProfile } from '../src/core/profiles/normalized-profile'

describe('desktop runtime adapter contract', () => {
  it('resolves Mihomo profiles to the existing native runtime', () => {
    const resolution = resolveRuntimeAdapter({
      id: 'mihomo-1',
      type: 'local',
      name: 'Mihomo'
    })

    assert.equal(resolution.adapterId, 'mihomo-core')
    assert.equal(resolution.executionKind, 'mihomo-native')
    assert.equal(resolution.profileKind, 'mihomo')
  })

  it('resolves WireGuard-based Amnezia profiles to an external helper', () => {
    const profile = createNormalizedProfile()
    const resolution = resolveRuntimeAdapter(profile)
    const compatibility = validateRuntimeCompatibility(profile, 'darwin')

    assert.equal(resolution.adapterId, 'amnezia-desktop-helper')
    assert.equal(resolution.executionKind, 'external-helper')
    assert.equal(compatibility.compatible, true)
    assert.equal(compatibility.runtimeSupport, 'prototype_available')
    assert.equal(compatibility.requiresHelper, true)
    assert.equal(compatibility.dryRunAvailable, true)
  })

  it('requires normalized Amnezia data before producing helper compatibility', () => {
    const compatibility = validateRuntimeCompatibility(
      {
        id: 'amnezia-1',
        type: 'local',
        name: 'Amnezia',
        compatibility: 'amnezia',
        importedSourceId: 'source-1',
        normalizedProfileId: 'amnezia-1'
      },
      'linux'
    )

    assert.equal(compatibility.compatible, false)
    assert.equal(compatibility.executionKind, 'external-helper')
    assert.equal(compatibility.runtimeSupport, 'requires_helper')
    assert.ok(compatibility.blockers.includes('normalized_profile_required_for_execution_plan'))
  })

  it('generates a dry-run helper execution plan on desktop platforms', () => {
    const profile = createNormalizedProfile()
    const plan = getExecutionPlan(profile, 'win32')

    assert.equal(plan.status, 'ready')
    assert.equal(plan.kind, 'external-helper')
    assert.equal(plan.adapterId, 'amnezia-desktop-helper')
    assert.equal(plan.helper?.executable, 'amnezia-helper.exe')
    assert.equal(plan.helper?.config.protocol, 'amneziawg')
    assert.deepEqual(plan.helper?.config.remote, {
      host: 'vpn.example.com',
      port: 51820,
      transport: profile.transport
    })
    assert.equal(plan.helper?.config.execution.mode, 'proxy')
    assert.equal(plan.helper?.config.execution.backendMode, 'production')
    assert.equal(plan.helper?.config.localProxy.host, '127.0.0.1')
  })

  it('reports unsupported Amnezia protocols for the desktop helper', () => {
    const profile = createNormalizedProfile({
      protocol: 'openvpn'
    })
    const compatibility = validateRuntimeCompatibility(profile, 'linux')
    const plan = getExecutionPlan(profile, 'linux')

    assert.equal(compatibility.compatible, false)
    assert.equal(compatibility.executionKind, 'unsupported')
    assert.equal(compatibility.runtimeSupport, 'planned')
    assert.ok(compatibility.blockers.includes('protocol_not_supported_by_amnezia_helper:openvpn'))
    assert.equal(plan.status, 'unsupported')
  })

  it('blocks helper plans when endpoint or keys are missing', () => {
    const profile = createNormalizedProfile({
      transport: {
        type: 'udp'
      },
      auth: {},
      peer: {
        allowedIps: ['0.0.0.0/0']
      }
    })
    const compatibility = validateRuntimeCompatibility(profile, 'linux')

    assert.equal(compatibility.compatible, false)
    assert.equal(compatibility.runtimeSupport, 'requires_helper')
    assert.ok(compatibility.blockers.includes('missing_endpoint:transport.endpoint'))
    assert.ok(compatibility.blockers.includes('missing_keys:auth'))
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
