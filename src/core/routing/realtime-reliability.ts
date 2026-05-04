import type { EffectiveBypassMode } from './bypass-capabilities'

export type RealtimeConfidence = 'high' | 'medium' | 'low'
export type RealtimeUdpConfidence = 'end_to_end_validated' | 'proxy_validated' | 'unknown'
export type RealtimePresetValidationStatus =
  | 'not_tested'
  | 'partial'
  | 'smoke_passed'
  | 'validated'
  | 'failed'
export type RealtimePresetValidationSource =
  | 'rule_analysis'
  | 'runtime_state'
  | 'connectivity_probe'
  | 'preset_smoke'
  | 'manual_confirmation'
  // Legacy source ids are kept for older persisted diagnostics bundles.
  | 'runtime_analysis'
  | 'helper_connectivity'
  | 'manual_smoke'
  | 'unknown'

export type RealtimePresetValidationCheckCode =
  | 'helper_ready'
  | 'proxy_injected'
  | 'udp_capability'
  | 'connectivity_probe'
  | 'process_coverage'
  | 'domain_coverage'
  | 'catch_all_proxy'
  | 'observed_ip_evidence'

export type RealtimePresetValidationCheckStatus = 'passed' | 'warning' | 'failed' | 'skipped'

export type RealtimeReliabilityWarningCode =
  | 'udp_not_validated'
  | 'udp_not_end_to_end_validated'
  | 'no_proxy_rule_coverage'
  | 'no_final_proxy_catch_all'
  | 'domain_only_rules_partial'
  | 'process_only_rules_partial'
  | 'process_name_metadata_platform_dependent'

export type RealtimeReliabilityActionCode =
  | 'validate_helper_udp'
  | 'verify_udp_end_to_end'
  | 'add_realtime_preset'
  | 'add_final_match_proxy'
  | 'add_process_and_domain_rules'
  | 'strengthen_domain_coverage'
  | 'add_observed_ip_rules'
  | 'review_platform_process_fallback'
  | 'run_realtime_smoke'

export type RealtimeReliabilityReasonCode =
  | RealtimeReliabilityWarningCode
  | 'preset_not_tested'
  | 'preset_partially_validated'
  | 'preset_smoke_passed'
  | 'preset_validation_failed'
  | 'preset_validation_stale'

export type RealtimePresetSmokeResult = 'passed' | 'partial' | 'failed'

export interface RealtimeRuleLike {
  type: string
  value?: string
  target: string
  enabled?: boolean
}

export interface RealtimeUdpState {
  udpSupport?: 'supported' | 'unsupported' | 'unknown'
  udpValidated?: boolean
  udpReasonCode?: string
  runtimeAdvertisesUdp?: boolean
  endToEndUdpValidated?: boolean
  checkedAt?: number
}

export interface RealtimePresetValidationState {
  presetId: string
  validationStatus: RealtimePresetValidationStatus
  validatedAt?: number
  lastValidatedAt?: number
  validationSource: RealtimePresetValidationSource
  validationSummary?: string
  helperModeAtValidation?: string
  udpConfidenceAtValidation?: RealtimeUdpConfidence
  platformModeAtValidation?: string
  validationNotes: string[]
  validationChecks?: RealtimePresetValidationCheck[]
  smokeResult?: RealtimePresetSmokeResult
  observedIpEvidenceCount?: number
  observedIpEvidenceProcesses?: string[]
  observedIpEvidenceIps?: string[]
  validationExpired?: boolean
  staleAfter?: number
  environmentChanged?: boolean
  lastEnvironmentFingerprint?: string
  currentEnvironmentFingerprint?: string
  freshnessReasons?: string[]
}

export interface RealtimePresetValidationCheck {
  code: RealtimePresetValidationCheckCode
  status: RealtimePresetValidationCheckStatus
  message: string
}

export interface RealtimePresetValidationCheckInput {
  presetId?: string
  profileId?: string
  rules: RealtimeRuleLike[]
  udp?: RealtimeUdpState
  platform?: string
  tunEnabled?: boolean
  helperReady?: boolean
  proxyInjected?: boolean
  connectivityVerified?: boolean
  connectivityProbeAttempted?: boolean
  helperMode?: string
  platformMode?: string
  now?: number
  source?: RealtimePresetValidationSource
}

export interface RealtimePresetManualConfirmationInput {
  presetId?: string
  profileId?: string
  note?: string
  udpConfidence?: RealtimeUdpConfidence
  helperMode?: string
  platform?: string
  tunEnabled?: boolean
  platformMode?: string
  now?: number
}

export interface RealtimePresetValidationEnvironment {
  profileId?: string
  platform?: string
  tunEnabled?: boolean
  helperMode?: string
  udpConfidence?: RealtimeUdpConfidence
}

export interface RealtimePresetValidationFreshnessInput {
  validation: Partial<RealtimePresetValidationState>
  environment?: RealtimePresetValidationEnvironment
  now?: number
  staleAfterMs?: number
}

export interface RealtimePresetSmokeInput extends RealtimePresetValidationCheckInput {
  observedIpEvidenceCount?: number
  observedIpEvidenceProcesses?: string[]
  observedIpEvidenceIps?: string[]
}

export interface RealtimePresetDefinition {
  id: string
  title: string
  processNames: string[]
  domains: string[]
  domainSuffixes: string[]
  ipCidrs: string[]
  platformNotes: Record<string, string>
  recommendedActions: RealtimeReliabilityActionCode[]
  smokeChecklistProfile: RealtimePresetValidationCheckCode[]
}

export interface RealtimeReliabilityInput {
  rules: RealtimeRuleLike[]
  udp?: RealtimeUdpState
  platform?: string
  tunEnabled?: boolean
  profileId?: string
  helperMode?: string
  processDirectEffectiveBypassMode?: EffectiveBypassMode
  presetValidation?: Partial<RealtimePresetValidationState>
}

