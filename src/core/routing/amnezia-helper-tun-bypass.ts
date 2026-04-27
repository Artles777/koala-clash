export type AmneziaHelperTunBypassResolutionStatus = 'not_required' | 'resolved' | 'failed'

export interface AmneziaHelperTunBypassResolution {
  status: AmneziaHelperTunBypassResolutionStatus
  endpointHost?: string
  endpointPort?: number
  ips: string[]
  routeExcludeAddresses: string[]
  warnings: string[]
  error?: string
  resolvedAt: number
}

export interface AmneziaHelperTunBypassConfig {
  tun?: {
    enable?: boolean
    'route-exclude-address'?: string[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface AmneziaHelperTunBypassInjectionResult<T extends AmneziaHelperTunBypassConfig> {
  config: T
  injected: boolean
  routeExcludeAddresses: string[]
  reason?: 'tun_disabled' | 'bypass_not_resolved' | 'no_exclude_addresses'
}

export function createAmneziaHelperTunBypassNotRequired(
  reason: string,
  now = Date.now
): AmneziaHelperTunBypassResolution {
  return {
    status: 'not_required',
    ips: [],
    routeExcludeAddresses: [],
    warnings: [reason],
    resolvedAt: now()
  }
}

export function createAmneziaHelperTunBypassResolved(input: {
  endpointHost: string
  endpointPort?: number
  ips: string[]
  now?: () => number
}): AmneziaHelperTunBypassResolution {
  const ips = normalizeIpList(input.ips)
  const routeExcludeAddresses = ips.map(formatRouteExcludeAddress)

  return {
    status: routeExcludeAddresses.length > 0 ? 'resolved' : 'failed',
    endpointHost: normalizeEndpointHost(input.endpointHost),
    endpointPort: input.endpointPort,
    ips,
    routeExcludeAddresses,
    warnings: routeExcludeAddresses.length > 0 ? [] : ['no upstream IP addresses were resolved'],
    error: routeExcludeAddresses.length > 0 ? undefined : 'No upstream IP addresses were resolved',
    resolvedAt: input.now?.() ?? Date.now()
  }
}

export function createAmneziaHelperTunBypassFailed(input: {
  endpointHost?: string
  endpointPort?: number
  error: string
  warning?: string
  now?: () => number
}): AmneziaHelperTunBypassResolution {
  return {
    status: 'failed',
    endpointHost: input.endpointHost ? normalizeEndpointHost(input.endpointHost) : undefined,
    endpointPort: input.endpointPort,
    ips: [],
    routeExcludeAddresses: [],
    warnings: [input.warning ?? input.error],
    error: input.error,
    resolvedAt: input.now?.() ?? Date.now()
  }
}

export function injectAmneziaHelperTunBypass<T extends AmneziaHelperTunBypassConfig>(
  config: T,
  bypass?: AmneziaHelperTunBypassResolution
): AmneziaHelperTunBypassInjectionResult<T> {
  if (!config.tun?.enable) {
    return {
      config,
      injected: false,
      routeExcludeAddresses: [],
      reason: 'tun_disabled'
    }
  }

  if (!bypass || bypass.status !== 'resolved') {
    return {
      config,
      injected: false,
      routeExcludeAddresses: [],
      reason: 'bypass_not_resolved'
    }
  }

  const routeExcludeAddresses = normalizeRouteExcludeAddresses(bypass.routeExcludeAddresses)
  if (routeExcludeAddresses.length === 0) {
    return {
      config,
      injected: false,
      routeExcludeAddresses: [],
      reason: 'no_exclude_addresses'
    }
  }

  const existing = Array.isArray(config.tun['route-exclude-address'])
    ? config.tun['route-exclude-address']
    : []
  const merged = normalizeRouteExcludeAddresses([...existing, ...routeExcludeAddresses])

  return {
    config: {
      ...config,
      tun: {
        ...config.tun,
        'route-exclude-address': merged
      }
    } as T,
    injected: true,
    routeExcludeAddresses
  }
}

export function normalizeIpList(ips: string[]): string[] {
  return [...new Set(ips.map(normalizeEndpointHost).filter(isSupportedIpAddress))].sort()
}

export function normalizeRouteExcludeAddresses(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort()
}

export function formatRouteExcludeAddress(ip: string): string {
  const normalized = normalizeEndpointHost(ip)
  if (isIpv4Address(normalized)) return `${normalized}/32`
  return `${normalized}/128`
}

export function normalizeEndpointHost(host: string): string {
  const trimmed = host.trim()
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function isSupportedIpAddress(value: string): boolean {
  return isIpv4Address(value) || isIpv6Address(value)
}

function isIpv4Address(value: string): boolean {
  const parts = value.split('.')
  if (parts.length !== 4) return false
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false
    const octet = Number(part)
    return Number.isInteger(octet) && octet >= 0 && octet <= 255
  })
}

function isIpv6Address(value: string): boolean {
  return value.includes(':') && /^[0-9a-fA-F:.]+$/.test(value)
}
