import {
  VlessFlow,
  VlessPacketEncoding,
  VlessParseError,
  VlessParseErrorCode,
  VlessRealityDraft,
  VlessSecurity,
  VlessTlsDraft,
  VlessTransportDraft,
  VlessTransportType,
  VlessUriParseResult,
  VlessXhttpMode
} from './types'

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const supportedQueryParams = new Set([
  'encryption',
  'security',
  'type',
  'flow',
  'sni',
  'alpn',
  'fp',
  'insecure',
  'host',
  'path',
  'serviceName',
  'authority',
  'pbk',
  'sid',
  'packet-encoding',
  'packetEncoding',
  'packetencoding',
  'mode'
])

const supportedSecurity = new Set<VlessSecurity>(['none', 'tls', 'reality'])
const supportedTransport = new Set<VlessTransportType>([
  'tcp',
  'ws',
  'grpc',
  'httpupgrade',
  'xhttp'
])
const supportedFlow = new Set<VlessFlow>(['xtls-rprx-vision', 'xtls-rprx-vision-udp443'])
const supportedPacketEncoding = new Set<VlessPacketEncoding>(['packetaddr', 'xudp'])
const supportedXhttpMode = new Set<VlessXhttpMode>([
  'auto',
  'stream-one',
  'stream-up',
  'packet-up'
])

const unsupportedTransportAliases = new Set([
  'splithttp',
  'kcp',
  'mkcp',
  'h2',
  'http'
])

const knownUnsupportedParams = new Set([
  'ech',
  'pqv',
  'spx',
  'mldsa65verify',
  'mux',
  'smux',
  'xudp'
])

export function parseVlessUri(input: string): VlessUriParseResult {
  const raw = input.trim()
  const errors: VlessParseError[] = []

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return failure(raw, [
      createError('invalid_uri', 'uri', 'VLESS URI is malformed or cannot be parsed', raw)
    ])
  }

  if (url.protocol !== 'vless:') {
    return failure(raw, [
      createError(
        'invalid_scheme',
        'scheme',
        'VLESS URI must use the vless:// scheme',
        url.protocol
      )
    ])
  }

  const uuid = safeDecode(url.username).trim().toLowerCase()
  if (!uuid) {
    errors.push(createError('missing_uuid', 'uuid', 'VLESS URI is missing a UUID'))
  } else if (!uuidRegex.test(uuid)) {
    errors.push(createError('invalid_uuid', 'uuid', 'VLESS UUID is invalid', uuid))
  }

  const host = url.hostname
  if (!host) {
    errors.push(createError('missing_host', 'server.host', 'VLESS URI is missing a server host'))
  } else if (!isValidHost(host)) {
    errors.push(createError('invalid_host', 'server.host', 'VLESS server host is invalid', host))
  }

  const portText = url.port
  const port = Number(portText)
  if (!portText) {
    errors.push(createError('missing_port', 'server.port', 'VLESS URI is missing a server port'))
  } else if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push(
      createError('invalid_port', 'server.port', 'VLESS server port is invalid', portText)
    )
  }

  const query = url.searchParams
  validateUnknownParams(query, errors)

  const encryption = normalizeToken(getParam(query, 'encryption') || 'none')
  if (encryption !== 'none') {
    errors.push(
      createError(
        'unsupported_encryption',
        'query.encryption',
        'Only VLESS encryption=none is supported in this import step',
        getParam(query, 'encryption')
      )
    )
  }

  const security = normalizeToken(getParam(query, 'security') || 'none') as VlessSecurity
  if (!supportedSecurity.has(security)) {
    errors.push(
      createError(
        'unsupported_security',
        'query.security',
        'Unsupported VLESS security mode',
        getParam(query, 'security')
      )
    )
  }

  const transportText = normalizeToken(getParam(query, 'type') || 'tcp')
  const transportType = transportText as VlessTransportType
  if (!supportedTransport.has(transportType)) {
    errors.push(
      createError(
        'unsupported_transport',
        'query.type',
        unsupportedTransportAliases.has(transportText)
          ? `VLESS transport "${transportText}" is intentionally unsupported in v1`
          : 'Unsupported VLESS transport type',
        getParam(query, 'type')
      )
    )
  }

  const flowText = normalizeToken(getParam(query, 'flow') || '')
  const flow = flowText as VlessFlow
  if (flowText && !supportedFlow.has(flow)) {
    errors.push(createError('unsupported_flow', 'query.flow', 'Unsupported VLESS flow', flowText))
  }

  const packetEncodingText = normalizeToken(getPacketEncodingParam(query))
  const packetEncoding = packetEncodingText as VlessPacketEncoding
  if (packetEncodingText && !supportedPacketEncoding.has(packetEncoding)) {
    errors.push(
      createError(
        'unsupported_packet_encoding',
        'query.packet-encoding',
        'Unsupported VLESS packet encoding',
        packetEncodingText
      )
    )
  }

  const xhttpModeText = normalizeToken(getParam(query, 'mode') || '')
  const xhttpMode = xhttpModeText as VlessXhttpMode
  if (xhttpModeText && !supportedXhttpMode.has(xhttpMode)) {
    errors.push(
      createError(
        'unsupported_xhttp_mode',
        'query.mode',
        'Unsupported VLESS xhttp mode',
        xhttpModeText
      )
    )
  }

  const insecureResult = parseInsecure(query)
  if (insecureResult.error) errors.push(insecureResult.error)

  validateTransportParams(query, transportType, errors)
  validateSecurityParams(query, security, transportType, errors)

  if (errors.length > 0) {
    return failure(raw, errors)
  }

  return {
    ok: true,
    draft: {
      protocol: 'vless',
      raw,
      name: getName(url),
      uuid,
      server: {
        host,
        port
      },
      encryption: 'none',
      packetEncoding: packetEncodingText ? packetEncoding : undefined,
      flow: flowText ? flow : undefined,
      security,
      transport: createTransportDraft(query, transportType),
      tls: security === 'tls' ? createTlsDraft(query, insecureResult.value) : undefined,
      reality: security === 'reality' ? createRealityDraft(query) : undefined
    }
  }
}