export interface RealtimeReliabilityWarning {
  code: RealtimeReliabilityWarningCode
  message: string
}

export interface RealtimeReliabilityAction {
  code: RealtimeReliabilityActionCode
  message: string
}

export interface RealtimeReliabilityReason {
  code: RealtimeReliabilityReasonCode
  message: string
}

export interface RealtimeRuleCoverage {
  processCoverage: boolean
  domainCoverage: boolean
  catchAllProxy: boolean
  proxyRuleCount: number
  processProxyRuleCount: number
  domainProxyRuleCount: number
}

export interface RealtimeReliabilitySummary {
  realtimeConfidence: RealtimeConfidence
  udpConfidence: RealtimeUdpConfidence
  helperUdpAdvertised: boolean
  helperUdpValidated: boolean
  endToEndUdpValidated: boolean
  ruleCoverage: RealtimeRuleCoverage
  platform: string
  processNameMode?: EffectiveBypassMode
  presetValidation: RealtimePresetValidationState
  topReasons: RealtimeReliabilityReason[]
  warnings: RealtimeReliabilityWarning[]
  recommendedActions: RealtimeReliabilityAction[]
}

export const DISCORD_REALTIME_PRESET_ID = 'discord_voice_vpn'
export const TELEGRAM_REALTIME_PRESET_ID = 'telegram_calls_vpn'
export const ZOOM_REALTIME_PRESET_ID = 'zoom_meetings_vpn'
export const TEAMS_REALTIME_PRESET_ID = 'teams_calls_vpn'
export const GOOGLE_MEET_REALTIME_PRESET_ID = 'google_meet_vpn'
export const defaultRealtimePresetValidationStaleAfterMs = 7 * 24 * 60 * 60 * 1000

export const DISCORD_REALTIME_PROCESS_NAMES = [
  'Discord',
  'Discord Helper',
  'Discord Helper (Renderer)'
] as const

export const DISCORD_REALTIME_DOMAIN_SUFFIXES = [
  'discord.com',
  'discord.gg',
  'discordapp.com',
  'discordapp.net',
  'discord.media',
  'discordcdn.com'
] as const

export const TELEGRAM_REALTIME_PROCESS_NAMES = [
  'Telegram',
  'Telegram Desktop',
  'org.telegram.desktop'
] as const

export const TELEGRAM_REALTIME_DOMAIN_SUFFIXES = [
  'telegram.org',
  'telegram.me',
  't.me',
  'tdesktop.com',
  'telegra.ph'
] as const

export const ZOOM_REALTIME_PROCESS_NAMES = ['Zoom', 'zoom.us', 'CptHost'] as const

export const ZOOM_REALTIME_DOMAIN_SUFFIXES = [
  'zoom.us',
  'zoom.com',
  'zoomgov.com',
  'zoomcdn.zoom.us'
] as const

export const TEAMS_REALTIME_PROCESS_NAMES = [
  'Microsoft Teams',
  'MSTeams',
  'Teams',
  'ms-teams'
] as const

export const TEAMS_REALTIME_DOMAIN_SUFFIXES = [
  'teams.microsoft.com',
  'teams.live.com',
  'teams.cdn.office.net',
  'skype.com',
  'lync.com'
] as const

export const GOOGLE_MEET_REALTIME_DOMAIN_SUFFIXES = [
  'meet.google.com',
  'googlevideo.com',
  'gstatic.com'
] as const

const realtimePresetDefaultSmokeChecklist: RealtimePresetValidationCheckCode[] = [
  'helper_ready',
  'proxy_injected',
  'udp_capability',
  'connectivity_probe',
  'process_coverage',
  'domain_coverage',
  'catch_all_proxy',
  'observed_ip_evidence'
]

const commonRealtimePlatformNotes = {
  darwin:
    'macOS process matching is fallback-heavy. Prefer domain, observed IP, or catch-all coverage for media flows.',
  win32:
    'Windows PROCESS-NAME reliability depends on the native bypass service reporting an active data plane.',
  linux:
    'Linux native process bypass can improve PROCESS-NAME coverage when prerequisites and privileges are available.'
} as const

