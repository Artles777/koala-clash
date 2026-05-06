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