function validateUnknownParams(query: URLSearchParams, errors: VlessParseError[]): void {
  for (const key of new Set(query.keys())) {
    if (supportedQueryParams.has(key)) continue

    errors.push(
      createError(
        'unsupported_param',
        `query.${key}`,
        knownUnsupportedParams.has(key.toLowerCase())
          ? `VLESS parameter "${key}" is intentionally unsupported in v1`
          : `Unsupported VLESS parameter "${key}"`,
        query.get(key) ?? undefined
      )
    )
  }
}

function validateTransportParams(
  query: URLSearchParams,
  transportType: VlessTransportType,
  errors: VlessParseError[]
): void {
  const wsParams = ['host', 'path']
  const grpcParams = ['serviceName', 'authority']
  const xhttpParams = ['host', 'path', 'mode']

  if (transportType === 'tcp') {
    addUnsupportedTransportParams([...wsParams, ...grpcParams, 'mode'], query, errors, 'tcp')
    return
  }

  if (transportType === 'ws') {
    addUnsupportedTransportParams([...grpcParams, 'mode'], query, errors, 'ws')
    return
  }

  if (transportType === 'grpc') {
    addUnsupportedTransportParams(xhttpParams, query, errors, 'grpc')
    return
  }

  if (transportType === 'httpupgrade') {
    addUnsupportedTransportParams([...grpcParams, 'mode'], query, errors, 'httpupgrade')
    return
  }

  if (transportType === 'xhttp') {
    addUnsupportedTransportParams(grpcParams, query, errors, 'xhttp')
  }
}

function validateSecurityParams(
  query: URLSearchParams,
  security: VlessSecurity,
  transportType: VlessTransportType,
  errors: VlessParseError[]
): void {
  if (security === 'none') {
    addUnsupportedSecurityParams(
      ['sni', 'alpn', 'fp', 'insecure', 'pbk', 'sid'],
      query,
      errors,
      'security=none'
    )
    return
  }

  if (security === 'tls') {
    addUnsupportedSecurityParams(['pbk', 'sid'], query, errors, 'security=tls')
    return
  }

  if (security === 'reality') {
    if (transportType === 'ws' || transportType === 'httpupgrade') {
      errors.push(
        createError(
          'unsupported_security_transport',
          'query.type',
          'REALITY is only supported with tcp, grpc, or xhttp transport in this import step',
          transportType
        )
      )
    }
    if (!getParam(query, 'pbk')) {
      errors.push(
        createError(
          'missing_reality_public_key',
          'query.pbk',
          'REALITY VLESS URI is missing required pbk public key'
        )
      )
    }
    if (!getParam(query, 'sni')) {
      errors.push(
        createError(
          'missing_reality_server_name',
          'query.sni',
          'REALITY VLESS URI is missing required sni server name'
        )
      )
    }
    addUnsupportedSecurityParams(['alpn', 'insecure'], query, errors, 'security=reality')
  }
}