export const realtimePresetDefinitions: readonly RealtimePresetDefinition[] = [
  {
    id: DISCORD_REALTIME_PRESET_ID,
    title: 'Discord / voice apps through VPN',
    processNames: [...DISCORD_REALTIME_PROCESS_NAMES],
    domains: [],
    domainSuffixes: [...DISCORD_REALTIME_DOMAIN_SUFFIXES],
    ipCidrs: [],
    platformNotes: {
      ...commonRealtimePlatformNotes
    },
    recommendedActions: [
      'verify_udp_end_to_end',
      'add_final_match_proxy',
      'add_observed_ip_rules',
      'run_realtime_smoke'
    ],
    smokeChecklistProfile: realtimePresetDefaultSmokeChecklist
  },
  {
    id: TELEGRAM_REALTIME_PRESET_ID,
    title: 'Telegram calls through VPN',
    processNames: [...TELEGRAM_REALTIME_PROCESS_NAMES],
    domains: [],
    domainSuffixes: [...TELEGRAM_REALTIME_DOMAIN_SUFFIXES],
    ipCidrs: [],
    platformNotes: {
      ...commonRealtimePlatformNotes,
      darwin:
        'Telegram calls on macOS often benefit from observed IP promotion because PROCESS-NAME is fallback-based under TUN.'
    },
    recommendedActions: [
      'verify_udp_end_to_end',
      'add_observed_ip_rules',
      'add_final_match_proxy',
      'run_realtime_smoke'
    ],
    smokeChecklistProfile: realtimePresetDefaultSmokeChecklist
  },
  {
    id: ZOOM_REALTIME_PRESET_ID,
    title: 'Zoom meetings through VPN',
    processNames: [...ZOOM_REALTIME_PROCESS_NAMES],
    domains: [],
    domainSuffixes: [...ZOOM_REALTIME_DOMAIN_SUFFIXES],
    ipCidrs: [],
    platformNotes: {
      ...commonRealtimePlatformNotes,
      darwin:
        'Zoom may spawn helper processes. Keep domain coverage and consider promoting observed media IPs after a smoke run.'
    },
    recommendedActions: [
      'verify_udp_end_to_end',
      'strengthen_domain_coverage',
      'add_observed_ip_rules',
      'run_realtime_smoke'
    ],
    smokeChecklistProfile: realtimePresetDefaultSmokeChecklist
  },
  {
    id: TEAMS_REALTIME_PRESET_ID,
    title: 'Microsoft Teams calls through VPN',
    processNames: [...TEAMS_REALTIME_PROCESS_NAMES],
    domains: [],
    domainSuffixes: [...TEAMS_REALTIME_DOMAIN_SUFFIXES],
    ipCidrs: [],
    platformNotes: {
      ...commonRealtimePlatformNotes,
      win32:
        'Teams process matching is strongest on Windows only when the native bypass service data plane is active.'
    },
    recommendedActions: [
      'verify_udp_end_to_end',
      'strengthen_domain_coverage',
      'add_final_match_proxy',
      'run_realtime_smoke'
    ],
    smokeChecklistProfile: realtimePresetDefaultSmokeChecklist
  },
  {
    id: GOOGLE_MEET_REALTIME_PRESET_ID,
    title: 'Google Meet through VPN',
    processNames: [],
    domains: ['meet.google.com'],
    domainSuffixes: [...GOOGLE_MEET_REALTIME_DOMAIN_SUFFIXES],
    ipCidrs: [],
    platformNotes: {
      darwin:
        'Google Meet is browser-based, so this preset intentionally avoids broad browser PROCESS-NAME rules on macOS.',
      win32:
        'Google Meet is browser-based; use domain/catch-all coverage rather than broad browser process rules.',
      linux:
        'Google Meet is browser-based; native process bypass is usually less useful than domain or catch-all coverage.'
    },
    recommendedActions: [
      'add_final_match_proxy',
      'verify_udp_end_to_end',
      'strengthen_domain_coverage',
      'run_realtime_smoke'
    ],
    smokeChecklistProfile: realtimePresetDefaultSmokeChecklist.filter(
      (check) => check !== 'process_coverage'
    )
  }
] as const

export function listRealtimePresetDefinitions(): RealtimePresetDefinition[] {
  return realtimePresetDefinitions.map(cloneRealtimePresetDefinition)
}

export function getRealtimePresetDefinition(
  presetId = DISCORD_REALTIME_PRESET_ID
): RealtimePresetDefinition | undefined {
  const definition = realtimePresetDefinitions.find((preset) => preset.id === presetId)
  return definition ? cloneRealtimePresetDefinition(definition) : undefined
}

export function createRealtimePresetRules(
  presetId = DISCORD_REALTIME_PRESET_ID,
  target = 'PROXY'
): string[] {
  const definition = getRealtimePresetDefinition(presetId)
  if (!definition) return []
  const normalizedTarget = normalizeProxyTarget(target)
  return [
    ...definition.processNames.map(
      (processName) => `PROCESS-NAME,${processName},${normalizedTarget}`
    ),
    ...definition.domains.map((domain) => `DOMAIN,${domain},${normalizedTarget}`),
    ...definition.domainSuffixes.map((domain) => `DOMAIN-SUFFIX,${domain},${normalizedTarget}`),
    ...definition.ipCidrs.map((cidr) => `IP-CIDR,${cidr},${normalizedTarget}`)
  ]
}

export function createDiscordRealtimeVpnPresetRules(target = 'PROXY'): string[] {
  return createRealtimePresetRules(DISCORD_REALTIME_PRESET_ID, target)
}

export function parseRealtimeRuleString(rule: string): RealtimeRuleLike | undefined {
  const parts = rule.split(',').map((part) => part.trim())
  const type = normalizeRuleType(parts[0] ?? '')
  if (!type) return undefined

  if (type === 'MATCH') {
    const target = parts[1] ?? ''
    if (!target) return undefined
    return {
      type,
      value: '',
      target
    }
  }

  const value = parts[1] ?? ''
  const target = parts[2] ?? ''
  if (!target) return undefined
  return {
    type,
    value,
    target
  }
}

