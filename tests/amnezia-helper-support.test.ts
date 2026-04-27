import * as assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, it } from 'node:test'
import type { AmneziaHelperRulePack } from '../src/core/routing/amnezia-helper-rule-packs'
import { createAmneziaHelperRule } from '../src/core/routing/amnezia-helper-rules'
import { evaluateAmneziaHelperTunRuleReliability } from '../src/core/routing/amnezia-helper-tun-rule-reliability'
import { createAmneziaHelperUdpCapability } from '../src/core/routing/amnezia-helper-udp-capability'
import type { AmneziaHelperSession } from '../src/main/runtime/amnezia-helper-manager'
import {
  AmneziaHelperBackendSupportSnapshot,
  createAmneziaHelperDiagnosticsBundle,
  createAmneziaHelperSupportSummary,
  createSessionSupportSnapshot,
  createTunSupportSnapshot,
  createRulePacksSupportSummary,
  writeAmneziaHelperDiagnosticsBundle
} from '../src/main/runtime/amnezia-helper-support'

const backendAvailable: AmneziaHelperBackendSupportSnapshot = {
  mode: 'production',
  kind: 'production',
  available: true,
  command: '/opt/koala/amnezia-helper',
  executablePath: '/opt/koala/amnezia-helper',
  diagnostics: ['production backend resolved'],
  validation: {
    ok: true,
    path: '/opt/koala/amnezia-helper',
    platform: 'darwin',
    arch: 'arm64',
    issues: [],
    diagnostics: ['validated'],
    manifest: {
      name: 'amnezia-helper',
      version: '1.0.0',
      platform: 'darwin',
      arch: 'arm64'
    }
  },
  helperChecksumSha256: 'abc123',
  helperVersion: '1.0.0'
}

function createSession(patch: Partial<AmneziaHelperSession> = {}): AmneziaHelperSession {
  return {
    profileId: 'profile-1',
    sessionId: 'session-1',
    pid: 1234,
    status: 'running',
    startedAt: 1000,
    command: '/opt/koala/amnezia-helper',
    args: ['run', '--config', '/tmp/private-config.json'],
    tempConfigPath: '/tmp/private-config.json',
    backendMode: 'production',
    readiness: 'ready',
    localEndpoint: {
      host: '127.0.0.1',
      port: 10888,
      protocol: 'socks5'
    },
    startupDiagnostics: [],
    runtimeDiagnostics: [],
    configStatus: 'generated',
    routingTarget: {
      profileId: 'profile-1',
      groupName: 'AMNEZIA_HELPER',
      outboundName: 'AMNEZIA_HELPER_PROXY',
      status: 'injected',
      endpoint: {
        host: '127.0.0.1',
        port: 10888,
        protocol: 'socks5'
      },
      updatedAt: 1000
    },
    connectivityStatus: 'unknown',
    validationStage: 'not_started',
    udpCapability: createAmneziaHelperUdpCapability(
      'supported',
      true,
      'udp_associate_validated',
      1710000000000
    ),
    ...patch
  }
}

