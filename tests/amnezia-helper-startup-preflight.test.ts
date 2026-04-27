import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  AmneziaHelperRuntimeConfig,
  withLocalProxyEndpoint
} from '../src/core/profiles/amnezia-helper-runtime-config'
import { getExecutionPlan } from '../src/core/profiles/desktop-runtime-adapter'
import { NormalizedProfile } from '../src/core/profiles/normalized-profile'
import { createAmneziaHelperTunBypassFailed } from '../src/core/routing/amnezia-helper-tun-bypass'
import { resolveHelperBackend } from '../src/main/runtime/amnezia-helper-backend-provider'
import {
  createAmneziaHelperStartupPreflight,
  mapStartupPreflightReasonToRuntimeCategory
} from '../src/main/runtime/amnezia-helper-startup-preflight'

const platform = ['win32', 'linux', 'darwin'].includes(process.platform)
  ? process.platform
  : 'linux'

describe('Amnezia helper startup preflight', () => {
  it('blocks startup when the production helper binary is missing', async () => {
    const result = await createAmneziaHelperStartupPreflight({
      profileId: 'amnezia-1',
      plan: createPlan(),
      backend: resolveHelperBackend({
        mode: 'production',
        proxyBackendPath: '/app/amnezia-helper-proxy-backend.cjs',
        helperStubPath: '/app/amnezia-helper-stub.cjs',
        productionBackendPath: '/missing/amnezia-helper',
        exists: () => false
      }),
      prepareRuntimeConfig: prepareRuntimeConfig,
      tunEnabled: false,
      now: () => 1710000000000
    })

    assert.equal(result.canStart, false)
    assert.equal(result.backendStatus, 'blocked')
    assert.ok(result.blockingReasons.some((reason) => reason.code === 'helper_binary_missing'))
  })

  it('blocks startup when the resolved helper path is not executable', async () => {
    const result = await createAmneziaHelperStartupPreflight({
      profileId: 'amnezia-1',
      plan: createPlan(),
      backend: resolveHelperBackend({
        mode: 'production',
        proxyBackendPath: '/app/amnezia-helper-proxy-backend.cjs',
        helperStubPath: '/app/amnezia-helper-stub.cjs',
        productionBackendPath: '/tmp/amnezia-helper-dir',
        validateExecutable: ({ executablePath }) => ({
          ok: false,
          path: executablePath,
          platform,
          arch: process.arch,
          issues: [
            {
              code: 'not_file',
              message: 'path is not a file',
              path: executablePath
            }
          ],
          diagnostics: ['not_file: path is not a file']
        })
      }),
      prepareRuntimeConfig: prepareRuntimeConfig,
      tunEnabled: false
    })

    assert.equal(result.canStart, false)
    assert.equal(result.backendStatus, 'blocked')
    assert.ok(
      result.blockingReasons.some((reason) => reason.code === 'helper_binary_not_executable')
    )
  })

  it('blocks startup for unsupported platform and architecture', async () => {
    const result = await createAmneziaHelperStartupPreflight({
      profileId: 'amnezia-1',
      plan: createPlan(),
      backend: resolveHelperBackend({
        mode: 'production',
        proxyBackendPath: '/app/amnezia-helper-proxy-backend.cjs',
        helperStubPath: '/app/amnezia-helper-stub.cjs',
        productionBackendPath: '/tmp/amnezia-helper',
        validateExecutable: ({ executablePath }) => ({
          ok: false,
          path: executablePath,
          platform: 'freebsd',
          arch: 'mips',
          issues: [
            {
              code: 'unsupported_platform',
              message: 'unsupported platform',
              actualPlatform: 'freebsd'
            },
            {
              code: 'unsupported_arch',
              message: 'unsupported arch',
              actualArch: 'mips'
            }
          ],
          diagnostics: ['unsupported_platform', 'unsupported_arch']
        })
      }),
      prepareRuntimeConfig: prepareRuntimeConfig,
      tunEnabled: false
    })

    assert.equal(result.canStart, false)
    assert.ok(result.blockingReasons.some((reason) => reason.code === 'unsupported_platform'))
    assert.ok(result.blockingReasons.some((reason) => reason.code === 'unsupported_arch'))
  })

  it('blocks startup when production helper-required profile fields are missing', async () => {
    const result = await createAmneziaHelperStartupPreflight({
      profileId: 'amnezia-1',
      plan: createPlan({
        interface: {
          addresses: [],
          dns: ['1.1.1.1'],
          mtu: 1280
        },
        peer: {
          endpoint: 'vpn.example.com:51820',
          publicKey: 'server-public-key',
          allowedIps: [],
          persistentKeepalive: 25
        }
      }),
      backend: createAvailableProductionBackend(),
      prepareRuntimeConfig: prepareRuntimeConfig,
      tunEnabled: false
    })

    assert.equal(result.canStart, false)
    assert.equal(result.profileStatus, 'blocked')
    assert.equal(result.configStatus, 'blocked')
    assert.ok(result.blockingReasons.some((reason) => reason.code === 'missing_allowed_ips'))
    assert.ok(result.blockingReasons.some((reason) => reason.code === 'missing_interface_address'))
  })

  it('allows startup when backend, profile, config, and non-TUN mode are valid', async () => {
    const result = await createAmneziaHelperStartupPreflight({
      profileId: 'amnezia-1',
      plan: createPlan(),
      backend: createAvailableProductionBackend(),
      prepareRuntimeConfig: prepareRuntimeConfig,
      tunEnabled: false,
      now: () => 1710000000000
    })

    assert.equal(result.canStart, true)
    assert.equal(result.backendStatus, 'ok')
    assert.equal(result.profileStatus, 'ok')
    assert.equal(result.endpointStatus, 'ok')
    assert.equal(result.configStatus, 'ok')
    assert.equal(result.tunBypassStatus, 'not_required')
    assert.equal(result.localEndpoint?.port, 19080)
  })

  it('blocks startup under TUN when helper upstream bypass resolution fails', async () => {
    const result = await createAmneziaHelperStartupPreflight({
      profileId: 'amnezia-1',
      plan: createPlan(),
      backend: createAvailableProductionBackend(),
      prepareRuntimeConfig: prepareRuntimeConfig,
      tunEnabled: true,
      resolveTunBypass: async () =>
        createAmneziaHelperTunBypassFailed({
          endpointHost: 'missing.example.test',
          error: 'ENOTFOUND',
          now: () => 1710000000000
        })
    })

    assert.equal(result.canStart, false)
    assert.equal(result.tunBypassStatus, 'failed')
    assert.ok(
      result.blockingReasons.some((reason) => reason.code === 'tun_bypass_resolution_failure')
    )
    assert.equal(
      mapStartupPreflightReasonToRuntimeCategory('tun_bypass_resolution_failure'),
      'tun_bypass_resolution_failure'
    )
  })
})

function createAvailableProductionBackend() {
  return resolveHelperBackend({
    mode: 'production',
    proxyBackendPath: '/app/amnezia-helper-proxy-backend.cjs',
    helperStubPath: '/app/amnezia-helper-stub.cjs',
    productionBackendPath: '/opt/koala/amnezia-helper',
    validateExecutable: ({ executablePath }) => ({
      ok: true,
      path: executablePath,
      platform,
      arch: process.arch,
      issues: [],
      diagnostics: ['validated']
    })
  })
}

function prepareRuntimeConfig(config: AmneziaHelperRuntimeConfig): AmneziaHelperRuntimeConfig {
  return withLocalProxyEndpoint(config, {
    host: config.localProxy.host,
    port: 19080,
    protocol: 'socks5'
  })
}

function createPlan(patch: Partial<NormalizedProfile> = {}) {
  return getExecutionPlan(
    {
      ...createNormalizedProfile(),
      ...patch
    },
    platform
  )
}

function createNormalizedProfile(): NormalizedProfile {
  return {
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
}