export function analyzeRealtimeReliability(
  input: RealtimeReliabilityInput
): RealtimeReliabilitySummary {
  const rules = input.rules
    .filter((rule) => rule.enabled !== false)
    .map(normalizeRealtimeRule)
    .filter((rule) => rule.target.length > 0)
  const ruleCoverage = analyzeRealtimeRuleCoverage(rules)
  const helperUdpAdvertised = input.udp?.runtimeAdvertisesUdp === true
  const helperUdpValidated = input.udp?.udpValidated === true && helperUdpAdvertised
  const endToEndUdpValidated = input.udp?.endToEndUdpValidated === true
  const udpConfidence = getRealtimeUdpConfidence({
    helperUdpValidated,
    endToEndUdpValidated
  })
  const warnings = collectRealtimeWarnings({
    ruleCoverage,
    helperUdpValidated,
    helperUdpAdvertised,
    endToEndUdpValidated,
    platform: input.platform,
    tunEnabled: input.tunEnabled
  })
  const realtimeConfidence = classifyRealtimeConfidence({
    ruleCoverage,
    helperUdpValidated,
    endToEndUdpValidated
  })
  const presetValidation = createRealtimePresetValidationState({
    explicit: input.presetValidation,
    ruleCoverage,
    helperUdpValidated,
    endToEndUdpValidated,
    checkedAt: input.udp?.checkedAt,
    environment: {
      profileId: input.profileId,
      platform: input.platform,
      tunEnabled: input.tunEnabled,
      helperMode: input.helperMode,
      udpConfidence
    }
  })
  const topReasons = collectRealtimeTopReasons(warnings, presetValidation, realtimeConfidence)
  const recommendedActions = collectRealtimeActions({
    warnings,
    coverage: ruleCoverage,
    helperUdpValidated,
    endToEndUdpValidated,
    platform: input.platform,
    tunEnabled: input.tunEnabled
  })

  return {
    realtimeConfidence,
    udpConfidence,
    helperUdpAdvertised,
    helperUdpValidated,
    endToEndUdpValidated,
    ruleCoverage,
    platform: input.platform ?? 'unknown',
    processNameMode: input.processDirectEffectiveBypassMode,
    presetValidation,
    topReasons,
    warnings,
    recommendedActions
  }
}

export function analyzeRealtimeRuleCoverage(rules: RealtimeRuleLike[]): RealtimeRuleCoverage {
  const activeRules = rules.filter((rule) => rule.enabled !== false).map(normalizeRealtimeRule)
  const proxyRules = activeRules.filter((rule) => isProxyTarget(rule.target))
  const processProxyRules = proxyRules.filter((rule) => rule.type === 'PROCESS-NAME')
  const domainProxyRules = proxyRules.filter((rule) =>
    ['DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD', 'RULE-SET'].includes(rule.type)
  )
  const catchAllProxy = proxyRules.some((rule) => rule.type === 'MATCH')

  return {
    processCoverage: processProxyRules.length > 0,
    domainCoverage: domainProxyRules.length > 0,
    catchAllProxy,
    proxyRuleCount: proxyRules.length,
    processProxyRuleCount: processProxyRules.length,
    domainProxyRuleCount: domainProxyRules.length
  }
}

export function runRealtimePresetValidationCheck(
  input: RealtimePresetValidationCheckInput
): RealtimePresetValidationState {
  const now = input.now ?? Date.now()
  const rules = input.rules
    .filter((rule) => rule.enabled !== false)
    .map(normalizeRealtimeRule)
    .filter((rule) => rule.target.length > 0)
  const ruleCoverage = analyzeRealtimeRuleCoverage(rules)
  const helperUdpAdvertised = input.udp?.runtimeAdvertisesUdp === true
  const helperUdpValidated = input.udp?.udpValidated === true && helperUdpAdvertised
  const endToEndUdpValidated = input.udp?.endToEndUdpValidated === true
  const udpConfidence = getRealtimeUdpConfidence({
    helperUdpValidated,
    endToEndUdpValidated
  })
  const helperReady = input.helperReady === true
  const proxyInjected = input.proxyInjected === true
  const connectivityProbeAttempted = input.connectivityProbeAttempted === true
  const connectivityVerified = input.connectivityVerified === true
  const checks: RealtimePresetValidationCheck[] = [
    {
      code: 'helper_ready',
      status: helperReady ? 'passed' : 'failed',
      message: helperReady ? 'Helper is ready.' : 'Helper is not ready.'
    },
    {
      code: 'proxy_injected',
      status: proxyInjected ? 'passed' : 'failed',
      message: proxyInjected ? 'VPN/PROXY target is injected.' : 'VPN/PROXY target is not injected.'
    },
    {
      code: 'udp_capability',
      status: endToEndUdpValidated ? 'passed' : helperUdpValidated ? 'warning' : 'failed',
      message: endToEndUdpValidated
        ? 'UDP has end-to-end validation evidence.'
        : helperUdpValidated
          ? 'UDP is validated at the helper/proxy level, not as app-level media.'
          : 'UDP is not validated for the helper path.'
    },
    {
      code: 'connectivity_probe',
      status: connectivityVerified ? 'passed' : connectivityProbeAttempted ? 'failed' : 'skipped',
      message: connectivityVerified
        ? 'Connectivity probe succeeded through the helper.'
        : connectivityProbeAttempted
          ? 'Connectivity probe failed through the helper.'
          : 'Connectivity probe was not run.'
    },
    {
      code: 'process_coverage',
      status: ruleCoverage.processCoverage ? 'passed' : 'warning',
      message: ruleCoverage.processCoverage
        ? 'Preset has process-name coverage.'
        : 'Preset has no process-name coverage.'
    },
    {
      code: 'domain_coverage',
      status: ruleCoverage.domainCoverage ? 'passed' : 'warning',
      message: ruleCoverage.domainCoverage
        ? 'Preset has domain coverage.'
        : 'Preset has no domain coverage.'
    },
    {
      code: 'catch_all_proxy',
      status: ruleCoverage.catchAllProxy ? 'passed' : 'warning',
      message: ruleCoverage.catchAllProxy
        ? 'A final MATCH,PROXY catch-all is present.'
        : 'No final MATCH,PROXY catch-all is present.'
    }
  ]
  const failedBlockingCheck = checks.some(
    (check) =>
      (check.code === 'helper_ready' || check.code === 'proxy_injected') &&
      check.status === 'failed'
  )
  const failedConnectivity = connectivityProbeAttempted && !connectivityVerified
  const validationStatus: RealtimePresetValidationStatus =
    failedBlockingCheck || ruleCoverage.proxyRuleCount === 0 || failedConnectivity
      ? 'failed'
      : 'partial'
  const validationSummary =
    validationStatus === 'failed'
      ? 'Preset runtime check found blockers; inspect failed checks before relying on realtime routing.'
      : 'Preset runtime check produced partial evidence. App-level voice/media quality still requires manual confirmation.'

  return {
    presetId: input.presetId ?? DISCORD_REALTIME_PRESET_ID,
    validationStatus,
    validatedAt: now,
    lastValidatedAt: now,
    validationSource: input.source ?? 'connectivity_probe',
    validationSummary,
    helperModeAtValidation: input.helperMode,
    udpConfidenceAtValidation: udpConfidence,
    platformModeAtValidation:
      input.platformMode ?? createPlatformMode(input.platform, input.tunEnabled),
    lastEnvironmentFingerprint: createRealtimePresetEnvironmentFingerprint({
      profileId: input.profileId,
      platform: input.platform,
      tunEnabled: input.tunEnabled,
      helperMode: input.helperMode,
      udpConfidence
    }),
    validationNotes: collectValidationCheckNotes(checks, validationStatus),
    validationChecks: checks
  }
}

