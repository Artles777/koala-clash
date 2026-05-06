export interface MihomoRoutingConfig {
  rules?: unknown[]
  'rule-providers'?: unknown
  [key: string]: unknown
}

export const KOALA_RU_BUNDLE_RULE_PROVIDER_NAME = 'ru-bundle'
export const KOALA_RU_BUNDLE_RULE_TARGET = 'PROXY'
export const KOALA_RU_BUNDLE_RULE_PROVIDER = {
  type: 'http',
  behavior: 'domain',
  format: 'mrs',
  url: 'https://github.com/legiz-ru/mihomo-rule-sets/raw/main/ru-bundle/rule.mrs',
  path: './ru-bundle/rule.mrs',
  interval: 86400,
  proxy: 'DIRECT'
} as const

export function createKoalaRuBundleRule(): string {
  return `RULE-SET,${KOALA_RU_BUNDLE_RULE_PROVIDER_NAME},${KOALA_RU_BUNDLE_RULE_TARGET}`
}

export function isKoalaRuBundleRuleString(rule: string): boolean {
  const [type, value] = rule.split(',').map((part) => part.trim())
  return type?.toUpperCase() === 'RULE-SET' && value === KOALA_RU_BUNDLE_RULE_PROVIDER_NAME
}

function isMihomoMatchRuleString(rule: string): boolean {
  const [type] = rule.split(',').map((part) => part.trim())
  return type?.toUpperCase() === 'MATCH'
}

export function pinKoalaRuBundleRulesLast(rules: string[]): string[] {
  const regularRules: string[] = []
  const ruBundleRules: string[] = []

  for (const rule of rules) {
    if (isKoalaRuBundleRuleString(rule)) {
      ruBundleRules.push(normalizeKoalaRuBundleRule(rule))
    } else {
      regularRules.push(rule)
    }
  }

  const pinnedRule = ruBundleRules[ruBundleRules.length - 1]
  if (!pinnedRule) return regularRules

  // MATCH is terminal in Mihomo; rules after it are unreachable.
  const firstMatchIndex = regularRules.findIndex(isMihomoMatchRuleString)
  if (firstMatchIndex === -1) return [...regularRules, pinnedRule]

  return [
    ...regularRules.slice(0, firstMatchIndex),
    pinnedRule,
    ...regularRules.slice(firstMatchIndex)
  ]
}

function normalizeKoalaRuBundleRule(rule: string): string {
  const parts = rule.split(',').map((part) => part.trim())
  const target = parts[2] || KOALA_RU_BUNDLE_RULE_TARGET
  const extras = parts.slice(3).filter((part) => part.length > 0)
  return ['RULE-SET', KOALA_RU_BUNDLE_RULE_PROVIDER_NAME, target, ...extras].join(',')
}

export function ensureMihomoRuleProviderPresets<T extends MihomoRoutingConfig>(config: T): T {
  if (!usesRuleProvider(config, KOALA_RU_BUNDLE_RULE_PROVIDER_NAME)) return config

  const currentProviders = isRecord(config['rule-providers'])
    ? (config['rule-providers'] as Record<string, unknown>)
    : {}

  if (currentProviders[KOALA_RU_BUNDLE_RULE_PROVIDER_NAME]) return config

  return {
    ...config,
    'rule-providers': {
      ...currentProviders,
      [KOALA_RU_BUNDLE_RULE_PROVIDER_NAME]: { ...KOALA_RU_BUNDLE_RULE_PROVIDER }
    }
  } as T
}

function usesRuleProvider(config: MihomoRoutingConfig, providerName: string): boolean {
  if (!Array.isArray(config.rules)) return false

  return config.rules.some((rule) => {
    if (typeof rule !== 'string') return false
    const [type, value] = rule.split(',').map((part) => part.trim())
    return type?.toUpperCase() === 'RULE-SET' && value === providerName
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
