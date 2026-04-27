import type { AmneziaHelperRule, AmneziaHelperRuleType } from './amnezia-helper-rules'

export type AmneziaHelperTunDnsEnhancedMode = 'fake-ip' | 'redir-host' | 'normal' | 'unknown'
export type AmneziaHelperRuleReliability = 'reliable' | 'degraded' | 'unlikely' | 'blocked'
export type AmneziaHelperRuleReliabilityReason =
  | 'tun_disabled'
  | 'no_enabled_helper_rules'
  | 'ip_cidr_only'
  | 'domain_rules_fake_ip_dns_hijack'
  | 'domain_rules_dns_disabled'
  | 'domain_rules_dns_hijack_missing'
  | 'domain_rules_redir_host'
  | 'domain_rules_normal_dns'
  | 'domain_rules_unknown_dns_mode'

export interface AmneziaHelperRuleTypeSummary {
  totalEnabledRules: number
  domainRuleCount: number
  ipCidrRuleCount: number
  hasDomainRules: boolean
  hasIpCidrRules: boolean
  hasIpCidrOnly: boolean
}

export interface AmneziaHelperTunDnsRuntimeState {
  tunEnabled: boolean
  dnsEnabled?: boolean
  dnsHijackEnabled: boolean
  dnsEnhancedMode: AmneziaHelperTunDnsEnhancedMode
}

export interface AmneziaHelperTunRuleReliabilityInput
  extends AmneziaHelperTunDnsRuntimeState {
  rules: AmneziaHelperRule[]
}

export interface AmneziaHelperTunRuleReliabilityResult {
  reliability: AmneziaHelperRuleReliability
  primaryReason: AmneziaHelperRuleReliabilityReason
  reasons: AmneziaHelperRuleReliabilityReason[]
  explanation: string
  tunEnabled: boolean
  dnsEnabled?: boolean
  dnsHijackEnabled: boolean
  dnsEnhancedMode: AmneziaHelperTunDnsEnhancedMode
  ruleTypes: AmneziaHelperRuleTypeSummary
}

export interface AmneziaHelperTunDnsConfigLike {
  tun?: {
    enable?: boolean
    'dns-hijack'?: unknown
  }
  dns?: {
    enable?: boolean
    'enhanced-mode'?: unknown
  }
}

const domainRuleTypes = new Set<AmneziaHelperRuleType>([
  'DOMAIN',
  'DOMAIN-SUFFIX',
  'DOMAIN-KEYWORD'
])

export function readAmneziaHelperTunDnsRuntimeState(
  config: AmneziaHelperTunDnsConfigLike | undefined
): AmneziaHelperTunDnsRuntimeState {
  const tun = config?.tun
  const dns = config?.dns

  return {
    tunEnabled: tun?.enable ?? false,
    dnsEnabled: dns?.enable,
    dnsHijackEnabled: isDnsHijackEnabled(tun?.['dns-hijack']),
    dnsEnhancedMode: normalizeDnsEnhancedMode(dns?.['enhanced-mode'])
  }
}

export function evaluateAmneziaHelperTunRuleReliability(
  input: AmneziaHelperTunRuleReliabilityInput
): AmneziaHelperTunRuleReliabilityResult {
  const ruleTypes = summarizeHelperRuleTypes(input.rules)

  if (!input.tunEnabled) {
    return createResult(input, ruleTypes, 'reliable', ['tun_disabled'])
  }

  if (ruleTypes.totalEnabledRules === 0) {
    return createResult(input, ruleTypes, 'reliable', ['no_enabled_helper_rules'])
  }

  if (!ruleTypes.hasDomainRules) {
    return createResult(input, ruleTypes, 'reliable', ['ip_cidr_only'])
  }

  if (input.dnsEnabled === false) {
    return createResult(input, ruleTypes, 'blocked', ['domain_rules_dns_disabled'])
  }

  if (!input.dnsHijackEnabled) {
    return createResult(input, ruleTypes, 'unlikely', ['domain_rules_dns_hijack_missing'])
  }

  switch (input.dnsEnhancedMode) {
    case 'fake-ip':
      return createResult(input, ruleTypes, 'reliable', ['domain_rules_fake_ip_dns_hijack'])
    case 'redir-host':
      return createResult(input, ruleTypes, 'degraded', ['domain_rules_redir_host'])
    case 'normal':
      return createResult(input, ruleTypes, 'degraded', ['domain_rules_normal_dns'])
    case 'unknown':
    default:
      return createResult(input, ruleTypes, 'degraded', ['domain_rules_unknown_dns_mode'])
  }
}

