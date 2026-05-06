export interface NamedProxyLike {
  name?: string
}

export function getUserFacingProxyDisplayName(name: string | undefined): string {
  return name ?? ''
}

export function getUserFacingProxyType(name: string | undefined, type: string | undefined): string {
  void name
  return type ?? ''
}

export function createUserFacingProxyGroups<T extends NamedProxyLike>(groups: T[]): T[] {
  return groups
}

export function createUserFacingProxyGroupEntries<T extends NamedProxyLike>(entries: T[]): T[] {
  return entries
}