export function runRealtimePresetSmoke(
  input: RealtimePresetSmokeInput
): RealtimePresetValidationState {
  const checklist = new Set(
    getRealtimePresetDefinition(input.presetId)?.smokeChecklistProfile ??
      realtimePresetDefaultSmokeChecklist
  )
  const base = runRealtimePresetValidationCheck({
    ...input,
    source: 'preset_smoke'
  })
  const observedIpEvidenceCount = Math.max(0, input.observedIpEvidenceCount ?? 0)
  const observedIpEvidenceProcesses = dedupeStrings(input.observedIpEvidenceProcesses ?? [])
  const observedIpEvidenceIps = dedupeStrings(input.observedIpEvidenceIps ?? [])
  const helperReady = checkPassed(base, 'helper_ready')
  const proxyInjected = checkPassed(base, 'proxy_injected')
  const udpUsable = checkPassed(base, 'udp_capability') || checkWarning(base, 'udp_capability')
  const connectivityPassed = checkPassed(base, 'connectivity_probe')
  const processCoverage = checkPassed(base, 'process_coverage')
  const domainCoverage = checkPassed(base, 'domain_coverage')
  const catchAllCoverage = checkPassed(base, 'catch_all_proxy')
  const expectedProcessCoverage = !checklist.has('process_coverage') || processCoverage
  const expectedDomainCoverage = !checklist.has('domain_coverage') || domainCoverage
  const coverageStrongEnough =
    catchAllCoverage || (expectedProcessCoverage && expectedDomainCoverage)
  const observedIpCheck: RealtimePresetValidationCheck = {
    code: 'observed_ip_evidence',
    status: observedIpEvidenceCount > 0 ? 'passed' : 'skipped',
    message:
      observedIpEvidenceCount > 0
        ? `Observed ${observedIpEvidenceCount} process-associated destination IPs.`
        : 'No observed process-associated destination IP evidence is available.'
  }
  const validationChecks = [...(base.validationChecks ?? []), observedIpCheck].filter((check) =>
    checklist.has(check.code)
  )
  const smokeResult: RealtimePresetSmokeResult =
    helperReady && proxyInjected && connectivityPassed && coverageStrongEnough && udpUsable
      ? 'passed'
      : helperReady && proxyInjected && (connectivityPassed || coverageStrongEnough)
        ? 'partial'
        : 'failed'
  const validationStatus: RealtimePresetValidationStatus =
    smokeResult === 'passed' ? 'smoke_passed' : smokeResult === 'partial' ? 'partial' : 'failed'
  const validationSummary =
    smokeResult === 'passed'
      ? 'Preset smoke passed runtime helper, routing, connectivity, coverage, and UDP checks. App-level voice quality still requires manual confirmation.'
      : smokeResult === 'partial'
        ? 'Preset smoke produced partial runtime evidence, but one or more reliability checks are incomplete.'
        : 'Preset smoke failed runtime checks; inspect failed checks before relying on realtime routing.'

  return {
    ...base,
    validationStatus,
    validationSource: 'preset_smoke',
    validationSummary,
    smokeResult,
    observedIpEvidenceCount,
    observedIpEvidenceProcesses,
    observedIpEvidenceIps,
    validationNotes: collectValidationCheckNotes(validationChecks, validationStatus),
    validationChecks
  }
}

export function createRealtimePresetManualConfirmation(
  input: RealtimePresetManualConfirmationInput = {}
): RealtimePresetValidationState {
  const now = input.now ?? Date.now()
  const note = input.note?.trim()
  return {
    presetId: input.presetId ?? DISCORD_REALTIME_PRESET_ID,
    validationStatus: 'validated',
    validatedAt: now,
    lastValidatedAt: now,
    validationSource: 'manual_confirmation',
    validationSummary:
      'Manual confirmation records that a real realtime app session was verified on this device/network.',
    helperModeAtValidation: input.helperMode,
    udpConfidenceAtValidation: input.udpConfidence,
    platformModeAtValidation:
      input.platformMode ?? createPlatformMode(input.platform, input.tunEnabled),
    lastEnvironmentFingerprint: createRealtimePresetEnvironmentFingerprint({
      profileId: input.profileId,
      helperMode: input.helperMode,
      udpConfidence: input.udpConfidence,
      platform: input.platform ?? input.platformMode?.split(':')[0],
      tunEnabled: input.tunEnabled ?? input.platformMode?.endsWith(':tun')
    }),
    validationNotes: [
      'Preset was manually confirmed on this device/network.',
      ...(note ? [note] : [])
    ]
  }
}