describe('Amnezia helper support diagnostics', () => {
  it('classifies missing production helper as a release blocker', () => {
    const summary = createAmneziaHelperSupportSummary({
      backend: {
        ...backendAvailable,
        available: false,
        kind: 'unavailable',
        validation: {
          ok: false,
          path: '/missing/amnezia-helper',
          platform: 'linux',
          arch: 'x64',
          issues: [
            {
              code: 'missing',
              message: 'missing helper',
              path: '/missing/amnezia-helper'
            }
          ],
          diagnostics: ['missing: missing helper']
        }
      },
      session: undefined,
      rules: createRulePacksSupportSummary([]),
      routingTarget: undefined
    })

    assert.equal(summary.severity, 'blocker')
    assert.equal(summary.primaryStatus.code, 'helper_missing')
    assert.equal(summary.releaseReadiness.status, 'blocked')
  })

  it('classifies ready but unvalidated proxy as a warning', () => {
    const bundle = createAmneziaHelperDiagnosticsBundle({
      backend: backendAvailable,
      session: createSession({
        connectivityStatus: 'unknown',
        validationStage: 'not_started'
      }),
      rulePacks: []
    })

    assert.equal(bundle.support.severity, 'warning')
    assert.equal(bundle.support.primaryStatus.code, 'proxy_ready_not_validated')
    assert.equal(bundle.support.releaseReadiness.status, 'warning')
  })

  it('classifies a verified helper as supported', () => {
    const bundle = createAmneziaHelperDiagnosticsBundle({
      backend: backendAvailable,
      session: createSession({
        connectivityStatus: 'verified',
        validationStage: 'upstream_request'
      }),
      rulePacks: [],
      stability: {
        status: 'passed',
        lifecycleStressPassed: true,
        reloadResiliencePassed: true,
        recoveryPassed: true,
        soakDurationMs: 1000,
        repeatedStartStopCount: 3,
        staleStateDetected: false,
        cleanupLeakDetected: false
      }
    })

    assert.equal(bundle.support.primaryStatus.code, 'helper_ready_validated')
    assert.equal(bundle.support.releaseReadiness.status, 'supported')
    assert.equal(bundle.readinessSummary.overallStatus, 'ready')
    assert.equal(bundle.readinessSummary.helperStatus, 'ready')
    assert.equal(bundle.readinessSummary.stabilityStatus, 'ready')
    assert.equal(bundle.udp.runtimeAdvertisesUdp, true)
  })

  it('keeps readiness conservative when stability has not been validated', () => {
    const bundle = createAmneziaHelperDiagnosticsBundle({
      backend: backendAvailable,
      session: createSession({
        connectivityStatus: 'verified',
        validationStage: 'upstream_request'
      }),
      rulePacks: []
    })

    assert.equal(bundle.support.releaseReadiness.status, 'supported')
    assert.equal(bundle.readinessSummary.overallStatus, 'ready_with_warnings')
    assert.equal(bundle.readinessSummary.stabilityStatus, 'unknown')
    assert.ok(
      bundle.readinessSummary.recommendedActions.some(
        (action) => action.code === 'run_stability_smoke'
      )
    )
  })

  it('warns when a ready helper is downgraded to TCP-only because UDP is unknown', () => {
    const bundle = createAmneziaHelperDiagnosticsBundle({
      backend: backendAvailable,
      session: createSession({
        connectivityStatus: 'verified',
        validationStage: 'upstream_request',
        udpCapability: createAmneziaHelperUdpCapability(
          'unknown',
          false,
          'backend_capability_unknown',
          1710000000000
        )
      }),
      rulePacks: []
    })

    assert.equal(bundle.udp.runtimeAdvertisesUdp, false)
    assert.equal(bundle.readinessSummary.udpStatus, 'warning')
    assert.equal(bundle.readinessSummary.overallStatus, 'ready_with_warnings')
    assert.ok(bundle.support.statuses.some((status) => status.code === 'udp_tcp_only'))
    assert.ok(
      bundle.readinessSummary.recommendedActions.some(
        (action) => action.code === 'treat_udp_as_tcp_only'
      )
    )
    assert.equal(bundle.support.releaseReadiness.status, 'warning')
  })

  it('marks a running helper under TUN as compatible when bypass is active', () => {
    const resolvedTunBypass = {
      status: 'resolved' as const,
      endpointHost: '203.0.113.10',
      ips: ['203.0.113.10'],
      routeExcludeAddresses: ['203.0.113.10/32'],
      warnings: [],
      resolvedAt: 1710000000000
    }
    const summary = createAmneziaHelperSupportSummary({
      backend: backendAvailable,
      session: createSessionSupportSnapshot(
        createSession({
          connectivityStatus: 'verified',
          validationStage: 'upstream_request'
        })
      ),
      routingTarget: createSession().routingTarget,
      rules: createRulePacksSupportSummary([]),
      tun: createTunSupportSnapshot(true, resolvedTunBypass, resolvedTunBypass)
    })

    assert.ok(summary.statuses.some((status) => status.code === 'tun_compatible'))
    assert.equal(summary.releaseReadiness.status, 'supported')
  })

  it('adds a support warning when TUN domain helper rules are unlikely to match', () => {
    const rule = createAmneziaHelperRule({
      id: 'domain-rule',
      type: 'DOMAIN-SUFFIX',
      value: 'example.com',
      now: 1710000000000
    })
    const summary = createAmneziaHelperSupportSummary({
      backend: backendAvailable,
      session: createSessionSupportSnapshot(
        createSession({
          connectivityStatus: 'verified',
          validationStage: 'upstream_request'
        })
      ),
      routingTarget: createSession().routingTarget,
      rules: createRulePacksSupportSummary([
        {
          id: 'pack-1',
          name: 'Domains',
          enabled: true,
          createdAt: 1,
          rules: [rule]
        }
      ]),
      tun: createTunSupportSnapshot(
        true,
        undefined,
        undefined,
        evaluateAmneziaHelperTunRuleReliability({
          tunEnabled: true,
          dnsEnabled: true,
          dnsHijackEnabled: false,
          dnsEnhancedMode: 'fake-ip',
          rules: [rule]
        })
      )
    })

    assert.ok(summary.statuses.some((status) => status.code === 'tun_domain_rules_unlikely'))
    assert.equal(summary.releaseReadiness.status, 'warning')
  })

  it('marks failed stability as a readiness blocker', () => {
    const bundle = createAmneziaHelperDiagnosticsBundle({
      backend: backendAvailable,
      session: createSession({
        connectivityStatus: 'verified',
        validationStage: 'upstream_request'
      }),
      rulePacks: [],
      stability: {
        status: 'failed',
        lifecycleStressPassed: false,
        reloadResiliencePassed: true,
        recoveryPassed: false,
        staleStateDetected: true,
        cleanupLeakDetected: false,
        summaryMessage: 'stale routing state detected'
      }
    })

    assert.equal(bundle.readinessSummary.overallStatus, 'blocked')
    assert.equal(bundle.readinessSummary.stabilityStatus, 'blocked')
    assert.ok(bundle.readinessSummary.topIssues.some((issue) => issue.code === 'stability_failed'))
    assert.ok(
      bundle.readinessSummary.recommendedActions.some(
        (action) => action.code === 'inspect_stability_report'
      )
    )
  })

  it('maps TUN bypass resolution failures to helper blockers', () => {
    const bundle = createAmneziaHelperDiagnosticsBundle({
      backend: backendAvailable,
      session: createSession({
        status: 'failed',
        readiness: 'failed',
        lastError: 'ENOTFOUND',
        runtimeDiagnostics: [
          {
            category: 'tun_bypass_resolution_failure',
            stage: 'tun_bypass_resolution',
            message: 'ENOTFOUND',
            at: 1710000000000
          }
        ]
      }),
      rulePacks: [],
      tun: createTunSupportSnapshot(true, {
        status: 'failed',
        endpointHost: 'missing.example.test',
        ips: [],
        routeExcludeAddresses: [],
        warnings: ['failed to resolve Amnezia helper upstream endpoint'],
        error: 'ENOTFOUND',
        resolvedAt: 1710000000000
      })
    })

    assert.equal(bundle.support.primaryStatus.code, 'tun_blocked_for_helper')
    assert.equal(bundle.support.releaseReadiness.status, 'blocked')
    assert.equal(bundle.tun.helperBypassResolutionStatus, 'failed')
  })

  it('surfaces startup preflight blockers in support summaries', () => {
    const bundle = createAmneziaHelperDiagnosticsBundle({
      backend: backendAvailable,
      startupPreflight: {
        profileId: 'profile-1',
        checkedAt: 1710000000000,
        canStart: false,
        backendStatus: 'ok',
        profileStatus: 'blocked',
        endpointStatus: 'ok',
        configStatus: 'blocked',
        tunBypassStatus: 'not_required',
        blockingReasons: [
          {
            code: 'missing_allowed_ips',
            stage: 'production_config',
            message: 'Production Amnezia helper requires at least one allowed IP range'
          }
        ],
        warnings: [],
        backend: {
          mode: 'production',
          kind: 'production',
          available: true,
          command: '/opt/koala/amnezia-helper',
          executablePath: '/opt/koala/amnezia-helper'
        }
      },
      rulePacks: []
    })

    assert.equal(bundle.support.primaryStatus.code, 'config_generation_failed')
    assert.equal(bundle.support.releaseReadiness.status, 'blocked')
    assert.equal(bundle.startupPreflight?.canStart, false)
    assert.equal(
      bundle.summaryExport.startupPreflight?.blockingReasonCodes[0],
      'missing_allowed_ips'
    )
  })

  it('exports a support-safe bundle shape without raw rule values or temp config paths', () => {
    const packs: AmneziaHelperRulePack[] = [
      {
        id: 'pack-1',
        name: 'Private domains',
        enabled: true,
        createdAt: 1,
        rules: [
          {
            id: 'rule-1',
            type: 'DOMAIN-SUFFIX',
            value: 'private.example',
            enabled: true,
            target: 'AMNEZIA_HELPER',
            createdAt: 1
          }
        ]
      }
    ]
    const bundle = createAmneziaHelperDiagnosticsBundle({
      backend: backendAvailable,
      session: createSession(),
      rulePacks: packs,
      logs: [{ at: 1, stream: 'manager', message: 'helper started' }]
    })
    const serialized = JSON.stringify(bundle)

    assert.equal(bundle.rules.totalRules, 1)
    assert.equal(bundle.rules.enabledRules, 1)
    assert.equal(bundle.session?.hasTempConfig, true)
    assert.equal(bundle.session?.argsCount, 3)
    assert.equal(hasOwn(bundle.session ?? {}, 'tempConfigPath'), false)
    assert.equal(hasOwn(bundle.summaryExport.helper, 'command'), false)
    assert.equal(hasOwn(bundle.summaryExport, 'logs'), false)
    assert.equal(serialized.includes('private.example'), false)
    assert.equal(serialized.includes('/tmp/private-config.json'), false)
  })

  it('writes diagnostics bundle JSON to the requested directory', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'koala-amnezia-support-'))
    try {
      const bundle = createAmneziaHelperDiagnosticsBundle({
        generatedAt: 1710000000000,
        backend: backendAvailable,
        session: createSession({
          connectivityStatus: 'verified',
          validationStage: 'upstream_request'
        }),
        rulePacks: []
      })
      const result = await writeAmneziaHelperDiagnosticsBundle(bundle, tempDir)
      const parsed = JSON.parse(await readFile(result.path, 'utf-8'))

      assert.equal(path.dirname(result.path), tempDir)
      assert.equal(parsed.schemaVersion, 1)
      assert.equal(parsed.support.primaryStatus.code, 'helper_ready_validated')
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}
