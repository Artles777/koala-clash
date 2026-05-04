import * as assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, it } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  AmneziaHelperVerificationReport,
  createDefaultVerificationProfile,
  loadVerificationProfile,
  resolveResourcesFilesDirFromPackagedPath,
  runAmneziaHelperVerification
} from '../src/main/runtime/amnezia-helper-verification'
import { AmneziaHelperConnectivityResult } from '../src/main/runtime/amnezia-helper-connectivity'
import { createAmneziaHelperRule } from '../src/core/routing/amnezia-helper-rules'
import { createAmneziaHelperTunBypassFailed } from '../src/core/routing/amnezia-helper-tun-bypass'
import { createAmneziaHelperUdpCapability } from '../src/core/routing/amnezia-helper-udp-capability'

let cleanupTasks: Array<() => Promise<void>> = []

describe('Amnezia helper packaged verification', () => {
  afterEach(async () => {
    const tasks = cleanupTasks
    cleanupTasks = []
    await Promise.all(tasks.map((task) => task()))
  })

  it('builds a passing staged report for the proxy prototype lifecycle with mocked connectivity', async () => {
    const runtimeDir = await createTempDir()
    const report = await runAmneziaHelperVerification({
      backendMode: 'proxy-prototype',
      runtimeDir,
      spawnSelfCheck: true,
      validateConnectivity: async ({ profileId, endpoint }) =>
        createConnectivityResult(profileId, endpoint.port)
    })

    assert.equal(report.schemaVersion, 1)
    assert.equal(report.summary.status, 'passed')
    assert.equal(report.backendKind, 'prototype')
    assert.equal(report.backendSource, 'prototype')
    assert.equal(report.packaged, false)
    assert.equal(report.startupResult?.status, 'running')
    assert.equal(report.readinessResult?.status, 'ready')
    assert.equal(report.connectivityResult?.status, 'verified')
    assert.equal(report.udpSupport, 'unknown')
    assert.equal(report.runtimeAdvertisesUdp, false)
    assert.equal(report.routingInjectionState?.status, 'injected')
    assert.equal(report.cleanupResult?.status, 'stopped')
    assert.equal(report.cleanupResult?.tempConfigRemoved, true)
    assertStage(report, 'backend_resolution', 'passed')
    assertStage(report, 'self_check', 'passed')
    assertStage(report, 'startup', 'passed')
    assertStage(report, 'readiness', 'passed')
    assertStage(report, 'connectivity', 'passed')
    assertStage(report, 'routing_injection', 'passed')
    assertStage(report, 'cleanup', 'passed')
  })

  it('classifies missing production helper reports before startup', async () => {
    const report = await runAmneziaHelperVerification({
      backendMode: 'production',
      backendPath: path.join(os.tmpdir(), 'missing-amnezia-helper-smoke'),
      resolveOnly: true
    })

    assert.equal(report.summary.status, 'failed')
    assert.equal(report.summary.failedStage, 'backend_resolution')
    assert.equal(report.backendKind, 'unavailable')
    assert.equal(report.backendSource, 'override')
    assert.equal(report.executableValidation?.ok, false)
    assert.ok(report.diagnostics.some((diagnostic) => diagnostic.code === 'missing'))
    assertStage(report, 'backend_resolution', 'failed')
    assertStage(report, 'startup', 'skipped')
  })

  it('marks packaged-app resolution separately from explicit overrides', async () => {
    const report = await runAmneziaHelperVerification({
      backendMode: 'production',
      packagedAppPath: '/Applications/Koala Clash.app',
      resolveOnly: true
    })

    assert.equal(report.backendSource, 'packaged_app')
    assert.equal(report.packaged, true)
    assert.equal(
      report.resourcesFilesDir,
      path.resolve('/Applications/Koala Clash.app/Contents/Resources/files')
    )
  })

  it('builds a TUN-aware staged report with bypass and runtime injection checks', async () => {
    const runtimeDir = await createTempDir()
    const profile = {
      ...createDefaultVerificationProfile(),
      transport: {
        ...createDefaultVerificationProfile().transport,
        endpoint: {
          host: '203.0.113.10',
          port: 51820
        }
      },
      peer: {
        ...createDefaultVerificationProfile().peer,
        endpoint: '203.0.113.10:51820'
      }
    }
    const report = await runAmneziaHelperVerification({
      backendMode: 'proxy-prototype',
      runtimeScenario: 'tun',
      runtimeDir,
      profile,
      helperRules: [
        createAmneziaHelperRule({
          id: 'rule-1',
          type: 'DOMAIN-SUFFIX',
          value: 'example.com',
          now: 1710000000000
        })
      ],
      validateConnectivity: async ({ profileId, endpoint }) =>
        createConnectivityResult(profileId, endpoint.port)
    })

    assert.equal(report.runtimeScenario, 'tun')
    assert.equal(report.tunEnabled, true)
    assert.equal(report.tunDnsHijackEnabled, true)
    assert.equal(report.tunDnsEnhancedMode, 'fake-ip')
    assert.equal(report.helperRuleReliability, 'reliable')
    assert.equal(report.helperRuleReliabilityReason, 'domain_rules_fake_ip_dns_hijack')
    assert.equal(report.tunScenarioResult, 'passed')
    assert.equal(report.helperTunBypassActive, true)
    assert.equal(report.helperTunBypassResolutionStatus, 'resolved')
    assert.deepEqual(report.helperTunBypassIps, ['203.0.113.10'])
    assert.deepEqual(report.tunRuntimeInjection?.routeExcludeAddresses, ['203.0.113.10/32'])
    assert.equal(report.tunRuntimeInjection?.helperOutboundInjected, true)
    assert.equal(report.tunRuntimeInjection?.helperRulesInjected, true)
    assert.equal(report.tunRuntimeInjection?.helperOutboundUdp, false)
    assert.deepEqual(report.tunRuntimeInjection?.serializedHelperRules, [
      'DOMAIN-SUFFIX,example.com,AMNEZIA_HELPER'
    ])
    assert.equal(report.cleanupRestored, true)
    assertStage(report, 'routing_injection', 'passed')
  })

  it('reports UDP as advertised only after explicit UDP capability validation succeeds', async () => {
    const runtimeDir = await createTempDir()
    const report = await runAmneziaHelperVerification({
      backendMode: 'proxy-prototype',
      runtimeDir,
      validateConnectivity: async ({ profileId, endpoint }) =>
        createConnectivityResult(profileId, endpoint.port),
      validateUdpCapability: async () =>
        createAmneziaHelperUdpCapability(
          'supported',
          true,
          'udp_associate_validated',
          1710000000000
        )
    })

    assert.equal(report.udpSupport, 'supported')
    assert.equal(report.udpValidated, true)
    assert.equal(report.runtimeAdvertisesUdp, true)
    assert.equal(report.routingInjectionState?.udpCapability?.udpSupport, 'supported')
  })

  it('can append optional lifecycle stability validation to the smoke report', async () => {
    const runtimeDir = await createTempDir()
    const report = await runAmneziaHelperVerification({
      backendMode: 'proxy-prototype',
      runtimeDir,
      runStability: true,
      stabilityCycles: 1,
      stabilitySoakDurationMs: 5,
      stabilitySoakIntervalMs: 1,
      validateConnectivity: async ({ profileId, endpoint }) =>
        createConnectivityResult(profileId, endpoint.port)
    })

    assert.equal(report.summary.status, 'passed')
    assert.equal(report.stabilityResult?.summary.status, 'passed')
    assert.equal(report.lifecycleStressPassed, true)
    assert.equal(report.reloadResiliencePassed, true)
    assert.equal(report.repeatedStartStopCount, 1)
    assert.equal(report.cleanupLeakDetected, false)
    assertStage(report, 'stability', 'passed')
    assert.ok(report.releaseReadiness.warnings.includes('recovery_not_validated'))
  })

  it('reports unlikely TUN domain-rule reliability when DNS hijack is disabled', async () => {
    const runtimeDir = await createTempDir()
    const profile = {
      ...createDefaultVerificationProfile(),
      transport: {
        ...createDefaultVerificationProfile().transport,
        endpoint: {
          host: '203.0.113.10',
          port: 51820
        }
      },
      peer: {
        ...createDefaultVerificationProfile().peer,
        endpoint: '203.0.113.10:51820'
      }
    }
    const report = await runAmneziaHelperVerification({
      backendMode: 'proxy-prototype',
      runtimeScenario: 'tun',
      runtimeDir,
      profile,
      dnsHijackEnabled: false,
      helperRules: [
        createAmneziaHelperRule({
          id: 'rule-1',
          type: 'DOMAIN',
          value: 'example.com',
          now: 1710000000000
        })
      ],
      validateConnectivity: async ({ profileId, endpoint }) =>
        createConnectivityResult(profileId, endpoint.port)
    })

    assert.equal(report.helperRuleReliability, 'unlikely')
    assert.equal(report.helperRuleReliabilityReason, 'domain_rules_dns_hijack_missing')
    assert.equal(report.tunScenarioResult, 'passed')
    assert.ok(
      report.diagnostics.some(
        (diagnostic) => diagnostic.code === 'tun_dns_rule_reliability_unlikely'
      )
    )
    assert.ok(report.releaseReadiness.warnings.includes('tun_dns_rule_reliability_unlikely'))
  })

  it('marks TUN helper startup as safety-blocked when bypass resolution fails', async () => {
    const runtimeDir = await createTempDir()
    const report = await runAmneziaHelperVerification({
      backendMode: 'proxy-prototype',
      runtimeScenario: 'tun',
      runtimeDir,
      resolveTunBypass: async () =>
        createAmneziaHelperTunBypassFailed({
          endpointHost: 'missing.example.test',
          error: 'ENOTFOUND'
        }),
      validateConnectivity: async ({ profileId, endpoint }) =>
        createConnectivityResult(profileId, endpoint.port)
    })

    assert.equal(report.summary.status, 'failed')
    assert.equal(report.summary.failedStage, 'startup')
    assert.equal(report.tunScenarioResult, 'blocked')
    assert.equal(report.tunSafetyBlocked, true)
    assert.equal(report.helperTunBypassResolutionStatus, 'failed')
    assert.ok(
      report.diagnostics.some((diagnostic) => diagnostic.code === 'tun_bypass_resolution_failure')
    )
    assert.ok(
      report.diagnostics.some((diagnostic) => diagnostic.code === 'tun_helper_blocked_for_safety')
    )
    assert.ok(report.releaseReadiness.blockers.includes('tun_safety_blocked'))
  })

  it('loads normalized profile fixtures and derives packaged resources paths', async () => {
    const fixture = await loadVerificationProfile(
      path.resolve('fixtures/amnezia-helper/normalized-profile.json')
    )

    assert.equal(fixture.id, 'amnezia-smoke-profile')
    assert.equal(fixture.protocol, 'amneziawg')
    assert.equal(
      resolveResourcesFilesDirFromPackagedPath('/Applications/Koala Clash.app', 'darwin'),
      path.resolve('/Applications/Koala Clash.app/Contents/Resources/files')
    )
    assert.equal(
      resolveResourcesFilesDirFromPackagedPath('C:/Program Files/Koala Clash', 'win32').replaceAll(
        '\\',
        '/'
      ),
      path.resolve('C:/Program Files/Koala Clash/resources/files').replaceAll('\\', '/')
    )
  })

  it('emits machine-readable JSON from the smoke CLI', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        'scripts/amnezia-helper-smoke.ts',
        '--resolve-only',
        '--backend-path',
        path.join(os.tmpdir(), 'missing-amnezia-helper-cli'),
        '--compact'
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf-8'
      }
    )

    assert.equal(result.status, 1)
    const report = JSON.parse(result.stdout) as AmneziaHelperVerificationReport
    assert.equal(report.schemaVersion, 1)
    assert.equal(report.summary.status, 'failed')
    assert.equal(report.summary.failedStage, 'backend_resolution')
    assert.ok(Array.isArray(report.stages))
    assert.ok(report.stages.some((stage) => stage.stage === 'backend_resolution'))
  })
})

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'koala-amnezia-smoke-test-'))
  cleanupTasks.push(async () => rm(dir, { recursive: true, force: true }))
  return dir
}

function createConnectivityResult(
  profileId: string,
  port: number
): AmneziaHelperConnectivityResult {
  return {
    profileId,
    status: 'verified',
    validationStage: 'upstream_request',
    checkedAt: Date.now(),
    durationMs: 10,
    latencyMs: 3,
    endpoint: {
      host: '127.0.0.1',
      port,
      protocol: 'socks5'
    },
    stages: [
      { stage: 'tcp_connect', status: 'passed', durationMs: 3 },
      { stage: 'socks5_handshake', status: 'passed', durationMs: 3 },
      { stage: 'upstream_request', status: 'passed', durationMs: 4 }
    ]
  }
}

function assertStage(
  report: AmneziaHelperVerificationReport,
  stageName: string,
  status: string
): void {
  const stage = report.stages.find((item) => item.stage === stageName)
  assert.ok(stage, `missing stage ${stageName}`)
  assert.equal(stage.status, status)
}
