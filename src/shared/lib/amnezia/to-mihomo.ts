import { stringify } from 'yaml'
import type { NormalizedProfile } from '../../../core/profiles/normalized-profile'

export type AmneziaMihomoNativeBlocker =
  | 'unsupported_protocol'
  | 'missing_endpoint'
  | 'missing_endpoint_port'
  | 'missing_private_key'
  | 'missing_public_key'
  | 'missing_interface_address'
  | 'multiple_ipv4_addresses'
  | 'multiple_ipv6_addresses'
  | 'invalid_interface_address'
  | 'missing_allowed_ips'
  | 'missing_amnezia_wg_option'
  | 'invalid_amnezia_wg_option'

export interface AmneziaMihomoNativeAssessment {
  supported: boolean
  blockers: AmneziaMihomoNativeBlocker[]
  warnings: string[]
}

export interface AmneziaMihomoNativeProfile {
  proxyName: string
  groupName: string
  config: {
    proxies: AmneziaMihomoWireGuardProxy[]
    'proxy-groups': AmneziaMihomoProxyGroup[]
    rules: string[]
  }
  warnings: string[]
}

export type AmneziaMihomoWireGuardProxy = Record<string, unknown>

export interface AmneziaMihomoProxyGroup {
  name: string
  type: 'select' | 'fallback'
  proxies: string[]
  url?: string
  interval?: number
  lazy?: boolean
}

const FALLBACK_HEALTHCHECK_URL = 'http://www.gstatic.com/generate_204'
const FALLBACK_HEALTHCHECK_INTERVAL = 60

const reservedProxyNames = new Set(['DIRECT', 'REJECT', 'GLOBAL', 'PROXY'])

const numberOptionMappings = [
  ['jc', ['Jc', 'junkPacketCount']],
  ['jmin', ['Jmin', 'junkPacketMinSize']],
  ['jmax', ['Jmax', 'junkPacketMaxSize']],
  ['s1', ['S1', 'initPacketJunkSize']],
  ['s2', ['S2', 'responsePacketJunkSize']],
  ['s3', ['S3', 'cookieReplyPacketJunkSize']],
  ['s4', ['S4', 'transportPacketJunkSize']],
  ['itime', ['Itime', 'itime']]
] as const

const stringOptionMappings = [
  ['h1', ['H1', 'initPacketMagicHeader']],
  ['h2', ['H2', 'responsePacketMagicHeader']],
  ['h3', ['H3', 'underloadPacketMagicHeader']],
  ['h4', ['H4', 'transportPacketMagicHeader']],
  ['i1', ['I1', 'specialJunk1']],
  ['i2', ['I2', 'specialJunk2']],
  ['i3', ['I3', 'specialJunk3']],
  ['i4', ['I4', 'specialJunk4']],
  ['i5', ['I5', 'specialJunk5']],
  ['j1', ['J1']],
  ['j2', ['J2']],
  ['j3', ['J3']]
] as const

export function assessAmneziaMihomoNativeSupport(
  profile: NormalizedProfile
): AmneziaMihomoNativeAssessment {
  const build = buildWireGuardProxy(profile)
  return {
    supported: build.blockers.length === 0,
    blockers: build.blockers,
    warnings: build.warnings
  }
}

export function createAmneziaMihomoNativeProfile(
  profile: NormalizedProfile
): AmneziaMihomoNativeProfile {
  const build = buildWireGuardProxy(profile)
  if (build.blockers.length > 0 || !build.proxy) {
    throw new Error(
      `Profile cannot be represented as Mihomo-native WireGuard: ${build.blockers.join(', ')}`
    )
  }

  const proxyName = build.proxy.name as string
  const groupName = 'PROXY'
  const useFallback = hasObfuscation(profile)
  const proxyGroup: AmneziaMihomoProxyGroup = useFallback
    ? {
        name: groupName,
        type: 'fallback',
        proxies: [proxyName],
        url: FALLBACK_HEALTHCHECK_URL,
        interval: FALLBACK_HEALTHCHECK_INTERVAL,
        lazy: true
      }
    : {
        name: groupName,
        type: 'select',
        proxies: [proxyName]
      }

  return {
    proxyName,
    groupName,
    config: {
      proxies: [build.proxy],
      'proxy-groups': [proxyGroup],
      rules: [...buildEndpointExcludeRules(profile), `MATCH,${groupName}`]
    },
    warnings: build.warnings
  }
}