export function applyRealtimePresetValidationFreshness(
  input: RealtimePresetValidationFreshnessInput
): RealtimePresetValidationState {
  const now = input.now ?? Date.now()
  const staleAfterMs = input.staleAfterMs ?? defaultRealtimePresetValidationStaleAfterMs
  const lastValidatedAt = input.validation.lastValidatedAt ?? input.validation.validatedAt
  const staleAfter =
    typeof lastValidatedAt === 'number' && Number.isFinite(lastValidatedAt)
      ? lastValidatedAt + staleAfterMs
      : undefined
  const currentEnvironmentFingerprint = createRealtimePresetEnvironmentFingerprint(
    input.environment
  )
  const lastEnvironmentFingerprint =
    input.validation.lastEnvironmentFingerprint ??
    createRealtimePresetEnvironmentFingerprint({
      platform: input.validation.platformModeAtValidation?.split(':')[0],
      tunEnabled: input.validation.platformModeAtValidation?.endsWith(':tun'),
      helperMode: input.validation.helperModeAtValidation,
      udpConfidence: input.validation.udpConfidenceAtValidation
    })
  const environmentChanged =
    Boolean(lastEnvironmentFingerprint && currentEnvironmentFingerprint) &&
    lastEnvironmentFingerprint !== currentEnvironmentFingerprint
  const validationExpired = Boolean(staleAfter && now > staleAfter)
  const freshnessReasons = [
    ...(validationExpired ? ['validation_expired'] : []),
    ...(environmentChanged ? ['environment_changed'] : [])
  ]

  return {
    presetId: input.validation.presetId ?? DISCORD_REALTIME_PRESET_ID,
    validationStatus: input.validation.validationStatus ?? 'not_tested',
    validatedAt: input.validation.validatedAt,
    lastValidatedAt,
    validationSource: input.validation.validationSource ?? 'unknown',
    validationSummary: input.validation.validationSummary,
    helperModeAtValidation: input.validation.helperModeAtValidation,
    udpConfidenceAtValidation: input.validation.udpConfidenceAtValidation,
    platformModeAtValidation: input.validation.platformModeAtValidation,
    validationNotes: input.validation.validationNotes ?? createValidationNotes('not_tested'),
    validationChecks: input.validation.validationChecks?.map((check) => ({ ...check })),
    smokeResult: input.validation.smokeResult,
    observedIpEvidenceCount: input.validation.observedIpEvidenceCount,
    observedIpEvidenceProcesses: input.validation.observedIpEvidenceProcesses
      ? [...input.validation.observedIpEvidenceProcesses]
      : undefined,
    observedIpEvidenceIps: input.validation.observedIpEvidenceIps
      ? [...input.validation.observedIpEvidenceIps]
      : undefined,
    validationExpired,
    staleAfter,
    environmentChanged,
    lastEnvironmentFingerprint,
    currentEnvironmentFingerprint,
    freshnessReasons
  }
}

export function createRealtimePresetEnvironmentFingerprint(
  environment?: RealtimePresetValidationEnvironment
): string | undefined {
  if (!environment) return undefined
  const parts = [
    `profile=${environment.profileId ?? 'unknown'}`,
    `platform=${environment.platform ?? 'unknown'}`,
    `tun=${environment.tunEnabled === undefined ? 'unknown' : environment.tunEnabled ? 'on' : 'off'}`,
    `helper=${environment.helperMode ?? 'unknown'}`,
    `udp=${environment.udpConfidence ?? 'unknown'}`
  ]
  return parts.join('|')
}

function classifyRealtimeConfidence(input: {
  ruleCoverage: RealtimeRuleCoverage
  helperUdpValidated: boolean
  endToEndUdpValidated: boolean
}): RealtimeConfidence {
  if (!input.helperUdpValidated || input.ruleCoverage.proxyRuleCount === 0) return 'low'

  if (input.endToEndUdpValidated && input.ruleCoverage.catchAllProxy) return 'high'

  if (
    input.ruleCoverage.catchAllProxy ||
    (input.ruleCoverage.processCoverage && input.ruleCoverage.domainCoverage)
  ) {
    return 'medium'
  }

  return 'low'
}

function collectRealtimeWarnings(input: {
  ruleCoverage: RealtimeRuleCoverage
  helperUdpValidated: boolean
  helperUdpAdvertised: boolean
  endToEndUdpValidated: boolean
  platform?: string
  tunEnabled?: boolean
}): RealtimeReliabilityWarning[] {
  const warnings: RealtimeReliabilityWarning[] = []

  if (!input.helperUdpValidated || !input.helperUdpAdvertised) {
    warnings.push({
      code: 'udp_not_validated',
      message: 'Voice/media traffic may be unstable because helper UDP is not validated.'
    })
  } else if (!input.endToEndUdpValidated) {
    warnings.push({
      code: 'udp_not_end_to_end_validated',
      message:
        'Helper UDP is validated at the SOCKS proxy level, but app-level media traffic is not proven end-to-end.'
    })
  }

  if (input.ruleCoverage.proxyRuleCount === 0) {
    warnings.push({
      code: 'no_proxy_rule_coverage',
      message: 'No VPN/PROXY rules currently cover realtime traffic.'
    })
  }

  if (!input.ruleCoverage.catchAllProxy) {
    warnings.push({
      code: 'no_final_proxy_catch_all',
      message:
        'Some realtime traffic may still go DIRECT because no MATCH,PROXY catch-all is active.'
    })
  }

  if (input.ruleCoverage.domainCoverage && !input.ruleCoverage.processCoverage) {
    warnings.push({
      code: 'domain_only_rules_partial',
      message:
        'Domain rules may cover control traffic but can miss voice/media endpoints that appear as UDP IP flows.'
    })
  }

  if (input.ruleCoverage.processCoverage && !input.ruleCoverage.domainCoverage) {
    warnings.push({
      code: 'process_only_rules_partial',
      message:
        'PROCESS-NAME rules are useful, but add domain rules or a catch-all for more reliable control and media coverage.'
    })
  }

  if (input.tunEnabled && input.platform === 'darwin' && input.ruleCoverage.processCoverage) {
    warnings.push({
      code: 'process_name_metadata_platform_dependent',
      message:
        'On macOS, PROCESS-NAME matching depends on runtime metadata and is not the same as native split tunneling.'
    })
  }

  return dedupeWarnings(warnings)
}

