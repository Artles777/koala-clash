import {
  AMNEZIA_HELPER_RULE_TARGET,
  AmneziaHelperRule,
  AmneziaHelperRuleType,
  normalizeAmneziaHelperRule,
  validateAmneziaHelperRule
} from './amnezia-helper-rules'
import { AmneziaHelperRoutingTarget } from './amnezia-helper-routing'

export type AmneziaHelperRoutingDiagnosticReason =
  | 'invalid_input'
  | 'no_rule_match'
  | 'helper_not_injected'
  | 'helper_not_ready'
  | 'helper_rule_match'

export interface AmneziaHelperRoutingDiagnosticInput {
  value?: string
  host?: string
  domain?: string
  url?: string
  ip?: string
}

export interface NormalizedAmneziaHelperRoutingDiagnosticInput {
  raw: string
  host?: string
  domain?: string
  ip?: string
}

export interface AmneziaHelperRoutingDiagnosticResult {
  input: NormalizedAmneziaHelperRoutingDiagnosticInput
  matched: boolean
  matchedRuleId?: string
  matchedRuleType?: AmneziaHelperRuleType
  matchedRuleValue?: string
  helperInjected: boolean
  helperReady: boolean
  resultingTarget?: {
    groupName: string
    outboundName: string
    endpoint?: {
      host: string
      port: number
      protocol: 'socks5'
    }
  }
  reasonCode: AmneziaHelperRoutingDiagnosticReason
  explanation: string
}

interface MatchCandidate {
  rule: AmneziaHelperRule
}

export function evaluateAmneziaHelperRoutingDiagnostic(input: {
  input: AmneziaHelperRoutingDiagnosticInput
  rules: AmneziaHelperRule[]
  target?: AmneziaHelperRoutingTarget
}): AmneziaHelperRoutingDiagnosticResult {
  const normalizedInput = normalizeDiagnosticInput(input.input)
  if (!normalizedInput) {
    return {
      input: {
        raw: getRawInput(input.input)
      },
      matched: false,
      helperInjected: isHelperInjected(input.target),
      helperReady: isHelperReady(input.target),
      resultingTarget: targetToResult(input.target),
      reasonCode: 'invalid_input',
      explanation: 'Input is not a valid URL, host, domain, or IPv4 address'
    }
  }

  const match = findFirstMatchingRule(normalizedInput, input.rules)
  if (!match) {
    return {
      input: normalizedInput,
      matched: false,
      helperInjected: isHelperInjected(input.target),
      helperReady: isHelperReady(input.target),
      resultingTarget: targetToResult(input.target),
      reasonCode: 'no_rule_match',
      explanation: 'No enabled AMNEZIA_HELPER rule matches this input'
    }
  }

  const helperInjected = isHelperInjected(input.target)
  const helperReady = isHelperReady(input.target)
  const resultingTarget = targetToResult(input.target)
  const baseResult: AmneziaHelperRoutingDiagnosticResult = {
    input: normalizedInput,
    matched: true,
    matchedRuleId: match.rule.id,
    matchedRuleType: match.rule.type,
    matchedRuleValue: match.rule.value,
    helperInjected,
    helperReady,
    resultingTarget,
    reasonCode: 'helper_rule_match',
    explanation: `${match.rule.type} ${match.rule.value} matches and routes to ${AMNEZIA_HELPER_RULE_TARGET}`
  }

  if (helperReady) return baseResult

  if (input.target?.reason === 'helper_not_ready') {
    return {
      ...baseResult,
      reasonCode: 'helper_not_ready',
      explanation: `${match.rule.type} ${match.rule.value} matches, but the Amnezia helper runtime is not ready`
    }
  }

  return {
    ...baseResult,
    reasonCode: 'helper_not_injected',
    explanation: `${match.rule.type} ${match.rule.value} matches, but AMNEZIA_HELPER is not currently injected into the runtime config`
  }
}

function findFirstMatchingRule(
  input: NormalizedAmneziaHelperRoutingDiagnosticInput,
  rules: AmneziaHelperRule[]
): MatchCandidate | undefined {
  for (const rule of rules) {
    const normalized = normalizeAmneziaHelperRule(rule)
    if (!normalized.enabled || validateAmneziaHelperRule(normalized).length > 0) continue
    if (doesRuleMatchInput(normalized, input)) return { rule: normalized }
  }

  return undefined
}