function hasObfuscation(profile: NormalizedProfile): boolean {
  const obfuscation = profile.amnezia?.obfuscation
  if (!obfuscation) return false
  return Object.values(obfuscation).some((value) => {
    if (value === undefined || value === null) return false
    if (typeof value === 'string') return value.trim() !== ''
    return true
  })
}

function buildEndpointExcludeRules(profile: NormalizedProfile): string[] {
  const host = profile.transport.endpoint?.host?.trim()
  if (!host) return []
  const unbracketed = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
  if (isIpv4Literal(unbracketed)) {
    return [`IP-CIDR,${unbracketed}/32,DIRECT,no-resolve`]
  }
  if (isIpv6Literal(unbracketed)) {
    return [`IP-CIDR6,${unbracketed}/128,DIRECT,no-resolve`]
  }
  return [`DOMAIN,${unbracketed},DIRECT,no-resolve`]
}

function isIpv4Literal(value: string): boolean {
  const parts = value.split('.')
  if (parts.length !== 4) return false
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false
    const octet = Number(part)
    return Number.isInteger(octet) && octet >= 0 && octet <= 255
  })
}

function isIpv6Literal(value: string): boolean {
  return value.includes(':') && /^[0-9a-fA-F:.]+$/.test(value)
}

export function createAmneziaMihomoNativeYaml(profile: NormalizedProfile): string {
  return stringify(createAmneziaMihomoNativeProfile(profile).config)
}

function buildWireGuardProxy(profile: NormalizedProfile): {
  proxy?: AmneziaMihomoWireGuardProxy
  blockers: AmneziaMihomoNativeBlocker[]
  warnings: string[]
} {
  const blockers: AmneziaMihomoNativeBlocker[] = []
  const warnings: string[] = []

  if (profile.protocol !== 'wireguard' && profile.protocol !== 'amneziawg') {
    blockers.push('unsupported_protocol')
  }

  const endpoint = profile.transport.endpoint
  if (!endpoint?.host) blockers.push('missing_endpoint')
  if (!endpoint?.port) blockers.push('missing_endpoint_port')

  const privateKey = profile.auth.clientPrivateKey
  if (!privateKey) blockers.push('missing_private_key')

  const publicKey = profile.peer.publicKey ?? profile.auth.serverPublicKey
  if (!publicKey) blockers.push('missing_public_key')

  const addresses = splitInterfaceAddresses(profile.interface.addresses)
  blockers.push(...addresses.blockers)

  const allowedIps = compactStrings(profile.peer.allowedIps)
  if (allowedIps.length === 0) blockers.push('missing_allowed_ips')

  const amneziaWgOption =
    profile.protocol === 'amneziawg'
      ? mapAmneziaWgOption(profile.amnezia.obfuscation, blockers)
      : undefined

  if (profile.protocol === 'amneziawg' && !amneziaWgOption) {
    blockers.push('missing_amnezia_wg_option')
  }

  const dns = compactStrings(profile.interface.dns)

  if (blockers.length > 0) {
    return { blockers: uniqueBlockers(blockers), warnings }
  }

  const proxyName = createProxyName(profile)
  const peer: Record<string, unknown> = {
    server: endpoint!.host,
    port: endpoint!.port,
    'public-key': publicKey,
    'allowed-ips': allowedIps
  }
  if (profile.auth.presharedKey) peer['pre-shared-key'] = profile.auth.presharedKey

  const proxy: AmneziaMihomoWireGuardProxy = {
    name: proxyName,
    type: 'wireguard',
    'private-key': privateKey,
    peers: [peer],
    udp: true
  }

  if (addresses.ip) proxy.ip = addresses.ip
  if (addresses.ipv6) proxy.ipv6 = addresses.ipv6
  if (profile.transport.mtu ?? profile.interface.mtu) {
    proxy.mtu = profile.transport.mtu ?? profile.interface.mtu
  }
  if (profile.peer.persistentKeepalive) {
    proxy['persistent-keepalive'] = profile.peer.persistentKeepalive
  }
  if (dns.length > 0) {
    proxy['remote-dns-resolve'] = true
    proxy.dns = dns
  }
  if (amneziaWgOption) {
    proxy['amnezia-wg-option'] = amneziaWgOption
  }

  if (profile.interface.addresses.length > 2) {
    warnings.push('Only one IPv4 and one IPv6 interface address can be represented natively')
  }

  return {
    proxy,
    blockers: [],
    warnings
  }
}

