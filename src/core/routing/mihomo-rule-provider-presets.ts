import type { MihomoRoutingConfig } from './amnezia-helper-routing'

export const KOALA_RU_BUNDLE_RULE_PROVIDER_NAME = 'ru-bundle'
export const KOALA_RU_BUNDLE_RULE_PROVIDER = {
  type: 'http',
  behavior: 'domain',
  format: 'mrs',
  url: 'https://github.com/legiz-ru/mihomo-rule-sets/raw/main/ru-bundle/rule.mrs',
  path: './ru-bundle/rule.mrs',
  interval: 86400
} as const

export function createKoalaRuBundleRule(target: string): string {
  return `RULE-SET,${KOALA_RU_BUNDLE_RULE_PROVIDER_NAME},${target.trim()}`
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
    return type.toUpperCase() === 'RULE-SET' && value === providerName
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
