import {
  AmneziaHelperRuntimeConfig,
  AmneziaHelperProxyProtocol
} from './amnezia-helper-runtime-config'
import { NormalizedProfileProtocol } from './normalized-profile'

export type AmneziaProductionBackendConfigIssueCode =
  | 'missing_endpoint'
  | 'missing_keys'
  | 'missing_allowed_ips'
  | 'missing_interface_address'
  | 'unsupported_protocol'
  | 'invalid_local_proxy'

export interface AmneziaProductionBackendConfigIssue {
  code: AmneziaProductionBackendConfigIssueCode
  path: string
  message: string
}

export class AmneziaProductionBackendConfigError extends Error {
  readonly issues: AmneziaProductionBackendConfigIssue[]

  constructor(issues: AmneziaProductionBackendConfigIssue[]) {
    super(`Amnezia production helper config is invalid: ${issues[0]?.message ?? 'unknown error'}`)
    this.name = 'AmneziaProductionBackendConfigError'
    this.issues = issues
  }
}

export type AmneziaProductionProfileType = Extract<
  NormalizedProfileProtocol,
  'amneziawg' | 'wireguard'
>

export interface AmneziaProductionBackendConfig {
  version: 1
  profile: {
    type: AmneziaProductionProfileType
    sourceKind: 'self_contained'
    name?: string
    keys: {
      privateKey: string
      serverPublicKey: string
      presharedKey?: string
    }
    endpoint: {
      host: string
      port: number
    }
    interface: {
      addresses: string[]
      mtu?: number
      dns?: string[]
    }
    peer: {
      allowedIPs: string[]
      persistentKeepalive?: number
    }
    amnezia?: Partial<Record<AmneziaProductionObfuscationKey, string>>
    metadata?: Record<string, string | number | boolean | string[]>
  }
  localProxy: {
    listenHost: string
    listenPort: number
    protocols: AmneziaHelperProxyProtocol[]
    udp: boolean
  }
  diagnostics?: {
    logLevel?: string
  }
}

type AmneziaProductionObfuscationKey =
  | 'Jc'
  | 'Jmin'
  | 'Jmax'
  | 'S1'
  | 'S2'
  | 'S3'
  | 'S4'
  | 'H1'
  | 'H2'
  | 'H3'
  | 'H4'
  | 'I1'
  | 'I2'
  | 'I3'
  | 'I4'
  | 'I5'

const supportedProductionProtocols = new Set<NormalizedProfileProtocol>(['amneziawg', 'wireguard'])

const obfuscationFieldMap: Record<string, AmneziaProductionObfuscationKey> = {
  Jc: 'Jc',
  Jmin: 'Jmin',
  Jmax: 'Jmax',
  S1: 'S1',
  S2: 'S2',
  S3: 'S3',
  S4: 'S4',
  H1: 'H1',
  H2: 'H2',
  H3: 'H3',
  H4: 'H4',
  I1: 'I1',
  I2: 'I2',
  I3: 'I3',
  I4: 'I4',
  I5: 'I5',
  junkPacketCount: 'Jc',
  junkPacketMinSize: 'Jmin',
  junkPacketMaxSize: 'Jmax',
  initPacketJunkSize: 'S1',
  responsePacketJunkSize: 'S2',
  cookieReplyPacketJunkSize: 'S3',
  transportPacketJunkSize: 'S4',
  initPacketMagicHeader: 'H1',
  responsePacketMagicHeader: 'H2',
  underloadPacketMagicHeader: 'H3',
  transportPacketMagicHeader: 'H4',
  specialJunk1: 'I1',
  specialJunk2: 'I2',
  specialJunk3: 'I3',
  specialJunk4: 'I4',
  specialJunk5: 'I5'
}

