import {
  ImportedSource,
  NormalizedAmneziaData,
  NormalizedAuth,
  NormalizedEndpoint,
  NormalizedInterface,
  NormalizedPeer,
  NormalizedProfile,
  NormalizedProfileProtocol,
  NormalizedTransport,
  validateNormalizedProfile
} from '../../../core/profiles/normalized-profile'
import { decodeAmneziaVpnUri, DecodedAmneziaPayload, isAmneziaVpnUri } from './codec'
import { AmneziaImportError, AmneziaImportErrorCode } from './errors'
import {
  ParsedWireGuardConfig,
  parseEndpoint,
  parseOptionalNumber,
  parseWireGuardConfig,
  splitCsv
} from './wireguard'

export interface ParseAmneziaVpnKeyOptions {
  sourceId: string
  profileId: string
  importedAt: number
}

export interface AmneziaImportDraft {
  source: ImportedSource
  profile: NormalizedProfile
  decoded: DecodedAmneziaPayload
}

type ParsedPayload =
  | {
      kind: 'amnezia_json'
      data: Record<string, unknown>
    }
  | {
      kind: 'wireguard_conf'
      data: ParsedWireGuardConfig
    }

const obfuscationKeys = [
  'Jc',
  'Jmin',
  'Jmax',
  'S1',
  'S2',
  'S3',
  'S4',
  'H1',
  'H2',
  'H3',
  'H4',
  'I1',
  'I2',
  'I3',
  'I4',
  'I5',
  'junkPacketCount',
  'junkPacketMinSize',
  'junkPacketMaxSize',
  'initPacketJunkSize',
  'responsePacketJunkSize',
  'initPacketMagicHeader',
  'responsePacketMagicHeader',
  'underloadPacketMagicHeader',
  'transportPacketMagicHeader',
  'cookieReplyPacketJunkSize',
  'transportPacketJunkSize',
  'specialJunk1',
  'specialJunk2',
  'specialJunk3',
  'specialJunk4',
  'specialJunk5',
  'isObfuscationEnabled'
]

export { isAmneziaVpnUri }

export function parseAmneziaVpnKey(
  raw: string,
  options: ParseAmneziaVpnKeyOptions
): AmneziaImportDraft {
  console.debug('[amnezia-import] parser start')

  const decoded = decodeAmneziaVpnUri(raw)
  console.debug('[amnezia-import] decode success', {
    encoding: decoded.encoding,
    byteLength: decoded.byteLength
  })

  const payload = parseDecodedPayload(decoded.text)
  const profile =
    payload.kind === 'wireguard_conf'
      ? normalizeWireGuardProfile(payload.data, options, decoded.encoding)
      : normalizeAmneziaJsonProfile(payload.data, options, decoded.encoding)

  console.debug('[amnezia-import] normalization result', {
    id: profile.id,
    protocol: profile.protocol,
    endpoint: profile.transport.endpoint
  })

  const validationIssues = validateNormalizedProfile(profile)
  if (validationIssues.length > 0) {
    console.debug('[amnezia-import] validation failure', validationIssues)
    const firstIssue = validationIssues[0]
    throw new AmneziaImportError(
      mapValidationCode(firstIssue.code),
      firstIssue.message,
      validationIssues
    )
  }

  return {
    source: {
      id: options.sourceId,
      type: 'amnezia_vpn_uri',
      raw: raw.trim(),
      importedAt: options.importedAt
    },
    profile,
    decoded
  }
}

function parseDecodedPayload(text: string): ParsedPayload {
  const trimmed = text.trim()

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (isRecord(parsed)) {
        return { kind: 'amnezia_json', data: parsed }
      }
    } catch (error) {
      throw new AmneziaImportError(
        'unsupported_payload',
        'Amnezia payload is not valid JSON',
        error
      )
    }
  }

  const wireGuard = parseWireGuardConfig(trimmed)
  if (wireGuard) {
    return { kind: 'wireguard_conf', data: wireGuard }
  }

  throw new AmneziaImportError(
    'unsupported_payload',
    'Decoded Amnezia payload does not contain a supported connection profile'
  )
}

