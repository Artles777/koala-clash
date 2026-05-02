import {
  createVlessProfileMetadata,
  formatVlessProfileSummary,
  VlessProfileMetadata
} from '../../../shared/lib/vless/profile-metadata'
import { VlessDraft, VlessParseError, VlessParseErrorCode } from '../../../shared/lib/vless/types'

type Translate = (key: string, options?: Record<string, string>) => string

export interface VlessProfilePresentation {
  badge: 'VLESS'
  summary: string
  metadata: VlessProfileMetadata
}

export interface VlessProfileDetailRow {
  label: string
  value: string
}

export function getVlessProfilePresentation(
  profile: Pick<ProfileItem, 'sourceType' | 'source'> | null | undefined
): VlessProfilePresentation | null {
  if (profile?.sourceType !== 'vless_uri' || !isVlessProfileMetadata(profile.source?.vless)) {
    return null
  }
  return createVlessPresentation(profile.source.vless)
}

export function getVlessDraftPresentation(draft: VlessDraft): VlessProfilePresentation {
  return createVlessPresentation(createVlessProfileMetadata(draft))
}

export function getVlessProfileDetails(
  profile: Pick<ProfileItem, 'sourceType' | 'source'> | null | undefined,
  translate?: Translate
): VlessProfileDetailRow[] {
  const presentation = getVlessProfilePresentation(profile)
  if (!presentation) return []

  return createVlessDetailRows(presentation.metadata, translate)
}

export function getVlessTroubleshootingHints(
  profile: Pick<ProfileItem, 'sourceType' | 'source'> | null | undefined,
  translate?: Translate
): string[] {
  const presentation = getVlessProfilePresentation(profile)
  if (!presentation) return []

  const { metadata } = presentation
  const hints: string[] = []

  if (metadata.security === 'reality') {
    hints.push(
      translateMessage(
        translate,
        'profile.vlessTroubleshooting.reality',
        'If runtime activation fails, check REALITY SNI, public key, short ID, and fingerprint on the server.'
      )
    )
  }

  if (metadata.security === 'tls') {
    hints.push(
      translateMessage(
        translate,
        'profile.vlessTroubleshooting.tls',
        'TLS failures usually point to certificate, SNI, or server-name mismatch.'
      )
    )
  }

  if (metadata.transport === 'httpupgrade' || metadata.transport === 'xhttp') {
    hints.push(
      translateMessage(
        translate,
        'profile.vlessTroubleshooting.httpTransport',
        'For HTTP Upgrade or xHTTP, verify that the server uses the same path and host settings.'
      )
    )
  }

  if (metadata.transport === 'ws' || metadata.transport === 'grpc') {
    hints.push(
      translateMessage(
        translate,
        'profile.vlessTroubleshooting.transport',
        'If the profile validates but cannot connect, verify that the server transport settings match this import.'
      )
    )
  }

  if (metadata.packetEncoding) {
    hints.push(
      translateMessage(
        translate,
        'profile.vlessTroubleshooting.packetEncoding',
        'If UDP is unreliable, the server may not accept this packet encoding.'
      )
    )
  }

  return hints
}

export function formatVlessParseErrorMessage(
  error: VlessParseError | undefined,
  translate?: Translate
): string {
  if (!error) return translateMessage(translate, 'profile.vlessErrors.unsupportedUri', 'Unsupported VLESS URI')

  const fallback = parseErrorFallback(error)
  return translateMessage(translate, `profile.vlessErrors.${error.code}`, fallback, {
    value: error.value ?? '',
    path: error.path
  })
}

