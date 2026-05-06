export const SUPPORTED_MIHOMO_PROXY_TYPES = new Set([
  'wireguard',
  'vless',
  'vmess',
  'ss',
  'trojan',
  'hysteria2',
  'socks5',
  'http',
  'mihomo'
])

export type MihomoProfileValidationFailure =
  | { code: 'not_object' }
  | { code: 'missing_proxies_and_groups' }
  | { code: 'unsupported_proxy_type'; proxyType: string }

export interface MihomoProfileValidationResult {
  valid: boolean
  failure?: MihomoProfileValidationFailure
  message?: string
}

export function validateMihomoProfileShape(parsed: unknown): MihomoProfileValidationResult {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      valid: false,
      failure: { code: 'not_object' },
      message: 'Profile YAML did not parse to a Mihomo configuration object.'
    }
  }

  const config = parsed as Record<string, unknown>
  const proxies = Array.isArray(config.proxies) ? (config.proxies as unknown[]) : []
  const proxyGroups = Array.isArray(config['proxy-groups'])
    ? (config['proxy-groups'] as unknown[])
    : []

  if (proxies.length === 0 && proxyGroups.length === 0) {
    return {
      valid: false,
      failure: { code: 'missing_proxies_and_groups' },
      message: 'Profile has neither proxies nor proxy-groups defined.'
    }
  }

  for (const proxy of proxies) {
    if (!proxy || typeof proxy !== 'object' || Array.isArray(proxy)) continue
    const rawType = (proxy as Record<string, unknown>).type
    if (typeof rawType !== 'string') continue
    if (!SUPPORTED_MIHOMO_PROXY_TYPES.has(rawType)) {
      return {
        valid: false,
        failure: { code: 'unsupported_proxy_type', proxyType: rawType },
        message: `Profile contains unsupported proxy type "${rawType}".`
      }
    }
  }

  return { valid: true }
}
