import * as assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import {
  injectDirectTunBypass,
  resolveDirectTunBypass
} from '../src/core/routing/direct-tun-bypass'
import {
  injectLearnedProcessBypass,
  resolveLearnedProcessBypass,
  type LearnedProcessBypassEntry
} from '../src/core/routing/learned-process-bypass'
import {
  clearObservedProcessBypassEntries,
  getObservedProcessBypassEntries,
  observeProcessBypassConnections
} from '../src/main/runtime/learned-process-bypass-state'

const now = 1_700_000_000_000

function learnedEntry(input: Partial<LearnedProcessBypassEntry> = {}): LearnedProcessBypassEntry {
  return {
    processName: 'Telegram',
    observedIp: '149.154.167.50',
    observedAt: now - 1000,
    ttlExpiresAt: now + 60_000,
    sourceConfidence: 'runtime_connection',
    platform: 'darwin',
    active: true,
    learnedFromRuntime: true,
    ...input
  }
}

describe('learned process-to-IP bypass', () => {
  beforeEach(() => {
    clearObservedProcessBypassEntries()
  })

  it('does not inject when the learned bypass feature is disabled', () => {
    const config = {
      tun: { enable: true },
      rules: ['PROCESS-NAME,Telegram,DIRECT']
    }
    const resolution = resolveLearnedProcessBypass({
      config,
      enabled: false,
      entries: [learnedEntry()],
      platform: 'darwin',
      now: () => now
    })
    const injection = injectLearnedProcessBypass(config, resolution)

    assert.equal(resolution.status, 'inactive')
    assert.equal(resolution.enabled, false)
    assert.equal(injection.injected, false)
    assert.equal(injection.reason, 'feature_disabled')
  })

  it('does not inject when TUN is disabled', () => {
    const config = {
      tun: { enable: false },
      rules: ['PROCESS-NAME,Telegram,DIRECT']
    }
    const resolution = resolveLearnedProcessBypass({
      config,
      enabled: true,
      entries: [learnedEntry()],
      platform: 'darwin',
      now: () => now
    })
    const injection = injectLearnedProcessBypass(config, resolution)

    assert.equal(resolution.status, 'inactive')
    assert.equal(resolution.warnings[0].code, 'tun_disabled')
    assert.equal(injection.injected, false)
    assert.equal(injection.reason, 'tun_disabled')
  })

  it('injects observed PROCESS-NAME DIRECT destination IPs as learned exclusions', () => {
    const config = {
      tun: { enable: true },
      rules: ['PROCESS-NAME,Telegram,DIRECT']
    }
    const resolution = resolveLearnedProcessBypass({
      config,
      enabled: true,
      entries: [learnedEntry()],
      platform: 'darwin',
      now: () => now
    })
    const injection = injectLearnedProcessBypass(config, resolution)

    assert.equal(resolution.status, 'active')
    assert.equal(resolution.active, true)
    assert.equal(resolution.ruleCount, 1)
    assert.equal(resolution.entryCount, 1)
    assert.deepEqual(resolution.routeExcludeAddresses, ['149.154.167.50/32'])
    assert.equal(resolution.ruleModes[0].effectiveMode, 'learned_bypass')
    assert.equal(injection.injected, true)
    assert.deepEqual(injection.config.tun?.['route-exclude-address'], ['149.154.167.50/32'])
  })

  it('expires stale learned entries instead of pretending bypass is active', () => {
    const config = {
      tun: { enable: true },
      rules: ['PROCESS-NAME,Telegram,DIRECT']
    }
    const resolution = resolveLearnedProcessBypass({
      config,
      enabled: true,
      entries: [learnedEntry({ ttlExpiresAt: now - 1 })],
      platform: 'darwin',
      now: () => now
    })
    const injection = injectLearnedProcessBypass(config, resolution)

    assert.equal(resolution.status, 'stale')
    assert.equal(resolution.active, false)
    assert.equal(resolution.expiredCount, 1)
    assert.equal(resolution.warnings[0].code, 'stale_observed_ips')
    assert.equal(resolution.ruleModes[0].effectiveMode, 'direct_only')
    assert.equal(injection.injected, false)
    assert.equal(injection.reason, 'bypass_not_resolved')
  })

  it('reports unsupported platforms explicitly', () => {
    const config = {
      tun: { enable: true },
      rules: ['PROCESS-NAME,Telegram,DIRECT']
    }
    const resolution = resolveLearnedProcessBypass({
      config,
      enabled: true,
      entries: [learnedEntry()],
      platform: 'freebsd',
      supportedPlatforms: ['darwin', 'linux', 'win32'],
      now: () => now
    })

    assert.equal(resolution.status, 'unsupported')
    assert.equal(resolution.supportedOnPlatform, false)
    assert.equal(resolution.warnings[0].code, 'unsupported_platform')
  })

  it('merges address DIRECT exclude and learned bypass without duplicates', async () => {
    const config = {
      tun: {
        enable: true,
        'route-exclude-address': ['10.0.0.1/32']
      },
      rules: ['IP-CIDR,203.0.113.10/32,DIRECT', 'PROCESS-NAME,Telegram,DIRECT']
    }

    const directResolution = await resolveDirectTunBypass({
      config,
      enabled: true
    })
    const withDirect = injectDirectTunBypass(config, directResolution).config
    const learnedResolution = resolveLearnedProcessBypass({
      config: withDirect,
      enabled: true,
      entries: [
        learnedEntry({ observedIp: '149.154.167.50' }),
        learnedEntry({ observedIp: '203.0.113.10' })
      ],
      platform: 'darwin',
      now: () => now
    })
    const withLearned = injectLearnedProcessBypass(withDirect, learnedResolution).config

    assert.deepEqual(withLearned.tun?.['route-exclude-address'], [
      '10.0.0.1/32',
      '149.154.167.50/32',
      '203.0.113.10/32'
    ])
  })

  it('learns only DIRECT ProcessName runtime connections from Mihomo metadata', () => {
    const payload = {
      connections: [
        {
          id: '1',
          rule: 'ProcessName',
          rulePayload: 'Telegram',
          chains: ['DIRECT'],
          metadata: {
            process: 'Telegram',
            destinationIP: '149.154.167.50'
          }
        },
        {
          id: '2',
          rule: 'DomainSuffix',
          rulePayload: 'example.com',
          chains: ['DIRECT'],
          metadata: {
            process: 'Browser',
            destinationIP: '203.0.113.10'
          }
        }
      ]
    } as unknown as ControllerConnections

    const result = observeProcessBypassConnections(payload, {
      now: () => now,
      ttlMs: 60_000,
      platform: 'darwin'
    })
    const entries = getObservedProcessBypassEntries()

    assert.equal(result.changed, true)
    assert.equal(result.observed, 1)
    assert.equal(entries.length, 1)
    assert.equal(entries[0].processName, 'Telegram')
    assert.equal(entries[0].observedIp, '149.154.167.50')
    assert.equal(entries[0].ttlExpiresAt, now + 60_000)
  })
})
