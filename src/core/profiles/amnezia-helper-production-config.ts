import { AmneziaHelperRuntimeConfig } from './amnezia-helper-runtime-config'
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

export interface AmneziaProductionBackendConfig {
  schemaVersion: 1
  kind: 'koala-amnezia-helper-production-config'
  profile: {
    id: string
    sourceId: string
    name: string
    protocol: Extract<NormalizedProfileProtocol, 'wireguard' | 'amneziawg'>
  }
  execution: {
    mode: 'proxy'
    localProxy: {
      host: string
      port: number
      protocol: 'socks5'
    }
    generatedAt: number
    readiness: {
      type: 'tcp-listen'
      timeoutMs: number
    }
  }
  remote: {
    host: string
    port: number
    transport: 'udp' | 'tcp' | 'unknown'
    mtu?: number
  }
  wireGuard: {
    interface: {
      privateKey: string
      addresses: string[]
      dns: string[]
      mtu?: number
    }
    peer: {
      publicKey: string
      endpoint: string
      allowedIps: string[]
      presharedKey?: string
      persistentKeepalive?: number
    }
  }
  amnezia: {
    defaultContainer?: string
    container?: string
    protocolVersion?: string
    obfuscation: Record<string, string | number | boolean>
  }
  diagnostics: {
    generatedBy: 'koala-clash'
    generatedAt: number
    warnings: string[]
  }
  metadata: {
    importedAt: number
    decodedFormat: string
    sourceType: 'amnezia_vpn_uri'
    warnings: string[]
  }
}

export class AmneziaProductionBackendConfigError extends Error {
  readonly issues: AmneziaProductionBackendConfigIssue[]

  constructor(issues: AmneziaProductionBackendConfigIssue[]) {
    super(`Production Amnezia helper config generation failed: ${issues[0]?.message}`)
    this.name = 'AmneziaProductionBackendConfigError'
    this.issues = issues
  }
}

const productionSupportedProtocols = new Set<NormalizedProfileProtocol>(['wireguard', 'amneziawg'])

export function createAmneziaProductionBackendConfig(
  config: AmneziaHelperRuntimeConfig
): AmneziaProductionBackendConfig {
  const issues = validateAmneziaProductionBackendConfig(config)
  if (issues.length > 0) {
    throw new AmneziaProductionBackendConfigError(issues)
  }

  const peerPublicKey = config.peer.publicKey ?? config.auth.serverPublicKey
  if (!peerPublicKey || !config.auth.clientPrivateKey) {
    throw new AmneziaProductionBackendConfigError([
      {
        code: 'missing_keys',
        path: 'auth',
        message: 'WireGuard key material is incomplete'
      }
    ])
  }

  const endpoint = `${config.remote.host}:${config.remote.port}`
  const warnings = [
    ...config.metadata.warnings,
    ...(config.protocol === 'wireguard' && Object.keys(config.amnezia.obfuscation).length > 0
      ? ['wireguard_profile_contains_amnezia_obfuscation_fields']
      : [])
  ]

  return {
    schemaVersion: 1,
    kind: 'koala-amnezia-helper-production-config',
    profile: {
      id: config.profileId,
      sourceId: config.sourceId,
      name: config.name,
      protocol: config.protocol as Extract<NormalizedProfileProtocol, 'wireguard' | 'amneziawg'>
    },
    execution: {
      mode: 'proxy',
      localProxy: {
        host: config.localProxy.host,
        port: config.localProxy.port,
        protocol: config.localProxy.protocol
      },
      generatedAt: config.execution.generatedAt,
      readiness: {
        type: 'tcp-listen',
        timeoutMs: config.execution.readiness.timeoutMs
      }
    },
    remote: {
      host: config.remote.host,
      port: config.remote.port,
      transport: config.remote.transport.type,
      mtu: config.remote.transport.mtu
    },
    wireGuard: {
      interface: {
        privateKey: config.auth.clientPrivateKey,
        addresses: [...config.interface.addresses],
        dns: [...config.interface.dns],
        mtu: config.interface.mtu ?? config.remote.transport.mtu
      },
      peer: {
        publicKey: peerPublicKey,
        endpoint,
        allowedIps: [...config.peer.allowedIps],
        presharedKey: config.auth.presharedKey,
        persistentKeepalive: config.peer.persistentKeepalive
      }
    },
    amnezia: {
      defaultContainer: config.amnezia.defaultContainer,
      container: config.amnezia.container,
      protocolVersion: config.amnezia.protocolVersion,
      obfuscation: { ...config.amnezia.obfuscation }
    },
    diagnostics: {
      generatedBy: 'koala-clash',
      generatedAt: config.execution.generatedAt,
      warnings
    },
    metadata: {
      importedAt: config.metadata.importedAt,
      decodedFormat: config.metadata.decodedFormat,
      sourceType: config.metadata.sourceType,
      warnings: [...config.metadata.warnings]
    }
  }
}

export function validateAmneziaProductionBackendConfig(
  config: AmneziaHelperRuntimeConfig
): AmneziaProductionBackendConfigIssue[] {
  const issues: AmneziaProductionBackendConfigIssue[] = []

  if (!productionSupportedProtocols.has(config.protocol)) {
    issues.push({
      code: 'unsupported_protocol',
      path: 'protocol',
      message: `Production Amnezia helper does not support protocol: ${config.protocol}`
    })
  }

  if (!config.remote.host || !Number.isInteger(config.remote.port) || config.remote.port <= 0) {
    issues.push({
      code: 'missing_endpoint',
      path: 'remote',
      message: 'Production Amnezia helper requires a remote server host and port'
    })
  }

  if (!config.auth.clientPrivateKey || !(config.peer.publicKey ?? config.auth.serverPublicKey)) {
    issues.push({
      code: 'missing_keys',
      path: 'auth',
      message: 'Production Amnezia helper requires client and peer public keys'
    })
  }

  if (config.interface.addresses.length === 0) {
    issues.push({
      code: 'missing_interface_address',
      path: 'interface.addresses',
      message: 'Production Amnezia helper requires at least one interface address'
    })
  }

  if (config.peer.allowedIps.length === 0) {
    issues.push({
      code: 'missing_allowed_ips',
      path: 'peer.allowedIps',
      message: 'Production Amnezia helper requires at least one allowed IP range'
    })
  }

  if (
    !config.localProxy.host ||
    config.localProxy.protocol !== 'socks5' ||
    !Number.isInteger(config.localProxy.port) ||
    config.localProxy.port <= 0 ||
    config.localProxy.port > 65535
  ) {
    issues.push({
      code: 'invalid_local_proxy',
      path: 'localProxy',
      message: 'Production Amnezia helper requires a concrete local socks5 proxy endpoint'
    })
  }

  return issues
}