function splitInterfaceAddresses(addresses: string[]): {
  ip?: string
  ipv6?: string
  blockers: AmneziaMihomoNativeBlocker[]
} {
  const blockers: AmneziaMihomoNativeBlocker[] = []
  let ip: string | undefined
  let ipv6: string | undefined
  const cleanAddresses = compactStrings(addresses)

  if (cleanAddresses.length === 0) {
    return { blockers: ['missing_interface_address'] }
  }

  for (const address of cleanAddresses) {
    const hostPart = address.split('/')[0]
    if (hostPart.includes(':')) {
      if (ipv6) blockers.push('multiple_ipv6_addresses')
      else ipv6 = address
      continue
    }
    if (hostPart.includes('.')) {
      if (ip) blockers.push('multiple_ipv4_addresses')
      else ip = address
      continue
    }
    blockers.push('invalid_interface_address')
  }

  if (!ip && !ipv6) blockers.push('missing_interface_address')
  return { ip, ipv6, blockers: uniqueBlockers(blockers) }
}

function mapAmneziaWgOption(
  obfuscation: Record<string, string | number | boolean>,
  blockers: AmneziaMihomoNativeBlocker[]
): Record<string, string | number> | undefined {
  const option: Record<string, string | number> = {}

  for (const [targetKey, sourceKeys] of numberOptionMappings) {
    const value = findObfuscationValue(obfuscation, sourceKeys)
    if (value === undefined) continue

    const numberValue = toInteger(value)
    if (numberValue === undefined) {
      blockers.push('invalid_amnezia_wg_option')
      continue
    }
    option[targetKey] = numberValue
  }

  for (const [targetKey, sourceKeys] of stringOptionMappings) {
    const value = findObfuscationValue(obfuscation, sourceKeys)
    if (value === undefined) continue

    if (typeof value === 'boolean') {
      blockers.push('invalid_amnezia_wg_option')
      continue
    }
    const stringValue = String(value).trim()
    if (stringValue) option[targetKey] = stringValue
  }

  return Object.keys(option).length > 0 ? option : undefined
}

function findObfuscationValue(
  obfuscation: Record<string, string | number | boolean>,
  keys: readonly string[]
): string | number | boolean | undefined {
  for (const key of keys) {
    const value = obfuscation[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return undefined
}

function toInteger(value: string | number | boolean): number | undefined {
  if (typeof value === 'boolean') return undefined
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(parsed)) return undefined
  return parsed
}

function createProxyName(profile: NormalizedProfile): string {
  const endpoint = profile.transport.endpoint
  const fallback = endpoint?.host ? `Amnezia ${endpoint.host}` : 'Amnezia WireGuard'
  const cleanName = sanitizeMihomoName(profile.name || fallback) || fallback
  if (reservedProxyNames.has(cleanName.toUpperCase())) {
    return `${cleanName} WireGuard`
  }
  return cleanName
}

function sanitizeMihomoName(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 96)
}

function compactStrings(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => String(value).trim()).filter(Boolean)
}

function uniqueBlockers(blockers: AmneziaMihomoNativeBlocker[]): AmneziaMihomoNativeBlocker[] {
  return Array.from(new Set(blockers))
}