function normalizeWireGuardProfile(
  config: ParsedWireGuardConfig,
  options: ParseAmneziaVpnKeyOptions,
  decodedFormat: string
): NormalizedProfile {
  const endpoint = parseEndpoint(config.peer.Endpoint)
  return createNormalizedProfile({
    options,
    decodedFormat,
    name: endpoint?.host ? `Amnezia ${endpoint.host}` : 'Amnezia WireGuard',
    protocol: 'wireguard',
    endpoint,
    transport: {
      type: 'udp',
      endpoint,
      mtu: parseOptionalNumber(config.interface.MTU)
    },
    auth: {
      clientPrivateKey: config.interface.PrivateKey,
      serverPublicKey: config.peer.PublicKey,
      presharedKey: config.peer.PresharedKey ?? config.peer.PreSharedKey
    },
    iface: {
      addresses: splitCsv(config.interface.Address),
      dns: splitCsv(config.interface.DNS),
      mtu: parseOptionalNumber(config.interface.MTU)
    },
    peer: {
      endpoint: config.peer.Endpoint,
      publicKey: config.peer.PublicKey,
      allowedIps: splitCsv(config.peer.AllowedIPs),
      persistentKeepalive: parseOptionalNumber(config.peer.PersistentKeepalive)
    },
    amnezia: {
      obfuscation: {}
    }
  })
}

function normalizeAmneziaJsonProfile(
  data: Record<string, unknown>,
  options: ParseAmneziaVpnKeyOptions,
  decodedFormat: string
): NormalizedProfile {
  const containers = asRecordArray(data.containers)
  const defaultContainer = asString(data.defaultContainer)
  const container =
    containers.find((item) => asString(item.container) === defaultContainer) ?? containers[0]

  if (!container) {
    throw new AmneziaImportError(
      'unsupported_payload',
      'Amnezia JSON payload does not contain a protocol container'
    )
  }

  const containerName = asString(container.container)
  const protocol = inferProtocol(containerName, container)
  const protocolKey = getProtocolConfigKey(protocol, container)
  const protocolConfig = protocolKey ? asRecord(container[protocolKey]) : undefined
  const lastConfig = parseLastConfig(protocolConfig)

  if (lastConfig.kind === 'wireguard_conf') {
    const wgProfile = normalizeWireGuardProfile(lastConfig.data, options, decodedFormat)
    return {
      ...wgProfile,
      protocol,
      name: getProfileName(data, wgProfile.transport.endpoint),
      amnezia: {
        ...wgProfile.amnezia,
        defaultContainer,
        container: containerName,
        protocolVersion: getProtocolVersion(protocolConfig),
        obfuscation: collectObfuscation(protocolConfig, container)
      }
    }
  }

  const configObject = lastConfig.data
  const endpoint = getEndpoint(data, protocolConfig, configObject)
  const allowedIps = splitCsv(configObject.allowed_ips ?? configObject.AllowedIPs)
  const mtu = parseOptionalNumber(configObject.mtu ?? configObject.MTU)

  return createNormalizedProfile({
    options,
    decodedFormat,
    name: getProfileName(data, endpoint),
    protocol,
    endpoint,
    transport: {
      type:
        protocol === 'openvpn' || protocol === 'xray' || protocol === 'shadowsocks' ? 'tcp' : 'udp',
      endpoint,
      mtu
    },
    auth: getAuth(configObject),
    iface: {
      addresses: splitCsv(configObject.client_ip ?? configObject.Address),
      dns: splitCsv(data.dns1 ? [data.dns1, data.dns2].filter(Boolean) : configObject.DNS),
      mtu
    },
    peer: {
      endpoint: endpoint ? formatEndpoint(endpoint) : undefined,
      publicKey: asString(configObject.server_pub_key ?? configObject.PublicKey),
      allowedIps,
      persistentKeepalive: parseOptionalNumber(
        configObject.persistent_keep_alive ?? configObject.PersistentKeepalive
      )
    },
    amnezia: {
      defaultContainer,
      container: containerName,
      protocolVersion: getProtocolVersion(protocolConfig),
      obfuscation: collectObfuscation(protocolConfig, configObject)
    }
  })
}

function createNormalizedProfile(input: {
  options: ParseAmneziaVpnKeyOptions
  decodedFormat: string
  name: string
  protocol: NormalizedProfileProtocol
  endpoint?: NormalizedEndpoint
  transport: NormalizedTransport
  auth: NormalizedAuth
  iface: NormalizedInterface
  peer: NormalizedPeer
  amnezia: Partial<NormalizedAmneziaData>
}): NormalizedProfile {
  return {
    id: input.options.profileId,
    name: input.name,
    sourceId: input.options.sourceId,
    protocol: input.protocol,
    enabled: true,
    transport: input.transport,
    auth: input.auth,
    interface: input.iface,
    peer: input.peer,
    amnezia: {
      obfuscation: {},
      ...input.amnezia
    },
    metadata: {
      importedAt: input.options.importedAt,
      decodedFormat: input.decodedFormat,
      sourceType: 'amnezia_vpn_uri',
      warnings: []
    }
  }
}

