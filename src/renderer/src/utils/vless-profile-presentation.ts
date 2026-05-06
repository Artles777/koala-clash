import { VlessParseError } from '../../../shared/lib/vless/types'

type Translate = (key: string, options?: Record<string, string>) => string

export interface VlessProfilePresentation {
  badge: 'VLESS'
  summary: string
}

export function getVlessProfilePresentation(
  profile: Pick<ProfileItem, 'sourceType' | 'name'> | null | undefined
): VlessProfilePresentation | null {
  if (profile?.sourceType !== 'vless_uri') return null

  return {
    badge: 'VLESS',
    summary: profile.name || 'Imported VLESS'
  }
}

export function formatVlessParseErrorMessage(
  error: VlessParseError | undefined,
  translate?: Translate
): string {
  if (!error) {
    return translateMessage(
      translate,
      'profile.vlessErrors.unsupportedUri',
      'Unsupported VLESS URI'
    )
  }

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

  if (/Generated VLESS Mihomo profile failed validation/i.test(message)) {
    const details = message.split(':').slice(1).join(':').trim()
    const fallback = 'Mihomo rejected the generated VLESS profile'
    const prefix = translateMessage(
      translate,
      'profile.vlessErrors.mihomoValidationFailed',
      fallback
    )
    return details ? `${prefix}: ${details}` : prefix
  }

  if (/Unsupported VLESS URI/i.test(message)) {
    return translateMessage(
      translate,
      'profile.vlessErrors.unsupportedUri',
      'Unsupported VLESS URI'
    )
  }

  return message
}

export function formatVlessRuntimeErrorMessage(
  error: unknown,
  profile?: Pick<ProfileItem, 'sourceType'> | null,
  translate?: Translate
): string {
  const message = extractErrorMessage(error)

  if (/Generated VLESS Mihomo profile failed validation|Mihomo.*validation/i.test(message)) {
    return formatVlessImportErrorMessage(message, translate)
  }

  if (profile?.sourceType !== 'vless_uri') return message

  const fallback = 'VLESS profile failed to activate'
  const prefix = translateMessage(
    translate,
    'profile.vlessErrors.runtimeActivationFailed',
    fallback
  )
  return message ? `${prefix}: ${message}` : prefix
}

function parseErrorFallback(error: VlessParseError): string {
  switch (error.code) {
    case 'invalid_uri':
      return 'This VLESS link is invalid'
    case 'invalid_scheme':
      return 'Only vless:// links are supported'
    case 'missing_uuid':
      return 'The VLESS UUID is missing'
    case 'invalid_uuid':
      return 'The VLESS UUID is invalid'
    case 'missing_host':
      return 'The VLESS server host is missing'
    case 'invalid_host':
      return 'The VLESS server host is invalid'
    case 'missing_port':
      return 'The VLESS server port is missing'
    case 'invalid_port':
      return 'The VLESS server port is invalid'
    case 'unsupported_encryption':
      return 'Only VLESS encryption=none is supported'
    case 'unsupported_packet_encoding':
      return 'This VLESS packet encoding is not supported'
    case 'unsupported_security':
      return 'This VLESS security mode is not supported'
    case 'unsupported_transport':
      return 'This VLESS transport is not supported'
    case 'unsupported_transport_param':
    case 'unsupported_security_param':
    case 'unsupported_security_transport':
    case 'unsupported_flow':
    case 'unsupported_xhttp_mode':
    case 'unsupported_insecure_value':
    case 'unsupported_param':
      return 'This VLESS parameter is not supported'
    case 'missing_reality_public_key':
    case 'missing_reality_server_name':
      return 'A required VLESS parameter is missing'
  }
  return error.message || 'This VLESS link is invalid'
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message)
  }
  return String(error)
}

function translateMessage(
  translate: Translate | undefined,
  key: string,
  fallback: string,
  options?: Record<string, string>
): string {
  if (!translate) return fallback
  const translated = translate(key, options)
  return translated === key ? fallback : translated
}
