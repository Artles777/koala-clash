import {
  AmneziaHelperRoutingSessionLike,
  AmneziaHelperRoutingTarget,
  createAmneziaHelperRoutingTarget
} from '../../core/routing/amnezia-helper-routing'

let activeRoutingTarget: AmneziaHelperRoutingTarget | undefined
let lastRoutingTarget: AmneziaHelperRoutingTarget | undefined

export function updateAmneziaHelperRoutingTargetFromSession(
  session: AmneziaHelperRoutingSessionLike
): { target: AmneziaHelperRoutingTarget; changed: boolean } {
  const target = createAmneziaHelperRoutingTarget(session)
  const nextActiveTarget = target.status === 'injected' ? target : undefined
  const changed = !isSameActiveTarget(activeRoutingTarget, nextActiveTarget)

  activeRoutingTarget = cloneRoutingTarget(nextActiveTarget)
  lastRoutingTarget = cloneRoutingTarget(target)

  return {
    target,
    changed
  }
}

export function getActiveAmneziaHelperRoutingTarget(): AmneziaHelperRoutingTarget | undefined {
  return cloneRoutingTarget(activeRoutingTarget)
}

export function getLastAmneziaHelperRoutingTarget(): AmneziaHelperRoutingTarget | undefined {
  return cloneRoutingTarget(lastRoutingTarget)
}

export function clearAmneziaHelperRoutingTarget(): boolean {
  const changed = !!activeRoutingTarget
  activeRoutingTarget = undefined
  lastRoutingTarget = undefined
  return changed
}

function isSameActiveTarget(
  current: AmneziaHelperRoutingTarget | undefined,
  next: AmneziaHelperRoutingTarget | undefined
): boolean {
  if (!current && !next) return true
  if (!current || !next) return false

  return (
    current.profileId === next.profileId &&
    current.groupName === next.groupName &&
    current.outboundName === next.outboundName &&
    current.status === next.status &&
    current.endpoint?.host === next.endpoint?.host &&
    current.endpoint?.port === next.endpoint?.port &&
    current.endpoint?.protocol === next.endpoint?.protocol &&
    current.udpCapability?.udpSupport === next.udpCapability?.udpSupport &&
    current.udpCapability?.udpValidated === next.udpCapability?.udpValidated &&
    current.udpCapability?.udpReasonCode === next.udpCapability?.udpReasonCode &&
    serialize(current.tunBypass?.routeExcludeAddresses ?? []) ===
      serialize(next.tunBypass?.routeExcludeAddresses ?? [])
  )
}

function cloneRoutingTarget(
  target: AmneziaHelperRoutingTarget | undefined
): AmneziaHelperRoutingTarget | undefined {
  if (!target) return undefined

  return {
    ...target,
    endpoint: target.endpoint ? { ...target.endpoint } : undefined,
    tunBypass: target.tunBypass
      ? {
          ...target.tunBypass,
          ips: [...target.tunBypass.ips],
          routeExcludeAddresses: [...target.tunBypass.routeExcludeAddresses],
          warnings: [...target.tunBypass.warnings]
        }
      : undefined
  }
}

function serialize(values: string[]): string {
  return values.join('\n')
}