function parseLastConfig(protocolConfig: Record<string, unknown> | undefined):
  | {
      kind: 'json'
      data: Record<string, unknown>
    }
  | {
      kind: 'wireguard_conf'
      data: ParsedWireGuardConfig
    } {
  const lastConfigRaw = asString(protocolConfig?.last_config ?? protocolConfig?.config)
  if (!lastConfigRaw) return { kind: 'json', data: {} }

  const wireGuard = parseWireGuardConfig(lastConfigRaw)
  if (wireGuard) return { kind: 'wireguard_conf', data: wireGuard }

  try {
    const parsed = JSON.parse(lastConfigRaw)
    return { kind: 'json', data: isRecord(parsed) ? parsed : {} }
  } catch {
    return { kind: 'json', data: {} }
  }
}

function inferProtocol(
  containerName: string | undefined,
  container: Record<string, unknown>
): NormalizedProfileProtocol {
  const name = (containerName ?? '').toLowerCase()
  if (name.includes('awg')) return 'amneziawg'
  if (name.includes('wireguard')) return 'wireguard'
  if (name.includes('openvpn')) return 'openvpn'
  if (name.includes('ssxray') || name.includes('shadowsocks')) return 'shadowsocks'
  if (name.includes('xray')) return 'xray'
  if ('awg' in container) return 'amneziawg'
  if ('wireguard' in container) return 'wireguard'
  if ('openvpn' in container) return 'openvpn'
  if ('ssxray' in container) return 'shadowsocks'
  if ('xray' in container) return 'xray'
  return 'unknown'
}

function getProtocolConfigKey(
  protocol: NormalizedProfileProtocol,
  container: Record<string, unknown>
): string | undefined {
  const candidates =
    protocol === 'amneziawg'
      ? ['awg', 'wireguard']
      : protocol === 'wireguard'
        ? ['wireguard', 'awg']
        : protocol === 'openvpn'
          ? ['openvpn']
          : protocol === 'shadowsocks'
            ? ['ssxray', 'shadowsocks']
            : protocol === 'xray'
              ? ['xray']
              : []

  return candidates.find((candidate) => isRecord(container[candidate]))
}

function getEndpoint(
  data: Record<string, unknown>,
  protocolConfig: Record<string, unknown> | undefined,
  configObject: Record<string, unknown>
): NormalizedEndpoint | undefined {
  const host = asString(
    configObject.hostName ??
      configObject.hostname ??
      configObject.address ??
      protocolConfig?.hostName ??
      data.hostName
  )
  const port = parseOptionalNumber(
    configObject.port ?? configObject.server_port ?? protocolConfig?.port ?? data.port
  )

  if (host) return { host, ...(port ? { port } : {}) }

  return parseEndpoint(asString(configObject.Endpoint ?? configObject.endpoint))
}

function getAuth(configObject: Record<string, unknown>): NormalizedAuth {
  return {
    clientPrivateKey: asString(configObject.client_priv_key ?? configObject.PrivateKey),
    serverPublicKey: asString(configObject.server_pub_key ?? configObject.PublicKey),
    presharedKey: asString(
      configObject.psk_key ?? configObject.PresharedKey ?? configObject.PreSharedKey
    ),
    username: asString(configObject.username ?? configObject.userName)
  }
}

function getProfileName(
  data: Record<string, unknown>,
  endpoint: NormalizedEndpoint | undefined
): string {
  return (
    asString(data.description ?? data.name ?? data.serverName) ??
    (endpoint?.host ? `Amnezia ${endpoint.host}` : 'Amnezia VPN')
  )
}

function collectObfuscation(
  ...configObjects: Array<Record<string, unknown> | undefined>
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {}
  for (const configObject of configObjects) {
    if (!configObject) continue
    for (const key of obfuscationKeys) {
      const value = configObject[key]
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        result[key] = value
      }
    }
  }
  return result
}

function getProtocolVersion(
  protocolConfig: Record<string, unknown> | undefined
): string | undefined {
  return asString(protocolConfig?.protocolVersion ?? protocolConfig?.protocol_version)
}

function formatEndpoint(endpoint: NormalizedEndpoint): string {
  return endpoint.port ? `${endpoint.host}:${endpoint.port}` : endpoint.host
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mapValidationCode(code: string): AmneziaImportErrorCode {
  if (code === 'missing_endpoint') return 'missing_endpoint'
  if (code === 'missing_keys') return 'missing_keys'
  if (code === 'unsupported_protocol') return 'unsupported_payload'
  return 'validation_failed'
}
