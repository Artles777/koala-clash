import type { DirectTunBypassResolution } from '../../core/routing/direct-tun-bypass'

let lastDirectTunBypass: DirectTunBypassResolution | undefined

export function updateDirectTunBypassState(
  resolution: DirectTunBypassResolution | undefined
): void {
  lastDirectTunBypass = resolution ? cloneDirectTunBypassResolution(resolution) : undefined
}

export function getLastDirectTunBypass(): DirectTunBypassResolution | undefined {
  return cloneDirectTunBypassResolution(lastDirectTunBypass)
}

function cloneDirectTunBypassResolution(
  resolution: DirectTunBypassResolution | undefined
): DirectTunBypassResolution | undefined {
  if (!resolution) return undefined
  return {
    ...resolution,
    routeExcludeAddresses: [...resolution.routeExcludeAddresses],
    resolvedRules: resolution.resolvedRules.map((rule) => ({
      ...rule,
      routeExcludeAddresses: [...rule.routeExcludeAddresses]
    })),
    warnings: resolution.warnings.map((warning) => ({ ...warning })),
    unsupportedRules: resolution.unsupportedRules.map((rule) => ({ ...rule }))
  }
}