function addUnsupportedTransportParams(
  params: string[],
  query: URLSearchParams,
  errors: VlessParseError[],
  transportType: string
): void {
  for (const param of params) {
    if (!query.has(param)) continue
    errors.push(
      createError(
        'unsupported_transport_param',
        `query.${param}`,
        `Parameter "${param}" is not supported with VLESS transport ${transportType}`,
        getParam(query, param)
      )
    )
  }
}

function addUnsupportedSecurityParams(
  params: string[],
  query: URLSearchParams,
  errors: VlessParseError[],
  securityMode: string
): void {
  for (const param of params) {
    if (!query.has(param)) continue
    errors.push(
      createError(
        'unsupported_security_param',
        `query.${param}`,
        `Parameter "${param}" is not supported with VLESS ${securityMode}`,
        getParam(query, param)
      )
    )
  }
}

function createTransportDraft(
  query: URLSearchParams,
  transportType: VlessTransportType
): VlessTransportDraft {
  if (transportType === 'ws') {
    return {
      type: 'ws',
      path: getParam(query, 'path') || undefined,
      host: getParam(query, 'host') || undefined
    }
  }

  if (transportType === 'grpc') {
    return {
      type: 'grpc',
      serviceName: getParam(query, 'serviceName') || undefined,
      authority: getParam(query, 'authority') || undefined
    }
  }

  if (transportType === 'httpupgrade') {
    return {
      type: 'httpupgrade',
      path: getParam(query, 'path') || undefined,
      host: getParam(query, 'host') || undefined
    }
  }

  if (transportType === 'xhttp') {
    const mode = normalizeToken(getParam(query, 'mode') || '') as VlessXhttpMode
    return {
      type: 'xhttp',
      path: getParam(query, 'path') || undefined,
      host: getParam(query, 'host') || undefined,
      mode: mode || undefined
    }
  }

  return { type: 'tcp' }
}

function createTlsDraft(query: URLSearchParams, insecure?: boolean): VlessTlsDraft {
  return {
    serverName: getParam(query, 'sni') || undefined,
    alpn: parseAlpn(getParam(query, 'alpn')),
    fingerprint: getParam(query, 'fp') || undefined,
    insecure
  }
}

function createRealityDraft(query: URLSearchParams): VlessRealityDraft {
  return {
    serverName: getParam(query, 'sni'),
    publicKey: getParam(query, 'pbk'),
    shortId: getParam(query, 'sid') || undefined,
    fingerprint: getParam(query, 'fp') || undefined
  }
}

function parseInsecure(query: URLSearchParams): { value?: boolean; error?: VlessParseError } {
  if (!query.has('insecure')) return {}

  const value = normalizeToken(getParam(query, 'insecure'))
  if (value === '1' || value === 'true') return { value: true }
  if (value === '0' || value === 'false') return { value: false }

  return {
    error: createError(
      'unsupported_insecure_value',
      'query.insecure',
      'VLESS insecure must be 1, 0, true, or false',
      getParam(query, 'insecure')
    )
  }
}

function parseAlpn(value: string): string[] | undefined {
  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return items.length > 0 ? items : undefined
}

function getParam(query: URLSearchParams, key: string): string {
  return (query.get(key) ?? '').trim()
}

function getPacketEncodingParam(query: URLSearchParams): string {
  return (
    getParam(query, 'packet-encoding') ||
    getParam(query, 'packetEncoding') ||
    getParam(query, 'packetencoding')
  )
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase()
}

function getName(url: URL): string | undefined {
  if (!url.hash) return undefined
  const name = safeDecode(url.hash.slice(1)).trim()
  return name || undefined
}

function isValidHost(host: string): boolean {
  if (!host || host.length > 253) return false
  if (/[\s/?#@_]/.test(host)) return false
  if (host.startsWith('.') || host.endsWith('.') || host.includes('..')) return false
  return true
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function failure(raw: string, errors: VlessParseError[]): VlessUriParseResult {
  return {
    ok: false,
    raw,
    errors
  }
}

function createError(
  code: VlessParseErrorCode,
  path: string,
  message: string,
  value?: string
): VlessParseError {
  return {
    code,
    path,
    message,
    value
  }
}