function collectRealtimeActions(input: {
  warnings: RealtimeReliabilityWarning[]
  coverage: RealtimeRuleCoverage
  helperUdpValidated: boolean
  endToEndUdpValidated: boolean
  platform?: string
  tunEnabled?: boolean
}): RealtimeReliabilityAction[] {
  const { coverage, helperUdpValidated } = input
  const warningCodes = new Set(input.warnings.map((warning) => warning.code))
  const actions: RealtimeReliabilityAction[] = []
  const add = (code: RealtimeReliabilityActionCode, message: string): void => {
    if (!actions.some((action) => action.code === code)) actions.push({ code, message })
  }

  if (!helperUdpValidated) {
    add(
      'validate_helper_udp',
      'Restart the VPN profile or run helper validation until UDP is advertised.'
    )
  } else if (!input.endToEndUdpValidated) {
    add(
      'verify_udp_end_to_end',
      'Verify UDP end-to-end with a real voice/media session before treating realtime traffic as stable.'
    )
  }
  if (!coverage.processCoverage || !coverage.domainCoverage) {
    add('add_realtime_preset', 'Apply the Discord / voice apps through VPN preset.')
  }
  if (!coverage.domainCoverage && coverage.processCoverage) {
    add(
      'strengthen_domain_coverage',
      'Add DOMAIN-SUFFIX rules for the app control and media domains.'
    )
  }
  if (warningCodes.has('no_final_proxy_catch_all')) {
    add(
      'add_final_match_proxy',
      'Add MATCH,PROXY if this VPN profile should carry all remaining traffic.'
    )
  }
  if (coverage.processCoverage && !coverage.catchAllProxy) {
    add(
      'add_observed_ip_rules',
      'If logs show stable media destination IPs, add them as IP-CIDR,PROXY rules for stronger coverage.'
    )
  }
  if (
    warningCodes.has('domain_only_rules_partial') ||
    warningCodes.has('process_only_rules_partial')
  ) {
    add(
      'add_process_and_domain_rules',
      'Use both PROCESS-NAME and DOMAIN-SUFFIX rules for realtime apps.'
    )
  }
  if (input.tunEnabled && input.platform === 'darwin' && coverage.processCoverage) {
    add(
      'review_platform_process_fallback',
      'On macOS, prefer domain/IP or catch-all coverage because PROCESS-NAME is fallback-based.'
    )
  }
  if (helperUdpValidated && coverage.proxyRuleCount > 0) {
    add(
      'run_realtime_smoke',
      'Verify a real voice/media session and inspect Mihomo connections for UDP PROXY matches.'
    )
  }

  return actions.slice(0, 8)
}

function createRealtimePresetValidationState(input: {
  explicit?: Partial<RealtimePresetValidationState>
  ruleCoverage: RealtimeRuleCoverage
  helperUdpValidated: boolean
  endToEndUdpValidated: boolean
  checkedAt?: number
  environment?: RealtimePresetValidationEnvironment
}): RealtimePresetValidationState {
  const explicitStatus = input.explicit?.validationStatus
  const inferredStatus: RealtimePresetValidationStatus =
    input.helperUdpValidated || input.ruleCoverage.proxyRuleCount > 0 || input.endToEndUdpValidated
      ? 'partial'
      : 'not_tested'
  const validationStatus = explicitStatus ?? inferredStatus
  const validationSource =
    input.explicit?.validationSource ??
    (input.endToEndUdpValidated
      ? 'connectivity_probe'
      : input.ruleCoverage.proxyRuleCount > 0 || input.helperUdpValidated
        ? 'runtime_state'
        : 'unknown')
  const validatedAt = input.explicit?.validatedAt ?? undefined
  const validationNotes = input.explicit?.validationNotes ?? createValidationNotes(validationStatus)

  const validation = {
    presetId: input.explicit?.presetId ?? DISCORD_REALTIME_PRESET_ID,
    validationStatus,
    validatedAt,
    lastValidatedAt: input.explicit?.lastValidatedAt ?? input.explicit?.validatedAt ?? validatedAt,
    validationSource,
    validationSummary: input.explicit?.validationSummary,
    helperModeAtValidation: input.explicit?.helperModeAtValidation,
    udpConfidenceAtValidation: input.explicit?.udpConfidenceAtValidation,
    platformModeAtValidation: input.explicit?.platformModeAtValidation,
    smokeResult: input.explicit?.smokeResult,
    observedIpEvidenceCount: input.explicit?.observedIpEvidenceCount,
    observedIpEvidenceProcesses: input.explicit?.observedIpEvidenceProcesses
      ? [...input.explicit.observedIpEvidenceProcesses]
      : undefined,
    observedIpEvidenceIps: input.explicit?.observedIpEvidenceIps
      ? [...input.explicit.observedIpEvidenceIps]
      : undefined,
    validationExpired: input.explicit?.validationExpired,
    staleAfter: input.explicit?.staleAfter,
    environmentChanged: input.explicit?.environmentChanged,
    lastEnvironmentFingerprint: input.explicit?.lastEnvironmentFingerprint,
    currentEnvironmentFingerprint: input.explicit?.currentEnvironmentFingerprint,
    freshnessReasons: input.explicit?.freshnessReasons
      ? [...input.explicit.freshnessReasons]
      : undefined,
    validationChecks: input.explicit?.validationChecks?.map((check) => ({ ...check })),
    validationNotes
  }
  return input.explicit
    ? applyRealtimePresetValidationFreshness({
        validation,
        environment: input.environment
      })
    : validation
}