export function validateAmneziaProductionBackendConfig(
  config: AmneziaHelperRuntimeConfig
): AmneziaProductionBackendConfigIssue[] {
  const issues: AmneziaProductionBackendConfigIssue[] = []

  if (!supportedProductionProtocols.has(config.protocol)) {
    issues.push({
      code: 'unsupported_protocol',
      path: 'profile.type',
      message: `Standalone amnezia-helper v1 supports only amneziawg and wireguard profiles, got ${config.protocol}`
    })
  }

  if (
    !config.remote.host ||
    !Number.isInteger(config.remote.port) ||
    config.remote.port <= 0 ||
    config.remote.port > 65535
  ) {
    issues.push({
      code: 'missing_endpoint',
      path: 'profile.endpoint',
      message: 'Amnezia profile endpoint host and port are required'
    })
  }

  if (!config.auth.clientPrivateKey || !(config.peer.publicKey || config.auth.serverPublicKey)) {
    issues.push({
      code: 'missing_keys',
      path: 'profile.keys',
      message: 'Self-contained WireGuard/AmneziaWG profiles require private and server public keys'
    })
  }

  if (config.interface.addresses.length === 0) {
    issues.push({
      code: 'missing_interface_address',
      path: 'profile.interface.addresses',
      message: 'Self-contained WireGuard/AmneziaWG profiles require an interface address'
    })
  }

  if (config.peer.allowedIps.length === 0) {
    issues.push({
      code: 'missing_allowed_ips',
      path: 'profile.peer.allowedIPs',
      message: 'Self-contained WireGuard/AmneziaWG profiles require peer allowed IPs'
    })
  }

  if (
    !config.localProxy.host ||
    !Number.isInteger(config.localProxy.port) ||
    config.localProxy.port <= 0 ||
    config.localProxy.port > 65535
  ) {
    issues.push({
      code: 'invalid_local_proxy',
      path: 'localProxy',
      message: 'Production helper requires a concrete local SOCKS5 listen host and port'
    })
  }

  return issues
}

export function createAmneziaProductionBackendConfig(
  config: AmneziaHelperRuntimeConfig
): AmneziaProductionBackendConfig {
  const issues = validateAmneziaProductionBackendConfig(config)
  if (issues.length > 0) throw new AmneziaProductionBackendConfigError(issues)

  const type = config.protocol as AmneziaProductionProfileType
  const dns = compactStringArray(config.interface.dns)
  const mtu = config.interface.mtu ?? config.remote.transport.mtu
  const presharedKey = trimOptional(config.auth.presharedKey)
  const persistentKeepalive = config.peer.persistentKeepalive
  const amnezia =
    type === 'amneziawg' ? mapAmneziaObfuscation(config.amnezia.obfuscation) : undefined

  return {
    version: 1,
    profile: {
      type,
      sourceKind: 'self_contained',
      name: config.name,
      keys: {
        privateKey: config.auth.clientPrivateKey!,
        serverPublicKey: (config.peer.publicKey ?? config.auth.serverPublicKey)!,
        ...(presharedKey ? { presharedKey } : {})
      },
      endpoint: {
        host: config.remote.host,
        port: config.remote.port
      },
      interface: {
        addresses: compactStringArray(config.interface.addresses),
        ...(mtu ? { mtu } : {}),
        ...(dns.length > 0 ? { dns } : {})
      },
      peer: {
        allowedIPs: compactStringArray(config.peer.allowedIps),
        ...(persistentKeepalive !== undefined ? { persistentKeepalive } : {})
      },
      ...(amnezia && Object.keys(amnezia).length > 0 ? { amnezia } : {}),
      metadata: mapSafeMetadata(config)
    },
    localProxy: {
      listenHost: config.localProxy.host,
      listenPort: config.localProxy.port,
      protocols: ['socks5'],
      udp: true
    },
    diagnostics: {
      logLevel: 'info'
    }
  }
}

function mapAmneziaObfuscation(
  input: Record<string, string | number | boolean>
): Partial<Record<AmneziaProductionObfuscationKey, string>> | undefined {
  const result: Partial<Record<AmneziaProductionObfuscationKey, string>> = {}
  for (const [sourceKey, value] of Object.entries(input)) {
    const targetKey = obfuscationFieldMap[sourceKey]
    if (!targetKey) continue
    result[targetKey] = String(value)
  }
  return Object.keys(result).length > 0 ? result : undefined
}

function mapSafeMetadata(
  config: AmneziaHelperRuntimeConfig
): Record<string, string | number | boolean | string[]> {
  return {
    profileId: config.profileId,
    sourceId: config.sourceId,
    sourceType: config.metadata.sourceType,
    importedAt: config.metadata.importedAt,
    decodedFormat: config.metadata.decodedFormat,
    warnings: config.metadata.warnings
  }
}

function compactStringArray(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean)
}

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}