export function summarizeHelperRuleTypes(
  rules: AmneziaHelperRule[]
): AmneziaHelperRuleTypeSummary {
  const enabledRules = rules.filter((rule) => rule.enabled)
  const domainRuleCount = enabledRules.filter((rule) => domainRuleTypes.has(rule.type)).length
  const ipCidrRuleCount = enabledRules.filter((rule) => rule.type === 'IP-CIDR').length

  return {
    totalEnabledRules: enabledRules.length,
    domainRuleCount,
    ipCidrRuleCount,
    hasDomainRules: domainRuleCount > 0,
    hasIpCidrRules: ipCidrRuleCount > 0,
    hasIpCidrOnly: enabledRules.length > 0 && domainRuleCount === 0 && ipCidrRuleCount > 0
  }
}

export function normalizeDnsEnhancedMode(
  value: unknown
): AmneziaHelperTunDnsEnhancedMode {
  if (typeof value !== 'string') return 'unknown'
  const normalized = value.trim().toLowerCase()
  if (normalized === 'fake-ip' || normalized === 'redir-host' || normalized === 'normal') {
    return normalized
  }
  return 'unknown'
}

function isDnsHijackEnabled(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => typeof entry === 'string' && entry.trim().length > 0)
  }
  if (typeof value === 'string') return value.trim().length > 0
  return Boolean(value)
}

function createResult(
  input: AmneziaHelperTunRuleReliabilityInput,
  ruleTypes: AmneziaHelperRuleTypeSummary,
  reliability: AmneziaHelperRuleReliability,
  reasons: AmneziaHelperRuleReliabilityReason[]
): AmneziaHelperTunRuleReliabilityResult {
  const primaryReason = reasons[0]
  return {
    reliability,
    primaryReason,
    reasons,
    explanation: explain(primaryReason),
    tunEnabled: input.tunEnabled,
    dnsEnabled: input.dnsEnabled,
    dnsHijackEnabled: input.dnsHijackEnabled,
    dnsEnhancedMode: input.dnsEnhancedMode,
    ruleTypes
  }
}

function explain(reason: AmneziaHelperRuleReliabilityReason): string {
  switch (reason) {
    case 'tun_disabled':
      return 'TUN is disabled, so TUN DNS/fake-ip matching constraints do not apply.'
    case 'no_enabled_helper_rules':
      return 'No enabled AMNEZIA_HELPER rules are configured.'
    case 'ip_cidr_only':
      return 'Only IP-CIDR helper rules are enabled; domain DNS handling is not required.'
    case 'domain_rules_fake_ip_dns_hijack':
      return 'Domain helper rules are expected to match because TUN DNS hijack is enabled with fake-ip DNS mode.'
    case 'domain_rules_dns_disabled':
      return 'Domain helper rules are blocked because Mihomo DNS is disabled while TUN is enabled.'
    case 'domain_rules_dns_hijack_missing':
      return 'Domain helper rules are unlikely to match reliably because TUN DNS hijack is not enabled.'
    case 'domain_rules_redir_host':
      return 'Domain helper rules may work through DNS mapping, but fake-ip mode is not active.'
    case 'domain_rules_normal_dns':
      return 'Domain helper rules are degraded because DNS runs in normal mode under TUN.'
    case 'domain_rules_unknown_dns_mode':
      return 'Domain helper rule reliability is degraded because the current Mihomo DNS enhanced mode is unknown.'
  }
}