function createValidationNotes(status: RealtimePresetValidationStatus): string[] {
  switch (status) {
    case 'smoke_passed':
      return [
        'Realtime preset smoke passed runtime checks, but app-level voice quality is not proven.'
      ]
    case 'validated':
      return ['Realtime preset has manual or app-level validation evidence.']
    case 'partial':
      return ['Realtime preset has partial runtime evidence but no app-level media proof.']
    case 'failed':
      return ['Realtime preset validation failed; inspect warnings and helper diagnostics.']
    case 'not_tested':
      return ['Realtime preset has not been validated with a real voice/media session.']
  }
}

function collectRealtimeTopReasons(
  warnings: RealtimeReliabilityWarning[],
  presetValidation: RealtimePresetValidationState,
  realtimeConfidence: RealtimeConfidence
): RealtimeReliabilityReason[] {
  if (realtimeConfidence === 'high' && presetValidation.validationStatus === 'validated') {
    return []
  }

  const reasons: RealtimeReliabilityReason[] = []
  const add = (code: RealtimeReliabilityReasonCode, message: string): void => {
    if (!reasons.some((reason) => reason.code === code)) reasons.push({ code, message })
  }

  if (presetValidation.validationStatus === 'failed') {
    add('preset_validation_failed', 'Preset validation failed for the current runtime state.')
  } else if (presetValidation.validationExpired || presetValidation.environmentChanged) {
    add(
      'preset_validation_stale',
      'Preset validation evidence is stale for the current runtime environment.'
    )
  } else if (presetValidation.validationStatus === 'not_tested') {
    add('preset_not_tested', 'Preset has not been tested with a real realtime session.')
  } else if (presetValidation.validationStatus === 'partial') {
    add(
      'preset_partially_validated',
      'Preset has partial evidence, but realtime media is not proven end-to-end.'
    )
  } else if (presetValidation.validationStatus === 'smoke_passed') {
    add(
      'preset_smoke_passed',
      'Preset smoke passed runtime checks, but voice quality still needs manual confirmation.'
    )
  }

  for (const warning of warnings) {
    add(warning.code, warning.message)
  }

  return reasons.slice(0, 4)
}

function normalizeRealtimeRule(rule: RealtimeRuleLike): RealtimeRuleLike {
  return {
    ...rule,
    type: normalizeRuleType(rule.type),
    target: normalizeProxyTarget(rule.target),
    value: rule.value?.trim() ?? ''
  }
}

function normalizeRuleType(type: string): string {
  return type.trim().replace(/[\s_]/g, '-').toUpperCase()
}

function normalizeProxyTarget(target: string): string {
  const normalized = target.trim()
  if (normalized === 'AMNEZIA_HELPER' || normalized === 'AMNEZIA_HELPER_PROXY') return 'PROXY'
  return normalized
}

function isProxyTarget(target: string): boolean {
  return normalizeProxyTarget(target).toUpperCase() === 'PROXY'
}

function dedupeWarnings(warnings: RealtimeReliabilityWarning[]): RealtimeReliabilityWarning[] {
  const result: RealtimeReliabilityWarning[] = []
  const seen = new Set<RealtimeReliabilityWarningCode>()
  for (const warning of warnings) {
    if (seen.has(warning.code)) continue
    seen.add(warning.code)
    result.push(warning)
  }
  return result
}

function getRealtimeUdpConfidence(input: {
  helperUdpValidated: boolean
  endToEndUdpValidated: boolean
}): RealtimeUdpConfidence {
  return input.endToEndUdpValidated
    ? 'end_to_end_validated'
    : input.helperUdpValidated
      ? 'proxy_validated'
      : 'unknown'
}

function collectValidationCheckNotes(
  checks: RealtimePresetValidationCheck[],
  status: RealtimePresetValidationStatus
): string[] {
  const failed = checks.filter((check) => check.status === 'failed')
  const warnings = checks.filter((check) => check.status === 'warning')
  if (failed.length > 0) return failed.map((check) => check.message)
  if (warnings.length > 0) return warnings.slice(0, 3).map((check) => check.message)
  return createValidationNotes(status)
}

function createPlatformMode(platform?: string, tunEnabled?: boolean): string {
  return `${platform ?? 'unknown'}:${tunEnabled ? 'tun' : 'proxy'}`
}

function checkPassed(
  validation: RealtimePresetValidationState,
  code: RealtimePresetValidationCheckCode
): boolean {
  return (
    validation.validationChecks?.some(
      (check) => check.code === code && check.status === 'passed'
    ) === true
  )
}

function checkWarning(
  validation: RealtimePresetValidationState,
  code: RealtimePresetValidationCheckCode
): boolean {
  return (
    validation.validationChecks?.some(
      (check) => check.code === code && check.status === 'warning'
    ) === true
  )
}

function dedupeStrings(values: string[]): string[] {
  const result: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const normalized = value.trim()
    const key = normalized.toLowerCase()
    if (!normalized || seen.has(key)) continue
    seen.add(key)
    result.push(normalized)
  }
  return result
}

function cloneRealtimePresetDefinition(
  definition: RealtimePresetDefinition
): RealtimePresetDefinition {
  return {
    ...definition,
    processNames: [...definition.processNames],
    domains: [...definition.domains],
    domainSuffixes: [...definition.domainSuffixes],
    ipCidrs: [...definition.ipCidrs],
    platformNotes: { ...definition.platformNotes },
    recommendedActions: [...definition.recommendedActions],
    smokeChecklistProfile: [...definition.smokeChecklistProfile]
  }
}
