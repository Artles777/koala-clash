import {
  AMNEZIA_HELPER_GROUP_NAME,
  AmneziaHelperRoutingTarget,
  MihomoRoutingConfig
} from './amnezia-helper-routing'

export const AMNEZIA_HELPER_RULE_TARGET = AMNEZIA_HELPER_GROUP_NAME

export type AmneziaHelperRuleType = 'DOMAIN' | 'DOMAIN-SUFFIX' | 'DOMAIN-KEYWORD' | 'IP-CIDR'
export type AmneziaHelperRuleTarget = typeof AMNEZIA_HELPER_RULE_TARGET
export type AmneziaHelperRuleValidationCode =
  | 'empty_value'
  | 'invalid_value'
  | 'invalid_type'
  | 'invalid_target'
  | 'duplicate_rule'

export interface AmneziaHelperRule {
  id: string
  type: AmneziaHelperRuleType
  value: string
  enabled: boolean
  target: AmneziaHelperRuleTarget
  note?: string
  createdAt: number
  updatedAt?: number
}

export interface AmneziaHelperRuleInput {
  packId?: string
  type: AmneziaHelperRuleType
  value: string
  enabled?: boolean
  note?: string
}

export interface AmneziaHelperRulePatch {
  type?: AmneziaHelperRuleType
  value?: string
  enabled?: boolean
  note?: string
}

export interface AmneziaHelperRuleValidationIssue {
  code: AmneziaHelperRuleValidationCode
  path: string
  message: string
}

export interface AmneziaHelperRuleInjectionResult<T extends MihomoRoutingConfig> {
  config: T
  injected: boolean
  serializedRules: string[]
}

const supportedRuleTypes = new Set<AmneziaHelperRuleType>([
  'DOMAIN',
  'DOMAIN-SUFFIX',
  'DOMAIN-KEYWORD',
  'IP-CIDR'
])

export function createAmneziaHelperRule(input: {
  id: string
  type: AmneziaHelperRuleType
  value: string
  enabled?: boolean
  note?: string
  now?: number
}): AmneziaHelperRule {
  const now = input.now ?? Date.now()

  return normalizeAmneziaHelperRule({
    id: input.id,
    type: input.type,
    value: input.value,
    enabled: input.enabled ?? true,
    target: AMNEZIA_HELPER_RULE_TARGET,
    note: input.note,
    createdAt: now
  })
}

export function normalizeAmneziaHelperRule(rule: AmneziaHelperRule): AmneziaHelperRule {
  const value = normalizeRuleValue(rule.type, rule.value)
  const note = rule.note?.trim()

  return {
    ...rule,
    value,
    enabled: rule.enabled ?? true,
    target: AMNEZIA_HELPER_RULE_TARGET,
    note: note || undefined
  }
}

export function validateAmneziaHelperRule(
  rule: AmneziaHelperRule,
  existingRules: AmneziaHelperRule[] = []
): AmneziaHelperRuleValidationIssue[] {
  const normalized = normalizeAmneziaHelperRule(rule)
  const issues: AmneziaHelperRuleValidationIssue[] = []

  if (!supportedRuleTypes.has(normalized.type)) {
    issues.push({
      code: 'invalid_type',
      path: 'type',
      message: 'Unsupported Amnezia helper rule type'
    })
  }

  if (normalized.target !== AMNEZIA_HELPER_RULE_TARGET) {
    issues.push({
      code: 'invalid_target',
      path: 'target',
      message: 'Amnezia helper rule target must be AMNEZIA_HELPER'
    })
  }

  if (!normalized.value) {
    issues.push({
      code: 'empty_value',
      path: 'value',
      message: 'Rule value is required'
    })
  } else if (!isRuleValueValid(normalized.type, normalized.value)) {
    issues.push({
      code: 'invalid_value',
      path: 'value',
      message: `Invalid ${normalized.type} rule value`
    })
  }

  const duplicate = existingRules
    .map(normalizeAmneziaHelperRule)
    .find(
      (existing) =>
        existing.id !== normalized.id &&
        existing.type === normalized.type &&
        existing.target === normalized.target &&
        existing.value.toLowerCase() === normalized.value.toLowerCase()
    )

  if (duplicate) {
    issues.push({
      code: 'duplicate_rule',
      path: 'value',
      message: 'A helper rule with the same type and value already exists'
    })
  }

  return issues
}

