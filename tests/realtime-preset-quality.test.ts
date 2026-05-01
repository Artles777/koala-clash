import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  aggregateRealtimePresetEvidenceReports,
  createRealtimePresetEvidenceReport,
  createRealtimePresetQualityPlatformPresentations,
  createRealtimePresetQualityPresetPresentation,
  getRealtimePresetQualityScopeLabelKey,
  getRealtimePresetQualityStatusLabelKey,
  getRealtimePresetQualityTone
} from '../src/core/routing/realtime-preset-quality'

describe('realtime preset quality evidence reports', () => {
  it('creates packaged preset evidence rows with runtime and stale metadata', () => {
    const report = createRealtimePresetEvidenceReport({
      evidence: [
        {
          profileId: 'vpn-1',
          presetId: 'discord_voice_vpn',
          validationStatus: 'smoke_passed',
          validationSource: 'preset_smoke',
          smokeResult: 'passed',
          lastValidatedAt: 1710000000000,
          helperModeAtValidation: 'production',
          udpConfidenceAtValidation: 'proxy_validated',
          platformModeAtValidation: 'darwin:tun',
          observedIpEvidenceCount: 2,
          observedIpEvidenceProcesses: ['Discord', 'Discord'],
          observedIpEvidenceIps: ['162.159.135.234', '162.159.135.234'],
          validationExpired: false,
          environmentChanged: false,
          validationNotes: ['Smoke passed.']
        }
      ],
      platform: 'darwin',
      arch: 'arm64',
      evidenceScope: 'packaged',
      buildId: '1.2.0-rc1',
      appVersion: '1.2.0',
      runId: 'rc1',
      generatedAt: 1710000100000
    })

    assert.equal(report.format, 'koala-clash.realtime-preset-evidence')
    assert.equal(report.evidenceScope, 'packaged')
    assert.equal(report.rows.length, 1)
    const row = report.rows[0]
    assert.equal(row.presetId, 'discord_voice_vpn')
    assert.equal(row.platform, 'darwin')
    assert.equal(row.runtimeScenario, 'tun')
    assert.equal(row.tunEnabled, true)
    assert.equal(row.helperMode, 'production')
    assert.equal(row.udpConfidence, 'proxy_validated')
    assert.equal(row.validationStatus, 'smoke_passed')
    assert.equal(row.validationSource, 'preset_smoke')
    assert.equal(row.smokeResult, 'passed')
    assert.equal(row.observedIpEvidence.count, 2)
    assert.equal(row.observedIpEvidence.ipCount, 1)
    assert.deepEqual(row.observedIpEvidence.processes, ['Discord'])
    assert.equal(row.stale, false)
    assert.equal(row.buildId, '1.2.0-rc1')
  })

  it('aggregates preset quality by preset, platform, and runtime scenario', () => {
    const packaged = createRealtimePresetEvidenceReport({
      evidence: [
        {
          profileId: 'vpn-1',
          presetId: 'discord_voice_vpn',
          validationStatus: 'smoke_passed',
          validationSource: 'preset_smoke',
          smokeResult: 'passed',
          lastValidatedAt: 1710000000000,
          helperModeAtValidation: 'production',
          udpConfidenceAtValidation: 'proxy_validated',
          platformModeAtValidation: 'darwin:tun',
          observedIpEvidenceCount: 1,
          observedIpEvidenceProcesses: ['Discord'],
          observedIpEvidenceIps: ['162.159.135.234'],
          validationNotes: []
        },
        {
          profileId: 'vpn-1',
          presetId: 'telegram_calls_vpn',
          validationStatus: 'failed',
          validationSource: 'preset_smoke',
          smokeResult: 'failed',
          lastValidatedAt: 1710000001000,
          platformModeAtValidation: 'darwin:proxy',
          validationNotes: ['Helper was not ready.']
        }
      ],
      evidenceScope: 'packaged',
      buildId: 'rc1'
    })

    const matrix = aggregateRealtimePresetEvidenceReports({
      reports: [packaged],
      requiredPresetIds: ['discord_voice_vpn', 'telegram_calls_vpn'],
      requiredPlatforms: ['darwin'],
      requiredRuntimeScenarios: ['proxy', 'tun'],
      generatedAt: 1710000200000
    })

    assert.equal(matrix.format, 'koala-clash.realtime-preset-quality-matrix')
    assert.equal(matrix.rows.length, 4)
    const discordTun = matrix.rows.find(
      (row) =>
        row.presetId === 'discord_voice_vpn' &&
        row.platform === 'darwin' &&
        row.runtimeScenario === 'tun'
    )
    assert.equal(discordTun?.latestStatus, 'smoke_passed')
    assert.equal(discordTun?.packagedEvidenceCount, 1)
    assert.equal(discordTun?.observedIpEvidenceCount, 1)

    const telegramProxy = matrix.rows.find(
      (row) =>
        row.presetId === 'telegram_calls_vpn' &&
        row.platform === 'darwin' &&
        row.runtimeScenario === 'proxy'
    )
    assert.equal(telegramProxy?.latestStatus, 'failed')
    assert.equal(telegramProxy?.failedCount, 1)

    const missingDiscordProxy = matrix.rows.find(
      (row) =>
        row.presetId === 'discord_voice_vpn' &&
        row.platform === 'darwin' &&
        row.runtimeScenario === 'proxy'
    )
    assert.equal(missingDiscordProxy?.latestStatus, 'missing')
    assert.equal(missingDiscordProxy?.majorWarnings.includes('no_evidence'), true)
    assert.equal(matrix.summary.packagedEvidenceRows, 2)
    assert.equal(matrix.summary.missingRows, 2)
    assert.equal(matrix.summary.failedRows, 1)
  })

  it('marks local stale evidence as partial and warns that packaged evidence is missing', () => {
    const local = createRealtimePresetEvidenceReport({
      evidence: [
        {
          profileId: 'vpn-1',
          presetId: 'zoom_meetings_vpn',
          validationStatus: 'validated',
          validationSource: 'manual_confirmation',
          lastValidatedAt: 1710000000000,
          platformModeAtValidation: 'linux:proxy',
          validationExpired: true,
          environmentChanged: true,
          freshnessReasons: ['validation_expired', 'environment_changed'],
          validationNotes: ['Manual confirmation is stale.']
        }
      ],
      evidenceScope: 'local'
    })
    const matrix = aggregateRealtimePresetEvidenceReports({
      reports: [local],
      generatedAt: 1710000200000
    })

    assert.equal(local.rows[0].stale, true)
    assert.equal(local.rows[0].majorWarnings.includes('evidence_stale'), true)
    assert.equal(matrix.rows[0].latestStatus, 'partial')
    assert.equal(matrix.rows[0].localEvidenceCount, 1)
    assert.equal(matrix.rows[0].majorWarnings.includes('local_evidence_only'), true)
    assert.equal(matrix.summary.localOnlyRows, 1)
    assert.equal(matrix.summary.staleRows, 1)
  })

  it('maps quality statuses and evidence scopes to stable UI labels', () => {
    assert.equal(
      getRealtimePresetQualityStatusLabelKey('smoke_passed'),
      'profile.realtimeQualityStatusSmokePassed'
    )
    assert.equal(
      getRealtimePresetQualityStatusLabelKey('missing'),
      'profile.realtimeQualityStatusMissing'
    )
    assert.equal(
      getRealtimePresetQualityScopeLabelKey('packaged'),
      'profile.realtimeQualityScopePackaged'
    )
    assert.equal(getRealtimePresetQualityScopeLabelKey('none'), 'profile.realtimeQualityScopeNone')
    assert.equal(getRealtimePresetQualityTone('validated'), 'success')
    assert.equal(getRealtimePresetQualityTone('failed'), 'danger')
  })

  it('builds compact proxy and TUN presentation for a selected preset', () => {
    const report = createRealtimePresetEvidenceReport({
      evidence: [
        {
          profileId: 'vpn-1',
          presetId: 'discord_voice_vpn',
          validationStatus: 'smoke_passed',
          validationSource: 'preset_smoke',
          smokeResult: 'passed',
          lastValidatedAt: 1710000000000,
          platformModeAtValidation: 'darwin:tun',
          validationNotes: []
        },
        {
          profileId: 'vpn-1',
          presetId: 'discord_voice_vpn',
          validationStatus: 'partial',
          validationSource: 'connectivity_probe',
          lastValidatedAt: 1710000001000,
          platformModeAtValidation: 'darwin:proxy',
          validationExpired: true,
          validationNotes: []
        }
      ],
      evidenceScope: 'packaged'
    })
    const matrix = aggregateRealtimePresetEvidenceReports({
      reports: [report],
      requiredPresetIds: ['discord_voice_vpn'],
      requiredPlatforms: ['darwin'],
      requiredRuntimeScenarios: ['proxy', 'tun']
    })
    const presentation = createRealtimePresetQualityPresetPresentation(
      matrix,
      'discord_voice_vpn',
      'darwin'
    )

    assert.equal(presentation.proxy.status, 'partial')
    assert.equal(presentation.proxy.stale, true)
    assert.equal(presentation.proxy.evidenceScope, 'packaged')
    assert.equal(presentation.tun.status, 'smoke_passed')
    assert.equal(presentation.tun.statusLabelKey, 'profile.realtimeQualityStatusSmokePassed')
    assert.equal(presentation.bestStatus, 'smoke_passed')
    assert.equal(presentation.hasPackagedEvidence, true)
    assert.equal(presentation.stale, true)
    assert.equal(presentation.warningCodes.includes('stale_evidence_present'), true)
  })

  it('renders missing proxy and TUN evidence explicitly instead of implying success', () => {
    const matrix = aggregateRealtimePresetEvidenceReports({
      reports: [],
      requiredPresetIds: ['telegram_calls_vpn'],
      requiredPlatforms: ['win32'],
      requiredRuntimeScenarios: ['proxy', 'tun']
    })
    const presentation = createRealtimePresetQualityPresetPresentation(
      matrix,
      'telegram_calls_vpn',
      'win32'
    )

    assert.equal(presentation.bestStatus, 'missing')
    assert.equal(presentation.evidenceScope, 'none')
    assert.equal(presentation.proxy.status, 'missing')
    assert.equal(presentation.tun.status, 'missing')
    assert.equal(presentation.warningCodes.includes('no_evidence'), true)
  })

  it('summarizes best known preset quality per platform', () => {
    const report = createRealtimePresetEvidenceReport({
      evidence: [
        {
          profileId: 'vpn-1',
          presetId: 'teams_calls_vpn',
          validationStatus: 'validated',
          validationSource: 'manual_confirmation',
          lastValidatedAt: 1710000000000,
          platformModeAtValidation: 'linux:tun',
          validationNotes: []
        },
        {
          profileId: 'vpn-1',
          presetId: 'teams_calls_vpn',
          validationStatus: 'smoke_passed',
          validationSource: 'preset_smoke',
          smokeResult: 'passed',
          lastValidatedAt: 1710000001000,
          platformModeAtValidation: 'win32:proxy',
          validationNotes: []
        }
      ],
      evidenceScope: 'packaged'
    })
    const matrix = aggregateRealtimePresetEvidenceReports({
      reports: [report],
      requiredPresetIds: ['teams_calls_vpn'],
      requiredPlatforms: ['linux', 'win32'],
      requiredRuntimeScenarios: ['proxy', 'tun']
    })
    const platforms = createRealtimePresetQualityPlatformPresentations(matrix, 'teams_calls_vpn')

    assert.equal(platforms.length, 2)
    assert.equal(platforms.find((entry) => entry.platform === 'linux')?.tun.status, 'validated')
    assert.equal(platforms.find((entry) => entry.platform === 'linux')?.proxy.status, 'missing')
    assert.equal(
      platforms.find((entry) => entry.platform === 'win32')?.proxy.status,
      'smoke_passed'
    )
  })
})
