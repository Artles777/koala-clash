export type ImportedSourceType = 'amnezia_vpn_uri'

export interface ImportedSource {
  id: string
  type: ImportedSourceType
  raw: string
  importedAt: number
}

export type NormalizedProfileProtocol =
  | 'wireguard'
  | 'amneziawg'
  | 'openvpn'
  | 'xray'
  | 'shadowsocks'
  | 'unknown'

export interface NormalizedEndpoint {
  host: string
  port?: number
}

export interface NormalizedTransport {
  type: 'udp' | 'tcp' | 'unknown'
  endpoint?: NormalizedEndpoint
  mtu?: number
}

export interface NormalizedAuth {
  clientPrivateKey?: string
  serverPublicKey?: string
  presharedKey?: string
  username?: string
}

export interface NormalizedInterface {
  addresses: string[]
  dns: string[]
  mtu?: number
}

export interface NormalizedPeer {
  endpoint?: string
  publicKey?: string
  allowedIps: string[]
  persistentKeepalive?: number
}

export interface NormalizedAmneziaData {
  defaultContainer?: string
  container?: string
  protocolVersion?: string
  obfuscation: Record<string, string | number | boolean>
}

export interface NormalizedProfileMetadata {
  importedAt: number
  decodedFormat: string
  sourceType: ImportedSourceType
  warnings: string[]
}

export interface NormalizedProfile {
  id: string
  name: string
  sourceId: string
  protocol: NormalizedProfileProtocol
  enabled: boolean
  transport: NormalizedTransport
  auth: NormalizedAuth
  interface: NormalizedInterface
  peer: NormalizedPeer
  amnezia: NormalizedAmneziaData
  metadata: NormalizedProfileMetadata
}

export interface NormalizedProfileValidationIssue {
  code: 'missing_required_field' | 'unsupported_protocol' | 'missing_endpoint' | 'missing_keys'
  path: string
  message: string
}

const supportedProtocols = new Set<NormalizedProfileProtocol>([
  'wireguard',
  'amneziawg',
  'openvpn',
  'xray',
  'shadowsocks'
])

export function validateNormalizedProfile(
  profile: NormalizedProfile
): NormalizedProfileValidationIssue[] {
  const issues: NormalizedProfileValidationIssue[] = []

  if (!profile.id) {
    issues.push({
      code: 'missing_required_field',
      path: 'id',
      message: 'Profile id is required'
    })
  }
  if (!profile.name) {
    issues.push({
      code: 'missing_required_field',
      path: 'name',
      message: 'Profile name is required'
    })
  }
  if (!profile.sourceId) {
    issues.push({
      code: 'missing_required_field',
      path: 'sourceId',
      message: 'Source id is required'
    })
  }
  if (!supportedProtocols.has(profile.protocol)) {
    issues.push({
      code: 'unsupported_protocol',
      path: 'protocol',
      message: `Unsupported profile protocol: ${profile.protocol}`
    })
  }
  if (!profile.transport.endpoint?.host) {
    issues.push({
      code: 'missing_endpoint',
      path: 'transport.endpoint',
      message: 'Amnezia profile is missing a server endpoint'
    })
  }
  if (
    (profile.protocol === 'wireguard' || profile.protocol === 'amneziawg') &&
    (!profile.auth.clientPrivateKey || !profile.peer.publicKey)
  ) {
    issues.push({
      code: 'missing_keys',
      path: 'auth',
      message: 'WireGuard-based Amnezia profile is missing required keys'
    })
  }

  return issues
}