export function assertValidAmneziaHelperRule(
  rule: AmneziaHelperRule,
  existingRules: AmneziaHelperRule[] = []
): AmneziaHelperRule {
  const normalized = normalizeAmneziaHelperRule(rule)
  const issues = validateAmneziaHelperRule(normalized, existingRules)
  if (issues.length > 0) {
    throw new Error(issues[0].message)
  }
  return normalized
}

export function serializeAmneziaHelperRule(rule: AmneziaHelperRule): string | undefined {
  const normalized = normalizeAmneziaHelperRule(rule)
  const issues = validateAmneziaHelperRule(normalized)
  if (!normalized.enabled || issues.length > 0) return undefined

  return `${normalized.type},${normalized.value},${normalized.target}`
}

export function serializeAmneziaHelperRules(rules: AmneziaHelperRule[]): string[] {
  const seen = new Set<string>()
  const serialized: string[] = []

  for (const rule of rules) {
    const value = serializeAmneziaHelperRule(rule)
    if (!value || seen.has(value)) continue
    seen.add(value)
    serialized.push(value)
  }

  return serialized
}

export function injectAmneziaHelperRules<T extends MihomoRoutingConfig>(
  config: T,
  target: AmneziaHelperRoutingTarget | undefined,
  rules: AmneziaHelperRule[]
): AmneziaHelperRuleInjectionResult<T> {
  if (!target || target.status !== 'injected') {
    return {
      config,
      injected: false,
      serializedRules: []
    }
  }

  const serializedRules = serializeAmneziaHelperRules(rules)
  if (serializedRules.length === 0) {
    return {
      config,
      injected: false,
      serializedRules: []
    }
  }

  const existingRules = Array.isArray(config.rules) ? (config.rules as string[]) : []
  const existingRuleSet = new Set(existingRules.map((rule) => String(rule)))
  const rulesToPrepend = serializedRules.filter((rule) => !existingRuleSet.has(rule))

  if (rulesToPrepend.length === 0) {
    return {
      config,
      injected: false,
      serializedRules: []
    }
  }

  return {
    config: {
      ...config,
      rules: [...rulesToPrepend, ...existingRules]
    } as T,
    injected: true,
    serializedRules: rulesToPrepend
  }
}

function normalizeRuleValue(type: AmneziaHelperRuleType, value: string): string {
  const normalized = value.trim()
  return type === 'DOMAIN' || type === 'DOMAIN-SUFFIX' ? normalized.toLowerCase() : normalized
}

function isRuleValueValid(type: AmneziaHelperRuleType, value: string): boolean {
  if (value.includes(',')) return false

  switch (type) {
    case 'DOMAIN':
      return isDomain(value)
    case 'DOMAIN-SUFFIX':
      return isDomainSuffix(value)
    case 'DOMAIN-KEYWORD':
      return value.length > 0 && !/\s/.test(value)
    case 'IP-CIDR':
      return isIpv4Cidr(value)
  }
}

function isDomain(value: string): boolean {
  if (value.length < 2 || value.length > 253) return false
  if (value === 'localhost') return true

  return /^(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)\.)+[a-zA-Z]{2,}$/.test(value)
}

function isDomainSuffix(value: string): boolean {
  if (value.length < 2 || value.length > 253 || value.startsWith('.')) return false

  return /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/.test(value)
}

function isIpv4Cidr(value: string): boolean {
  const match = value.match(/^(\d{1,3})(?:\.(\d{1,3})){3}\/(\d{1,2})$/)
  if (!match) return false

  const [address, prefixRaw] = value.split('/')
  const prefix = Number(prefixRaw)
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false

  return address.split('.').every((part) => {
    const octet = Number(part)
    return Number.isInteger(octet) && octet >= 0 && octet <= 255
  })
}
