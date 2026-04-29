import {
  AMNEZIA_HELPER_GROUP_NAME,
  AMNEZIA_HELPER_OUTBOUND_NAME
} from '../routing/amnezia-helper-routing'

export const USER_FACING_AMNEZIA_PROXY_NAME = 'VPN / Amnezia'
export const USER_FACING_AMNEZIA_PROXY_TYPE = 'VPN'

export interface NamedProxyLike {
  name?: string
}

export function isInternalAmneziaProxyGroupName(name: string | undefined): boolean {
  return name === AMNEZIA_HELPER_GROUP_NAME
}

export function isInternalAmneziaProxyTargetName(name: string | undefined): boolean {
  return name === AMNEZIA_HELPER_GROUP_NAME || name === AMNEZIA_HELPER_OUTBOUND_NAME
}

export function getUserFacingProxyDisplayName(name: string | undefined): string {
  if (!name) return ''
  if (isInternalAmneziaProxyTargetName(name)) return USER_FACING_AMNEZIA_PROXY_NAME
  return name
}

export function getUserFacingProxyType(name: string | undefined, type: string | undefined): string {
  if (isInternalAmneziaProxyTargetName(name)) return USER_FACING_AMNEZIA_PROXY_TYPE
  return type ?? ''
}

export function createUserFacingProxyGroups<T extends NamedProxyLike>(groups: T[]): T[] {
  return groups.filter((group) => !isInternalAmneziaProxyGroupName(group.name))
}

export function createUserFacingProxyGroupEntries<T extends NamedProxyLike>(entries: T[]): T[] {
  const hasHelperGroupEntry = entries.some((entry) => entry.name === AMNEZIA_HELPER_GROUP_NAME)
  const result: T[] = []
  let hasShownAmneziaEntry = false

  for (const entry of entries) {
    if (!isInternalAmneziaProxyTargetName(entry.name)) {
      result.push(entry)
      continue
    }

    if (entry.name === AMNEZIA_HELPER_OUTBOUND_NAME && hasHelperGroupEntry) {
      continue
    }

    if (hasShownAmneziaEntry) {
      continue
    }

    result.push(entry)
    hasShownAmneziaEntry = true
  }

  return result
}
