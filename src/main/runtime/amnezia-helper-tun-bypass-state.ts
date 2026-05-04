import {
  AmneziaHelperTunBypassResolution,
  AmneziaHelperTunBypassResolutionStatus
} from '../../core/routing/amnezia-helper-tun-bypass'

let activeTunBypass: AmneziaHelperTunBypassResolution | undefined
let lastTunBypass: AmneziaHelperTunBypassResolution | undefined

export function updateAmneziaHelperTunBypassState(
  resolution: AmneziaHelperTunBypassResolution | undefined
): { resolution?: AmneziaHelperTunBypassResolution; changed: boolean } {
  const nextActive = resolution?.status === 'resolved' ? resolution : undefined
  const changed = !isSameTunBypass(activeTunBypass, nextActive)

  activeTunBypass = cloneTunBypass(nextActive)
  lastTunBypass = cloneTunBypass(resolution)

  return {
    resolution: cloneTunBypass(resolution),
    changed
  }
}

export function getActiveAmneziaHelperTunBypass(): AmneziaHelperTunBypassResolution | undefined {
  return cloneTunBypass(activeTunBypass)
}

export function getLastAmneziaHelperTunBypass(): AmneziaHelperTunBypassResolution | undefined {
  return cloneTunBypass(lastTunBypass)
}

export function clearAmneziaHelperTunBypassState(): boolean {
  const changed = !!activeTunBypass
  activeTunBypass = undefined
  lastTunBypass = undefined
  return changed
}

function isSameTunBypass(
  current: AmneziaHelperTunBypassResolution | undefined,
  next: AmneziaHelperTunBypassResolution | undefined
): boolean {
  if (!current && !next) return true
  if (!current || !next) return false
  return (
    current.status === next.status &&
    current.endpointHost === next.endpointHost &&
    current.endpointPort === next.endpointPort &&
    serialize(current.ips) === serialize(next.ips) &&
    serialize(current.routeExcludeAddresses) === serialize(next.routeExcludeAddresses)
  )
}

function cloneTunBypass(
  resolution: AmneziaHelperTunBypassResolution | undefined
): AmneziaHelperTunBypassResolution | undefined {
  if (!resolution) return undefined
  return {
    ...resolution,
    status: resolution.status as AmneziaHelperTunBypassResolutionStatus,
    ips: [...resolution.ips],
    routeExcludeAddresses: [...resolution.routeExcludeAddresses],
    warnings: [...resolution.warnings]
  }
}

function serialize(values: string[]): string {
  return values.join('\n')
}