export function formatVlessImportErrorMessage(error: unknown, translate?: Translate): string {
  const message = extractErrorMessage(error)

  if (/already been imported/i.test(message)) {
    return translateMessage(
      translate,
      'profile.vlessErrors.duplicateImport',
      'This VLESS link has already been imported'
    )
  }

  if (/VLESS profile not found/i.test(message)) {
    return translateMessage(translate, 'profile.vlessErrors.profileNotFound', 'VLESS profile not found')
  }

  if (/not imported from VLESS/i.test(message)) {
    return translateMessage(
      translate,
      'profile.vlessErrors.notVlessProfile',
      'This profile was not imported from VLESS'
    )
  }

  if (/VLESS profile YAML is missing/i.test(message)) {
    return translateMessage(
      translate,
      'profile.vlessErrors.missingProfileYaml',
      'VLESS profile YAML is missing'
    )
  }

  if (/Generated VLESS Mihomo profile failed validation/i.test(message)) {
    const details = message.split(':').slice(1).join(':').trim()
    const fallback = 'Mihomo rejected the generated VLESS profile'
    if (!details) return translateMessage(translate, 'profile.vlessErrors.mihomoValidationFailed', fallback)
    return `${translateMessage(translate, 'profile.vlessErrors.mihomoValidationFailed', fallback)}: ${details}`
  }

  if (/Unsupported VLESS URI/i.test(message)) {
    return translateMessage(translate, 'profile.vlessErrors.unsupportedUri', 'Unsupported VLESS URI')
  }

  return message
}

export function formatVlessRuntimeErrorMessage(
  error: unknown,
  profile?: Pick<ProfileItem, 'sourceType' | 'source'> | null,
  translate?: Translate
): string {
  const message = extractErrorMessage(error)
  const presentation = getVlessProfilePresentation(profile)

  if (/Generated VLESS Mihomo profile failed validation|Mihomo.*validation/i.test(message)) {
    return formatVlessImportErrorMessage(message, translate)
  }

  if (!presentation) return message

  const details = message ? `: ${message}` : ''

  if (/reality|public[- ]key|short[- ]id|fingerprint|utls/i.test(message)) {
    return `${translateMessage(
      translate,
      'profile.vlessErrors.runtimeRealityHint',
      'VLESS REALITY runtime failure. Check SNI, public key, short ID, and fingerprint.'
    )}${details}`
  }

  if (/tls|certificate|x509|servername|server name|sni|handshake/i.test(message)) {
    return `${translateMessage(
      translate,
      'profile.vlessErrors.runtimeTlsHint',
      'VLESS TLS runtime failure. Check certificate, SNI, and server-name settings.'
    )}${details}`
  }

  if (/xhttp|httpupgrade|websocket|grpc|upgrade|path|host|404|400|403/i.test(message)) {
    return `${translateMessage(
      translate,
      'profile.vlessErrors.runtimeTransportHint',
      'VLESS transport runtime failure. Check transport, path, and host settings.'
    )}${details}`
  }

  if (/packet|xudp|udp/i.test(message)) {
    return `${translateMessage(
      translate,
      'profile.vlessErrors.runtimePacketEncodingHint',
      'VLESS packet encoding may not be accepted by the server.'
    )}${details}`
  }

  return `${translateMessage(
    translate,
    'profile.vlessErrors.runtimeActivationFailed',
    'VLESS profile failed to activate'
  )}${details}`
}

function createVlessPresentation(metadata: VlessProfileMetadata): VlessProfilePresentation {
  return {
    badge: 'VLESS',
    summary: formatVlessProfileSummary(metadata),
    metadata
  }
}

function createVlessDetailRows(
  metadata: VlessProfileMetadata,
  translate?: Translate
): VlessProfileDetailRow[] {
  const rows: VlessProfileDetailRow[] = [
    {
      label: translateMessage(translate, 'profile.vlessDetails.source', 'Source'),
      value: translateMessage(translate, 'profile.vlessDetails.importedVless', 'Imported VLESS')
    },
    {
      label: translateMessage(translate, 'profile.vlessDetails.server', 'Server'),
      value: `${metadata.host}:${metadata.port}`
    },
    {
      label: translateMessage(translate, 'profile.vlessDetails.transport', 'Transport'),
      value: formatTransport(metadata.transport)
    },
    {
      label: translateMessage(translate, 'profile.vlessDetails.security', 'Security'),
      value: formatSecurity(metadata.security)
    }
  ]

  if (metadata.serverName) {
    rows.push({
      label: translateMessage(translate, 'profile.vlessDetails.serverName', 'SNI / server name'),
      value: metadata.serverName
    })
  }

  if (metadata.flow) {
    rows.push({
      label: translateMessage(translate, 'profile.vlessDetails.flow', 'Flow'),
      value: metadata.flow
    })
  }

  if (metadata.packetEncoding) {
    rows.push({
      label: translateMessage(translate, 'profile.vlessDetails.packetEncoding', 'Packet encoding'),
      value: metadata.packetEncoding
    })
  }

  return rows
}

