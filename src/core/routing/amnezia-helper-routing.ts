import { AmneziaHelperTunBypassResolution } from './amnezia-helper-tun-bypass'
import {
  AmneziaHelperUdpCapability,
  createInitialAmneziaHelperUdpCapability,
  shouldAdvertiseAmneziaHelperUdp
} from './amnezia-helper-udp-capability'

export const AMNEZIA_HELPER_GROUP_NAME = 'AMNEZIA_HELPER'
export const AMNEZIA_HELPER_OUTBOUND_NAME = 'AMNEZIA_HELPER_PROXY'

export type AmneziaHelperRoutingTargetStatus = 'not_injected' | 'injected' | 'unavailable'

export type AmneziaHelperRoutingUnavailableReason =
  | 'helper_not_ready'
  | 'helper_stopped'
  | 'helper_failed'
  | 'missing_endpoint'
  | 'name_conflict'
  | 'stub_backend'

export interface AmneziaHelperRoutingEndpoint {
  host: string
  port: number
  protocol: 'socks5'
}

export interface AmneziaHelperRoutingTarget {
  profileId: string
  groupName: string
  outboundName: string
  status: AmneziaHelperRoutingTargetStatus
  endpoint?: AmneziaHelperRoutingEndpoint
  tunBypass?: AmneziaHelperTunBypassResolution
  udpCapability?: AmneziaHelperUdpCapability
  reason?: AmneziaHelperRoutingUnavailableReason
  updatedAt: number
}

export interface AmneziaHelperRoutingSessionLike {
  profileId: string
  status: 'idle' | 'starting' | 'running' | 'stopping' | 'stopped' | 'failed'
  readiness: 'unknown' | 'checking' | 'ready' | 'failed'
  backendMode?: 'production' | 'proxy-prototype' | 'stub'
  localEndpoint?: AmneziaHelperRoutingEndpoint
  tunBypass?: AmneziaHelperTunBypassResolution
  udpCapability?: AmneziaHelperUdpCapability
}

export interface MihomoProxyEntry {
  name?: string
  type?: string
  server?: string
  port?: number
  udp?: boolean
  [key: string]: unknown
}

export interface MihomoProxyGroupEntry {
  name?: string
  type?: string
  proxies?: string[]
  [key: string]: unknown
}

export interface MihomoRoutingConfig {
  proxies?: MihomoProxyEntry[]
  'proxy-groups'?: MihomoProxyGroupEntry[]
  [key: string]: unknown
}

export interface AmneziaHelperRoutingInjectionResult<T extends MihomoRoutingConfig> {
  config: T
  injected: boolean
  target?: AmneziaHelperRoutingTarget
  reason?: AmneziaHelperRoutingUnavailableReason
}

export function createAmneziaHelperRoutingTarget(
  session: AmneziaHelperRoutingSessionLike,
  now = Date.now
): AmneziaHelperRoutingTarget {
  const target: AmneziaHelperRoutingTarget = {
    profileId: session.profileId,
    groupName: AMNEZIA_HELPER_GROUP_NAME,
    outboundName: AMNEZIA_HELPER_OUTBOUND_NAME,
    status: 'unavailable',
    updatedAt: now()
  }
  if (session.tunBypass) target.tunBypass = cloneTunBypass(session.tunBypass)
  target.udpCapability =
    session.udpCapability ?? createInitialAmneziaHelperUdpCapability(session.backendMode, now())

  if (!session.profileId || session.status === 'idle') {
    return {
      ...target,
      status: 'not_injected',
      reason: 'helper_stopped'
    }
  }

  if (session.status === 'failed' || session.readiness === 'failed') {
    return {
      ...target,
      reason: 'helper_failed'
    }
  }

  if (session.backendMode === 'stub') {
    return {
      ...target,
      reason: 'stub_backend'
    }
  }

  if (session.status === 'stopping' || session.status === 'stopped') {
    return {
      ...target,
      reason: 'helper_stopped'
    }
  }

  if (session.status !== 'running' || session.readiness !== 'ready') {
    return {
      ...target,
      reason: 'helper_not_ready'
    }
  }

  if (!isValidRoutingEndpoint(session.localEndpoint)) {
    return {
      ...target,
      reason: 'missing_endpoint'
    }
  }

  return {
    ...target,
    status: 'injected',
    endpoint: { ...session.localEndpoint }
  }
}

export function injectAmneziaHelperRoutingTarget<T extends MihomoRoutingConfig>(
  config: T,
  target?: AmneziaHelperRoutingTarget
): AmneziaHelperRoutingInjectionResult<T> {
  if (!target || target.status !== 'injected' || !target.endpoint) {
    return {
      config,
      injected: false,
      target,
      reason: target?.reason
    }
  }

  const proxies = Array.isArray(config.proxies) ? config.proxies : []
  const proxyGroups = Array.isArray(config['proxy-groups']) ? config['proxy-groups'] : []

  if (hasNamedEntry(proxies, target.outboundName) || hasNamedEntry(proxyGroups, target.groupName)) {
    return {
      config,
      injected: false,
      target: {
        ...target,
        status: 'unavailable',
        reason: 'name_conflict'
      },
      reason: 'name_conflict'
    }
  }

  const nextConfig = {
    ...config,
    proxies: [...proxies, createHelperOutbound(target)],
    'proxy-groups': [...proxyGroups, createHelperGroup(target)]
  }

  return {
    config: nextConfig as T,
    injected: true,
    target
  }
}

function createHelperOutbound(target: AmneziaHelperRoutingTarget): MihomoProxyEntry {
  const endpoint = target.endpoint
  if (!endpoint) {
    throw new Error('Amnezia helper routing target endpoint is missing')
  }

  return {
    name: target.outboundName,
    type: endpoint.protocol,
    server: endpoint.host,
    port: endpoint.port,
    udp: shouldAdvertiseAmneziaHelperUdp(target.udpCapability)
  }
}

function createHelperGroup(target: AmneziaHelperRoutingTarget): MihomoProxyGroupEntry {
  return {
    name: target.groupName,
    type: 'select',
    proxies: [target.outboundName]
  }
}

function hasNamedEntry(entries: Array<{ name?: string }>, name: string): boolean {
  return entries.some((entry) => entry.name === name)
}

function isValidRoutingEndpoint(
  endpoint: AmneziaHelperRoutingEndpoint | undefined
): endpoint is AmneziaHelperRoutingEndpoint {
  return (
    !!endpoint &&
    endpoint.protocol === 'socks5' &&
    typeof endpoint.host === 'string' &&
    endpoint.host.length > 0 &&
    Number.isInteger(endpoint.port) &&
    endpoint.port > 0 &&
    endpoint.port <= 65535
  )
}

function cloneTunBypass(
  resolution: AmneziaHelperTunBypassResolution | undefined
): AmneziaHelperTunBypassResolution | undefined {
  if (!resolution) return undefined
  return {
    ...resolution,
    ips: [...resolution.ips],
    routeExcludeAddresses: [...resolution.routeExcludeAddresses],
    warnings: [...resolution.warnings]
  }
}