function doesRuleMatchInput(
  rule: AmneziaHelperRule,
  input: NormalizedAmneziaHelperRoutingDiagnosticInput
): boolean {
  switch (rule.type) {
    case 'DOMAIN':
      return Boolean(input.domain && input.domain === rule.value.toLowerCase())
    case 'DOMAIN-SUFFIX':
      return Boolean(
        input.domain &&
        (input.domain === rule.value.toLowerCase() ||
          input.domain.endsWith(`.${rule.value.toLowerCase()}`))
      )
    case 'DOMAIN-KEYWORD':
      return Boolean(input.domain && input.domain.includes(rule.value.toLowerCase()))
    case 'IP-CIDR':
      return Boolean(input.ip && isIpv4InCidr(input.ip, rule.value))
  }
}

function normalizeDiagnosticInput(
  input: AmneziaHelperRoutingDiagnosticInput
): NormalizedAmneziaHelperRoutingDiagnosticInput | undefined {
  const raw = getRawInput(input)
  if (!raw) return undefined

  if (input.ip) {
    const ip = normalizeIpv4(input.ip)
    return ip ? { raw, ip } : undefined
  }

  const explicitHost = input.host ?? input.domain
  if (explicitHost) return normalizeHostLikeInput(raw, explicitHost)

  if (input.url) return normalizeUrlInput(raw, input.url)

  return normalizeUrlInput(raw, raw) ?? normalizeHostLikeInput(raw, raw)
}

function normalizeUrlInput(
  raw: string,
  value: string
): NormalizedAmneziaHelperRoutingDiagnosticInput | undefined {
  try {
    const url = value.includes('://') ? new URL(value) : new URL(`http://${value}`)
    return normalizeHostLikeInput(raw, url.hostname)
  } catch {
    return undefined
  }
}

function normalizeHostLikeInput(
  raw: string,
  value: string
): NormalizedAmneziaHelperRoutingDiagnosticInput | undefined {
  const host = stripHostPort(value.trim().toLowerCase())
  if (!host) return undefined

  const ip = normalizeIpv4(host)
  if (ip) return { raw, host: ip, ip }

  if (!isDomainLike(host)) return undefined

  return {
    raw,
    host,
    domain: host
  }
}

function stripHostPort(value: string): string {
  if (value.startsWith('[')) return ''
  const withoutTrailingDot = value.endsWith('.') ? value.slice(0, -1) : value
  const portMatch = withoutTrailingDot.match(/^([^/:]+):\d+$/)
  return portMatch ? portMatch[1] : withoutTrailingDot
}

function getRawInput(input: AmneziaHelperRoutingDiagnosticInput): string {
  return (input.value ?? input.url ?? input.host ?? input.domain ?? input.ip ?? '').trim()
}

function targetToResult(
  target: AmneziaHelperRoutingTarget | undefined
): AmneziaHelperRoutingDiagnosticResult['resultingTarget'] {
  if (!target) return undefined

  return {
    groupName: target.groupName,
    outboundName: target.outboundName,
    endpoint: target.endpoint ? { ...target.endpoint } : undefined
  }
}

function isHelperInjected(target: AmneziaHelperRoutingTarget | undefined): boolean {
  return target?.status === 'injected'
}

function isHelperReady(target: AmneziaHelperRoutingTarget | undefined): boolean {
  return target?.status === 'injected' && Boolean(target.endpoint)
}

function isDomainLike(value: string): boolean {
  if (value === 'localhost') return true
  if (value.length < 2 || value.length > 253) return false

  return /^(?:(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.)+[a-z]{2,}$/.test(value)
}

function normalizeIpv4(value: string): string | undefined {
  const parts = value.trim().split('.')
  if (parts.length !== 4) return undefined
  const octets = parts.map((part) => Number(part))
  if (!octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)) {
    return undefined
  }

  return octets.join('.')
}

function isIpv4InCidr(ip: string, cidr: string): boolean {
  const [networkRaw, prefixRaw] = cidr.split('/')
  const network = normalizeIpv4(networkRaw)
  const candidate = normalizeIpv4(ip)
  const prefix = Number(prefixRaw)

  if (!network || !candidate || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    return false
  }

  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  return (ipv4ToInt(candidate) & mask) === (ipv4ToInt(network) & mask)
}

function ipv4ToInt(ip: string): number {
  return ip
    .split('.')
    .map((part) => Number(part))
    .reduce((acc, octet) => ((acc << 8) | octet) >>> 0, 0)
}
