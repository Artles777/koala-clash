import {
  NormalizedProfile,
  NormalizedProfileProtocol,
  validateNormalizedProfile
} from './normalized-profile'

export type AmneziaHelperBackendMode = 'production' | 'proxy-prototype' | 'stub'
export type AmneziaHelperProxyProtocol = 'socks5'
export type AmneziaHelperExecutionMode = 'proxy'

export interface AmneziaHelperLocalEndpoint {
  host: string
  port: number
  protocol: AmneziaHelperProxyProtocol
}

export interface AmneziaHelperRuntimeConfigIssue {
  code:
    | 'missing_endpoint'
    | 'missing_keys'
    | 'unsupported_protocol'
    | 'missing_local_proxy'
    | 'invalid_local_proxy_port'
    | 'invalid_local_proxy_host'
  path: string
  message: string
}

export interface AmneziaHelperRuntimeConfig {
  schemaVersion: 1
  profileId: string
  sourceId: string
  name: string
  protocol: NormalizedProfileProtocol
  remote: {
    host: string
    port: number
    transport: NormalizedProfile['transport']
  }
  auth: NormalizedProfile['auth']
  interface: NormalizedProfile['interface']
  peer: NormalizedProfile['peer']
  amnezia: NormalizedProfile['amnezia']
  localProxy: AmneziaHelperLocalEndpoint
  execution: {
    mode: AmneziaHelperExecutionMode
    backendMode: AmneziaHelperBackendMode
    generatedAt: number
    readiness: {
      type: 'tcp-listen'
      timeoutMs: number
    }
  }
  metadata: NormalizedProfile['metadata']
}

export interface CreateAmneziaHelperRuntimeConfigOptions {
  backendMode?: AmneziaHelperBackendMode
  localProxy?: Partial<AmneziaHelperLocalEndpoint>
  generatedAt?: number
  readinessTimeoutMs?: number
  allowEphemeralPort?: boolean
}

const helperSupportedProtocols = new Set<NormalizedProfileProtocol>(['wireguard', 'amneziawg'])

export function createAmneziaHelperRuntimeConfig(
  profile: NormalizedProfile,
  options: CreateAmneziaHelperRuntimeConfigOptions = {}
): AmneziaHelperRuntimeConfig {
  const issues = validateAmneziaHelperRuntimeConfigInput(profile, options)
  if (issues.length > 0) {
    throw new Error(`Amnezia helper config generation failed: ${issues[0].message}`)
  }

  const endpoint = profile.transport.endpoint
  if (!endpoint?.host || !endpoint.port) {
    throw new Error('Amnezia helper config generation failed: endpoint is incomplete')
  }

  return {
    schemaVersion: 1,
    profileId: profile.id,
    sourceId: profile.sourceId,
    name: profile.name,
    protocol: profile.protocol,
    remote: {
      host: endpoint.host,
      port: endpoint.port,
      transport: profile.transport
    },
    auth: profile.auth,
    interface: profile.interface,
    peer: profile.peer,
    amnezia: profile.amnezia,
    localProxy: {
      host: options.localProxy?.host ?? '127.0.0.1',
      port: options.localProxy?.port ?? 0,
      protocol: options.localProxy?.protocol ?? 'socks5'
    },
    execution: {
      mode: 'proxy',
      backendMode: options.backendMode ?? 'proxy-prototype',
      generatedAt: options.generatedAt ?? Date.now(),
      readiness: {
        type: 'tcp-listen',
        timeoutMs: options.readinessTimeoutMs ?? 5000
      }
    },
    metadata: profile.metadata
  }
}

export function validateAmneziaHelperRuntimeConfigInput(
  profile: NormalizedProfile,
  options: CreateAmneziaHelperRuntimeConfigOptions = {}
): AmneziaHelperRuntimeConfigIssue[] {
  const issues: AmneziaHelperRuntimeConfigIssue[] = []

  for (const issue of validateNormalizedProfile(profile)) {
    if (issue.code === 'missing_endpoint') {
      issues.push({
        code: 'missing_endpoint',
        path: issue.path,
        message: issue.message
      })
    } else if (issue.code === 'missing_keys') {
      issues.push({
        code: 'missing_keys',
        path: issue.path,
        message: issue.message
      })
    } else if (issue.code === 'unsupported_protocol') {
      issues.push({
        code: 'unsupported_protocol',
        path: issue.path,
        message: issue.message
      })
    }
  }

  if (!helperSupportedProtocols.has(profile.protocol)) {
    issues.push({
      code: 'unsupported_protocol',
      path: 'protocol',
      message: `Helper proxy mode does not support protocol: ${profile.protocol}`
    })
  }

  const localProxy = {
    host: options.localProxy?.host ?? '127.0.0.1',
    port: options.localProxy?.port ?? 0
  }

  if (!localProxy.host) {
    issues.push({
      code: 'invalid_local_proxy_host',
      path: 'localProxy.host',
      message: 'Local proxy host is required'
    })
  }

  const allowEphemeralPort = options.allowEphemeralPort ?? true
  const minPort = allowEphemeralPort ? 0 : 1
  if (!Number.isInteger(localProxy.port) || localProxy.port < minPort || localProxy.port > 65535) {
    issues.push({
      code: 'invalid_local_proxy_port',
      path: 'localProxy.port',
      message: allowEphemeralPort
        ? 'Local proxy port must be between 0 and 65535'
        : 'Local proxy port must be between 1 and 65535'
    })
  }

  return issues
}

export function withLocalProxyEndpoint(
  config: AmneziaHelperRuntimeConfig,
  endpoint: AmneziaHelperLocalEndpoint
): AmneziaHelperRuntimeConfig {
  return {
    ...config,
    localProxy: endpoint
  }
}
