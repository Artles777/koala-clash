import type { AmneziaHelperRoutingTarget, MihomoRoutingConfig } from './amnezia-helper-routing'

export const AMNEZIA_COMPATIBILITY_PROXY_GROUP_NAME = 'PROXY'
export const AMNEZIA_COMPATIBILITY_FALLBACK_RULE = 'MATCH,REJECT'

export function ensureAmneziaCompatibilityProxyGroup<T extends MihomoRoutingConfig>(
  config: T,
  target?: AmneziaHelperRoutingTarget
): T {
  const proxyGroups = Array.isArray(config['proxy-groups'])
    ? [...(config['proxy-groups'] as Array<Record<string, unknown>>)]
    : []
  const helperGroupName = target?.status === 'injected' ? target.groupName : undefined
  const proxies = helperGroupName ? [helperGroupName] : ['REJECT']
  const groupIndex = proxyGroups.findIndex(
    (group) => group.name === AMNEZIA_COMPATIBILITY_PROXY_GROUP_NAME
  )

  const proxyGroup = {
    name: AMNEZIA_COMPATIBILITY_PROXY_GROUP_NAME,
    type: 'select',
    proxies
  }

  if (groupIndex === -1) {
    return {
      ...config,
      'proxy-groups': [...proxyGroups, proxyGroup]
    } as T
  }

  proxyGroups[groupIndex] = {
    ...proxyGroups[groupIndex],
    ...proxyGroup
  }

  return {
    ...config,
    'proxy-groups': proxyGroups
  } as T
}

export function ensureAmneziaCompatibilityFallbackRule<T extends MihomoRoutingConfig>(
  config: T,
  target?: AmneziaHelperRoutingTarget
): T {
  if (target?.status === 'injected') return config

  const rules = Array.isArray(config.rules) ? [...config.rules] : []
  const lastMatchIndex = findLastIndex(rules, isMatchRule)

  if (lastMatchIndex >= 0) {
    if (isRejectMatchRule(rules[lastMatchIndex])) return config

    const nextRules = [...rules]
    nextRules[lastMatchIndex] = AMNEZIA_COMPATIBILITY_FALLBACK_RULE
    return {
      ...config,
      rules: nextRules
    } as T
  }

  return {
    ...config,
    rules: [...rules, AMNEZIA_COMPATIBILITY_FALLBACK_RULE]
  } as T
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) return index
  }
  return -1
}

function isMatchRule(rule: unknown): boolean {
  return typeof rule === 'string' && /^\s*MATCH\s*,/i.test(rule)
}

function isRejectMatchRule(rule: unknown): boolean {
  return typeof rule === 'string' && /^\s*MATCH\s*,\s*REJECT\s*$/i.test(rule)
}
