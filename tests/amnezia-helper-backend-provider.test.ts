import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  generateBackendConfig,
  getBackendLaunchArgs,
  getProductionBackendBinaryName,
  getProductionBackendPathCandidates,
  parseBackendDiagnostics,
  resolveHelperBackend,
  resolveProductionBackendPath,
  validateProductionBackendExecutable
} from '../src/main/runtime/amnezia-helper-backend-provider'
import { createAmneziaHelperRuntimeConfig } from '../src/core/profiles/amnezia-helper-runtime-config'
import { NormalizedProfile } from '../src/core/profiles/normalized-profile'

let cleanupTasks: Array<() => void> = []

describe('Amnezia helper backend provider', () => {
  afterEach(() => {
    const tasks = cleanupTasks
    cleanupTasks = []
    tasks.forEach((task) => task())
  })

  it('resolves the proxy prototype backend without changing the runtime config contract', () => {
    const backend = resolveHelperBackend({
      mode: 'proxy-prototype',
      command: '/electron',
      proxyBackendPath: '/app/amnezia-helper-proxy-backend.cjs',
      helperStubPath: '/app/amnezia-helper-stub.cjs',
      exists: (filePath) => filePath === '/app/amnezia-helper-proxy-backend.cjs'
    })
    const runtimeConfig = createRuntimeConfig('proxy-prototype')
    const backendConfig = generateBackendConfig(backend, runtimeConfig)
    const args = getBackendLaunchArgs(backend, {
      configPath: '/tmp/session.json',
      sessionId: 'session-1',
      profileId: 'amnezia-1'
    })

    assert.equal(backend.kind, 'prototype')
    assert.equal(backend.available, true)
    assert.equal(backend.command, '/electron')
    assert.deepEqual(args, [
      '/app/amnezia-helper-proxy-backend.cjs',
      '--config',
      '/tmp/session.json',
      '--session-id',
      'session-1',
      '--profile-id',
      'amnezia-1'
    ])
    assert.equal(backendConfig, runtimeConfig)
  })

  it('resolves an available production backend and generates production config', () => {
    const helperPath = createExecutable('amnezia-helper')
    const backend = resolveHelperBackend({
      mode: 'production',
      proxyBackendPath: '/app/amnezia-helper-proxy-backend.cjs',
      helperStubPath: '/app/amnezia-helper-stub.cjs',
      productionBackendPath: helperPath,
      platform: process.platform,
      arch: process.arch
    })
    const backendConfig = generateBackendConfig(backend, createRuntimeConfig('production'))
    const args = getBackendLaunchArgs(backend, {
      configPath: '/tmp/session.json',
      sessionId: 'session-1',
      profileId: 'amnezia-1'
    })

    assert.equal(backend.kind, 'production')
    assert.equal(backend.available, true)
    assert.equal(backend.command, helperPath)
    assert.deepEqual(args, [
      'run',
      '--config',
      '/tmp/session.json',
      '--session-id',
      'session-1',
      '--profile-id',
      'amnezia-1',
      '--mode',
      'proxy'
    ])
    assert.equal(
      'kind' in backendConfig ? backendConfig.kind : undefined,
      'koala-amnezia-helper-production-config'
    )
  })

  it('marks production backend as unavailable without implicit prototype fallback', () => {
    const backend = resolveHelperBackend({
      mode: 'production',
      proxyBackendPath: '/app/amnezia-helper-proxy-backend.cjs',
      helperStubPath: '/app/amnezia-helper-stub.cjs',
      productionBackendPath: '/missing/amnezia-helper',
      exists: () => false
    })

    assert.equal(backend.kind, 'unavailable')
    assert.equal(backend.available, false)
    assert.equal(backend.executablePath, '/missing/amnezia-helper')
    assert.ok(backend.diagnostics.some((message) => message.includes('proxy-prototype')))
  })

  it('builds desktop production backend path candidates for packaged resources', () => {
    const resolved = resolveProductionBackendPath({
      resourcesFilesDir: '/Applications/Koala/resources/files',
      platform: 'darwin',
      arch: 'arm64',
      exists: (filePath) =>
        filePath ===
        '/Applications/Koala/resources/files/amnezia-helper/darwin/arm64/amnezia-helper'
    })

    assert.equal(resolved.found, true)
    assert.equal(resolved.path.endsWith('/amnezia-helper/darwin/arm64/amnezia-helper'), true)
    assert.equal(getProductionBackendBinaryName('win32'), 'amnezia-helper.exe')
    assert.equal(getProductionBackendBinaryName('linux'), 'amnezia-helper')

    assert.deepEqual(
      getProductionBackendPathCandidates({
        resourcesFilesDir: 'C:\\Koala\\resources\\files',
        platform: 'win32',
        arch: 'x64'
      }).map((value) => value.replaceAll('\\', '/')),
      [
        'C:/Koala/resources/files/amnezia-helper/win32/x64/amnezia-helper.exe',
        'C:/Koala/resources/files/amnezia-helper/win32-x64/amnezia-helper.exe',
        'C:/Koala/resources/files/amnezia-helper/win32/amnezia-helper.exe',
        'C:/Koala/resources/files/amnezia-helper.exe'
      ]
    )
  })

  it('prefers an explicit backend override over bundled candidates', () => {
    const explicit = createExecutable('override-amnezia-helper')
    const resolved = resolveProductionBackendPath({
      explicitPath: explicit,
      resourcesFilesDir: '/Applications/Koala/resources/files',
      platform: 'darwin',
      arch: 'arm64',
      exists: () => true
    })

    assert.equal(resolved.explicit, true)
    assert.deepEqual(resolved.candidates, [explicit])
    assert.equal(resolved.path, explicit)
  })

  it('validates production backend executable availability and permissions', () => {
    const helperPath = createExecutable('amnezia-helper')
    const valid = validateProductionBackendExecutable({
      executablePath: helperPath,
      platform: process.platform,
      arch: process.arch
    })
    const missing = validateProductionBackendExecutable({
      executablePath: `${helperPath}-missing`,
      platform: process.platform,
      arch: process.arch
    })
    const unsupported = validateProductionBackendExecutable({
      executablePath: helperPath,
      platform: 'freebsd',
      arch: 'mips'
    })
    const denied = validateProductionBackendExecutable({
      executablePath: helperPath,
      platform: 'linux',
      arch: 'x64',
      exists: () => true,
      stat: () => ({ isFile: () => true }),
      access: () => {
        throw new Error('EACCES')
      }
    })

    assert.equal(valid.ok, true)
    assert.equal(missing.ok, false)
    assert.ok(missing.issues.some((issue) => issue.code === 'missing'))
    assert.ok(unsupported.issues.some((issue) => issue.code === 'unsupported_platform'))
    assert.ok(unsupported.issues.some((issue) => issue.code === 'unsupported_arch'))
    assert.ok(denied.issues.some((issue) => issue.code === 'permission_denied'))
  })

  it('detects manifest platform or architecture mismatch when metadata is bundled', () => {
    const helperPath = createExecutable('amnezia-helper')
    writeFileSync(
      `${helperPath}.json`,
      JSON.stringify({
        name: 'amnezia-helper',
        version: '0.0.1',
        platform: process.platform,
        arch: process.arch === 'x64' ? 'arm64' : 'x64'
      }),
      'utf-8'
    )

    const result = validateProductionBackendExecutable({
      executablePath: helperPath,
      platform: process.platform,
      arch: process.arch
    })

    assert.equal(result.ok, false)
    assert.ok(result.issues.some((issue) => issue.code === 'arch_mismatch'))
  })

  it('maps backend stdout and stderr messages into diagnostics', () => {
    assert.equal(
      parseBackendDiagnostics('CONFIG_ACCEPTED profile=amnezia-1')?.kind,
      'config_accepted'
    )
    assert.equal(
      parseBackendDiagnostics('READY local proxy 127.0.0.1:19080')?.kind,
      'local_proxy_ready'
    )
    assert.equal(
      parseBackendDiagnostics('unsupported config: missing key')?.kind,
      'unsupported_config'
    )
    assert.equal(parseBackendDiagnostics('listen failed: EADDRINUSE')?.kind, 'startup_failed')
    assert.equal(parseBackendDiagnostics('spawn failed: ENOENT')?.kind, 'backend_spawn_failure')
    assert.equal(
      parseBackendDiagnostics('permission denied: EACCES')?.kind,
      'backend_permission_denied'
    )
  })
})

function createExecutable(name: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'koala-amnezia-backend-'))
  cleanupTasks.push(() => rmSync(dir, { recursive: true, force: true }))
  const filePath = path.join(dir, name)
  writeFileSync(filePath, '#!/bin/sh\nexit 0\n', 'utf-8')
  chmodSync(filePath, 0o755)
  return filePath
}

function createRuntimeConfig(backendMode: 'production' | 'proxy-prototype' | 'stub') {
  return createAmneziaHelperRuntimeConfig(createNormalizedProfile(), {
    backendMode,
    localProxy: {
      host: '127.0.0.1',
      port: 19080,
      protocol: 'socks5'
    },
    generatedAt: 1710000000000,
    allowEphemeralPort: false
  })
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