function isVlessProfileMetadata(value: unknown): value is VlessProfileMetadata {
  if (!value || typeof value !== 'object') return false

  const metadata = value as Partial<VlessProfileMetadata>
  return (
    typeof metadata.host === 'string' &&
    metadata.host.length > 0 &&
    typeof metadata.port === 'number' &&
    Number.isInteger(metadata.port) &&
    metadata.port > 0 &&
    metadata.port <= 65535 &&
    (metadata.transport === 'tcp' ||
      metadata.transport === 'ws' ||
      metadata.transport === 'grpc' ||
      metadata.transport === 'httpupgrade' ||
      metadata.transport === 'xhttp') &&
    (metadata.security === 'none' || metadata.security === 'tls' || metadata.security === 'reality')
  )
}

function formatTransport(transport: VlessProfileMetadata['transport']): string {
  if (transport === 'httpupgrade') return 'HTTP Upgrade'
  if (transport === 'xhttp') return 'xHTTP'
  if (transport === 'grpc') return 'gRPC'
  if (transport === 'ws') return 'WebSocket'
  return 'TCP'
}

function formatSecurity(security: VlessProfileMetadata['security']): string {
  if (security === 'tls') return 'TLS'
  if (security === 'reality') return 'REALITY'
  return 'None'
}


function translateMessage(
  translate: Translate | undefined,
  key: string,
  fallback: string,
  options?: Record<string, string>
): string {
  if (!translate) return fallback

  const translated = translate(key, options)
  return translated && translated !== key ? translated : fallback
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return String(error)
}

function parseErrorFallback(error: VlessParseError): string {
  const fallback = parseErrorFallbacks[error.code]
  return fallback ? fallback(error) : error.message
}

const parseErrorFallbacks: Partial<Record<VlessParseErrorCode, (error: VlessParseError) => string>> = {
  invalid_uri: () => 'The VLESS link is malformed',
  invalid_scheme: () => 'The link must start with vless://',
  missing_uuid: () => 'The VLESS link is missing a UUID',
  invalid_uuid: () => 'The VLESS UUID is invalid',
  missing_host: () => 'The VLESS link is missing a server host',
  invalid_host: () => 'The VLESS server host is invalid',
  missing_port: () => 'The VLESS link is missing a server port',
  invalid_port: () => 'The VLESS server port is invalid',
  unsupported_encryption: () => 'Only VLESS encryption=none is supported',
  unsupported_packet_encoding: (error) =>
    `Unsupported VLESS packet encoding${error.value ? `: ${error.value}` : ''}`,
  unsupported_security: (error) => `Unsupported VLESS security mode${error.value ? `: ${error.value}` : ''}`,
  unsupported_transport: (error) => `Unsupported VLESS transport${error.value ? `: ${error.value}` : ''}`,
  unsupported_transport_param: (error) => `Unsupported transport parameter: ${error.path}`,
  unsupported_security_param: (error) => `Unsupported security parameter: ${error.path}`,
  unsupported_security_transport: () => 'REALITY is supported only with tcp, grpc, or xhttp transport',
  unsupported_flow: (error) => `Unsupported VLESS flow${error.value ? `: ${error.value}` : ''}`,
  unsupported_xhttp_mode: (error) => `Unsupported VLESS xhttp mode${error.value ? `: ${error.value}` : ''}`,
  unsupported_insecure_value: () => 'VLESS insecure must be 1, 0, true, or false',
  unsupported_param: (error) => `Unsupported VLESS parameter: ${error.path}`,
  missing_reality_public_key: () => 'REALITY VLESS requires pbk public key',
  missing_reality_server_name: () => 'REALITY VLESS requires sni server name'
}
