import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  analyzeRealtimeReliability,
  applyRealtimePresetValidationFreshness,
  createRealtimePresetManualConfirmation,
  createDiscordRealtimeVpnPresetRules,
  createRealtimePresetRules,
  getRealtimePresetDefinition,
  listRealtimePresetDefinitions,
  parseRealtimeRuleString,
  runRealtimePresetSmoke,
  runRealtimePresetValidationCheck
} from '../src/core/routing/realtime-reliability'
import {
  applyDiscordRealtimePresetToPatch,
  applyRealtimePresetToPatch,
  promoteObservedIpsToUnifiedRules,
  createEmptyUnifiedRulePatchFile
} from '../src/core/ui/unified-rule-management'

describe('realtime reliability diagnostics', () => {
  it('classifies end-to-end validated UDP with catch-all proxy as high confidence', () => {
    const summary = analyzeRealtimeReliability({
      rules: [
        { type: 'PROCESS-NAME', value: 'Discord', target: 'PROXY' },
        { type: 'DOMAIN-SUFFIX', value: 'discord.com', target: 'PROXY' },
        { type: 'MATCH', target: 'PROXY' }
      ],
      udp: {
        runtimeAdvertisesUdp: true,
        udpValidated: true,
        endToEndUdpValidated: true
      },
      platform: 'darwin',
      tunEnabled: true
    })

    assert.equal(summary.realtimeConfidence, 'high')
    assert.equal(summary.udpConfidence, 'end_to_end_validated')
    assert.equal(summary.ruleCoverage.catchAllProxy, true)
    assert.equal(summary.presetValidation.validationStatus, 'partial')
    assert.equal(summary.presetValidation.validationSource, 'connectivity_probe')
    assert.equal(
      summary.topReasons.some((reason) => reason.code === 'preset_partially_validated'),
      true
    )
  })

  it('classifies proxy-level UDP plus process and domain coverage as medium confidence', () => {
    const summary = analyzeRealtimeReliability({
      rules: [
        { type: 'PROCESS-NAME', value: 'Discord', target: 'PROXY' },
        { type: 'DOMAIN-SUFFIX', value: 'discord.com', target: 'AMNEZIA_HELPER' }
      ],
      udp: {
        runtimeAdvertisesUdp: true,
        udpValidated: true
      },
      platform: 'darwin',
      tunEnabled: true
    })

    assert.equal(summary.realtimeConfidence, 'medium')
    assert.equal(summary.udpConfidence, 'proxy_validated')
    assert.equal(summary.ruleCoverage.processCoverage, true)
    assert.equal(summary.ruleCoverage.domainCoverage, true)
    assert.equal(summary.presetValidation.validationStatus, 'partial')
    assert.equal(summary.presetValidation.validationSource, 'runtime_state')
    assert.equal(
      summary.topReasons.some((reason) => reason.code === 'preset_partially_validated'),
      true
    )
    assert.equal(
      summary.warnings.some((warning) => warning.code === 'udp_not_end_to_end_validated'),
      true
    )
    assert.equal(
      summary.recommendedActions.some((action) => action.code === 'verify_udp_end_to_end'),
      true
    )
  })

  it('warns when no catch-all proxy rule can cover media endpoints', () => {
    const summary = analyzeRealtimeReliability({
      rules: [{ type: 'DOMAIN-SUFFIX', value: 'discord.com', target: 'PROXY' }],
      udp: {
        runtimeAdvertisesUdp: true,
        udpValidated: true
      }
    })

    assert.equal(summary.realtimeConfidence, 'low')
    assert.equal(
      summary.warnings.some((warning) => warning.code === 'no_final_proxy_catch_all'),
      true
    )
    assert.equal(
      summary.warnings.some((warning) => warning.code === 'domain_only_rules_partial'),
      true
    )
    assert.equal(
      summary.recommendedActions.some((action) => action.code === 'add_final_match_proxy'),
      true
    )
  })

  it('keeps UDP confidence unknown when helper UDP is not advertised and validated', () => {
    const summary = analyzeRealtimeReliability({
      rules: [{ type: 'MATCH', target: 'PROXY' }],
      udp: {
        runtimeAdvertisesUdp: false,
        udpValidated: false
      }
    })

    assert.equal(summary.realtimeConfidence, 'low')
    assert.equal(summary.udpConfidence, 'unknown')
    assert.equal(summary.helperUdpAdvertised, false)
    assert.equal(
      summary.warnings.some((warning) => warning.code === 'udp_not_validated'),
      true
    )
  })

  it('keeps preset validation explicit when a manual smoke result fails', () => {
    const summary = analyzeRealtimeReliability({
      rules: [
        { type: 'PROCESS-NAME', value: 'Discord', target: 'PROXY' },
        { type: 'DOMAIN-SUFFIX', value: 'discord.com', target: 'PROXY' }
      ],
      udp: {
        runtimeAdvertisesUdp: true,
        udpValidated: true
      },
      presetValidation: {
        validationStatus: 'failed',
        validationSource: 'manual_smoke',
        validatedAt: 1710000000000,
        validationNotes: ['Discord voice test timed out.']
      }
    })

    assert.equal(summary.presetValidation.validationStatus, 'failed')
    assert.equal(summary.presetValidation.validationSource, 'manual_smoke')
    assert.deepEqual(summary.presetValidation.validationNotes, ['Discord voice test timed out.'])
    assert.equal(
      summary.topReasons.some((reason) => reason.code === 'preset_validation_failed'),
      true
    )
  })

  it('maps runtime preset checks into evidence-backed partial validation', () => {
    const evidence = runRealtimePresetValidationCheck({
      rules: [
        { type: 'PROCESS-NAME', value: 'Discord', target: 'PROXY' },
        { type: 'DOMAIN-SUFFIX', value: 'discord.com', target: 'PROXY' },
        { type: 'MATCH', target: 'PROXY' }
      ],
      udp: {
        runtimeAdvertisesUdp: true,
        udpValidated: true
      },
      helperReady: true,
      proxyInjected: true,
      connectivityVerified: true,
      connectivityProbeAttempted: true,
      helperMode: 'production',
      platform: 'darwin',
      tunEnabled: true,
      now: 1710000000000
    })

    assert.equal(evidence.validationStatus, 'partial')
    assert.equal(evidence.validationSource, 'connectivity_probe')
    assert.equal(evidence.lastValidatedAt, 1710000000000)
    assert.equal(evidence.helperModeAtValidation, 'production')
    assert.equal(evidence.udpConfidenceAtValidation, 'proxy_validated')
    assert.equal(evidence.platformModeAtValidation, 'darwin:tun')
    assert.equal(
      evidence.validationChecks?.some(
        (check) => check.code === 'connectivity_probe' && check.status === 'passed'
      ),
      true
    )
  })

  it('marks preset validation failed when runtime blockers are present', () => {
    const evidence = runRealtimePresetValidationCheck({
      rules: [{ type: 'PROCESS-NAME', value: 'Discord', target: 'PROXY' }],
      helperReady: false,
      proxyInjected: false,
      connectivityProbeAttempted: false,
      now: 1710000000000
    })

    assert.equal(evidence.validationStatus, 'failed')
    assert.equal(
      evidence.validationChecks?.some(
        (check) => check.code === 'helper_ready' && check.status === 'failed'
      ),
      true
    )
    assert.equal(
      evidence.validationNotes.some((note) => note.includes('Helper is not ready')),
      true
    )
  })

  it('creates manual confirmation evidence without pretending it came from a probe', () => {
    const evidence = createRealtimePresetManualConfirmation({
      note: 'Discord call was stable for 10 minutes.',
      helperMode: 'production',
      udpConfidence: 'proxy_validated',
      platformMode: 'darwin:tun',
      now: 1710000000000
    })

    assert.equal(evidence.validationStatus, 'validated')
    assert.equal(evidence.validationSource, 'manual_confirmation')
    assert.equal(evidence.lastValidatedAt, 1710000000000)
    assert.equal(evidence.validationNotes.includes('Discord call was stable for 10 minutes.'), true)
  })

  it('maps preset smoke evidence to smoke_passed without claiming manual validation', () => {
    const evidence = runRealtimePresetSmoke({
      rules: [
        { type: 'PROCESS-NAME', value: 'Discord', target: 'PROXY' },
        { type: 'DOMAIN-SUFFIX', value: 'discord.com', target: 'PROXY' }
      ],
      udp: {
        runtimeAdvertisesUdp: true,
        udpValidated: true
      },
      profileId: 'vpn-1',
      helperReady: true,
      proxyInjected: true,
      connectivityVerified: true,
      connectivityProbeAttempted: true,
      observedIpEvidenceCount: 2,
      observedIpEvidenceProcesses: ['Discord', 'Discord'],
      observedIpEvidenceIps: ['162.159.135.234', '162.159.135.234'],
      helperMode: 'production',
      platform: 'darwin',
      tunEnabled: true,
      now: 1710000000000
    })

    assert.equal(evidence.validationStatus, 'smoke_passed')
    assert.equal(evidence.validationSource, 'preset_smoke')
    assert.equal(evidence.smokeResult, 'passed')
    assert.equal(evidence.observedIpEvidenceCount, 2)
    assert.deepEqual(evidence.observedIpEvidenceProcesses, ['Discord'])
    assert.deepEqual(evidence.observedIpEvidenceIps, ['162.159.135.234'])
    assert.equal(evidence.validationSummary?.includes('voice quality still requires manual'), true)
  })

  it('marks preset validation stale when the environment fingerprint changes', () => {
    const fresh = createRealtimePresetManualConfirmation({
      profileId: 'vpn-1',
      helperMode: 'production',
      udpConfidence: 'proxy_validated',
      platform: 'darwin',
      tunEnabled: true,
      now: 1710000000000
    })
    const stale = applyRealtimePresetValidationFreshness({
      validation: fresh,
      environment: {
        profileId: 'vpn-1',
        helperMode: 'production',
        udpConfidence: 'unknown',
        platform: 'darwin',
        tunEnabled: true
      },
      now: 1710000001000
    })

    assert.equal(stale.validationStatus, 'validated')
    assert.equal(stale.environmentChanged, true)
    assert.equal(stale.freshnessReasons?.includes('environment_changed'), true)
  })

  it('expires old preset validation evidence by age', () => {
    const stale = applyRealtimePresetValidationFreshness({
      validation: {
        presetId: 'discord_voice_vpn',
        validationStatus: 'smoke_passed',
        validationSource: 'preset_smoke',
        lastValidatedAt: 1000,
        validationNotes: []
      },
      environment: {
        profileId: 'vpn-1',
        helperMode: 'production',
        udpConfidence: 'proxy_validated',
        platform: 'darwin',
        tunEnabled: true
      },
      staleAfterMs: 500,
      now: 2000
    })

    assert.equal(stale.validationExpired, true)
    assert.equal(stale.staleAfter, 1500)
    assert.equal(stale.freshnessReasons?.includes('validation_expired'), true)
  })

  it('recommends observed IP and catch-all upgrades for process-only realtime coverage', () => {
    const summary = analyzeRealtimeReliability({
      rules: [{ type: 'PROCESS-NAME', value: 'Discord', target: 'PROXY' }],
      udp: {
        runtimeAdvertisesUdp: true,
        udpValidated: true
      },
      platform: 'darwin',
      tunEnabled: true
    })

    const actionCodes = new Set(summary.recommendedActions.map((action) => action.code))
    assert.equal(actionCodes.has('strengthen_domain_coverage'), true)
    assert.equal(actionCodes.has('add_final_match_proxy'), true)
    assert.equal(actionCodes.has('add_observed_ip_rules'), true)
    assert.equal(actionCodes.has('review_platform_process_fallback'), true)
  })

  it('surfaces macOS PROCESS-NAME limitations under TUN', () => {
    const summary = analyzeRealtimeReliability({
      rules: [{ type: 'PROCESS-NAME', value: 'Discord', target: 'PROXY' }],
      udp: {
        runtimeAdvertisesUdp: true,
        udpValidated: true
      },
      platform: 'darwin',
      tunEnabled: true
    })

    assert.equal(
      summary.warnings.some(
        (warning) => warning.code === 'process_name_metadata_platform_dependent'
      ),
      true
    )
  })

  it('parses runtime rules and hides internal helper targets from realtime matching', () => {
    assert.deepEqual(parseRealtimeRuleString('MATCH,AMNEZIA_HELPER'), {
      type: 'MATCH',
      value: '',
      target: 'AMNEZIA_HELPER'
    })

    const summary = analyzeRealtimeReliability({
      rules: ['MATCH,AMNEZIA_HELPER'].map((rule) => parseRealtimeRuleString(rule)!),
      udp: {
        runtimeAdvertisesUdp: true,
        udpValidated: true,
        endToEndUdpValidated: true
      }
    })

    assert.equal(summary.ruleCoverage.catchAllProxy, true)
    assert.equal(JSON.stringify(createDiscordRealtimeVpnPresetRules()).includes('AMNEZIA'), false)
  })

  it('applies the Discord realtime preset duplicate-safely to a managed rule patch', () => {
    const patch = createEmptyUnifiedRulePatchFile()
    const first = applyDiscordRealtimePresetToPatch(patch, 'PROXY')
    const second = applyDiscordRealtimePresetToPatch(first.patch, 'PROXY')

    assert.equal(first.added > 0, true)
    assert.equal(first.processCoverage, true)
    assert.equal(first.domainCoverage, true)
    assert.equal(second.added, 0)
    assert.equal(second.skippedDuplicate, first.added)
    assert.equal(JSON.stringify(first.patch).includes('AMNEZIA_HELPER'), false)
  })

  it('maps realtime preset definitions into reusable rules', () => {
    const definitions = listRealtimePresetDefinitions()
    const discord = getRealtimePresetDefinition('discord_voice_vpn')
    const rules = createRealtimePresetRules('discord_voice_vpn', 'PROXY')
    const ids = definitions.map((definition) => definition.id)

    assert.deepEqual(ids, [
      'discord_voice_vpn',
      'telegram_calls_vpn',
      'zoom_meetings_vpn',
      'teams_calls_vpn',
      'google_meet_vpn'
    ])
    assert.equal(discord?.processNames.includes('Discord'), true)
    assert.equal(
      rules.some((rule) => rule === 'PROCESS-NAME,Discord,PROXY'),
      true
    )
    assert.equal(
      rules.some((rule) => rule === 'DOMAIN-SUFFIX,discord.com,PROXY'),
      true
    )
    assert.equal(JSON.stringify(rules).includes('AMNEZIA_HELPER'), false)
  })

  it('keeps preset guidance and smoke profiles specific to each app', () => {
    const telegram = getRealtimePresetDefinition('telegram_calls_vpn')
    const googleMeet = getRealtimePresetDefinition('google_meet_vpn')

    assert.equal(telegram?.platformNotes.darwin.includes('observed IP promotion'), true)
    assert.equal(telegram?.recommendedActions.includes('add_observed_ip_rules'), true)
    assert.equal(googleMeet?.processNames.length, 0)
    assert.equal(googleMeet?.smokeChecklistProfile.includes('process_coverage'), false)
    assert.equal(googleMeet?.recommendedActions.includes('add_final_match_proxy'), true)
  })

  it('uses preset-specific smoke checklists for browser-based presets', () => {
    const evidence = runRealtimePresetSmoke({
      presetId: 'google_meet_vpn',
      rules: [{ type: 'DOMAIN-SUFFIX', value: 'meet.google.com', target: 'PROXY' }],
      udp: {
        runtimeAdvertisesUdp: true,
        udpValidated: true
      },
      helperReady: true,
      proxyInjected: true,
      connectivityVerified: true,
      connectivityProbeAttempted: true
    })

    assert.equal(evidence.validationStatus, 'smoke_passed')
    assert.equal(
      evidence.validationChecks?.some((check) => check.code === 'process_coverage'),
      false
    )
    assert.equal(
      evidence.validationChecks?.some((check) => check.code === 'domain_coverage'),
      true
    )
  })

  it('applies realtime presets through the reusable preset engine', () => {
    const first = applyRealtimePresetToPatch({
      patch: createEmptyUnifiedRulePatchFile(),
      presetId: 'discord_voice_vpn',
      target: 'PROXY'
    })
    const second = applyRealtimePresetToPatch({
      patch: first.patch,
      presetId: 'discord_voice_vpn',
      target: 'PROXY'
    })

    assert.equal(first.added > 0, true)
    assert.equal(first.processCoverage, true)
    assert.equal(first.domainCoverage, true)
    assert.equal(second.added, 0)
    assert.equal(second.skippedDuplicate, first.added)
  })

  it('promotes observed IP evidence into deduplicated persistent IP-CIDR rules', () => {
    const first = promoteObservedIpsToUnifiedRules({
      patch: createEmptyUnifiedRulePatchFile(),
      observedIps: ['162.159.135.234', '162.159.135.234', 'not-an-ip'],
      target: 'PROXY'
    })
    const second = promoteObservedIpsToUnifiedRules({
      patch: first.patch,
      observedIps: ['162.159.135.234'],
      target: 'PROXY'
    })

    assert.equal(first.added, 1)
    assert.equal(first.skippedDuplicate, 0)
    assert.equal(first.invalid.length, 1)
    assert.deepEqual(first.patch.prepend, ['IP-CIDR,162.159.135.234/32,PROXY'])
    assert.equal(second.added, 0)
    assert.equal(second.skippedDuplicate, 1)
  })
})
