type Translate = (key: string, options?: Record<string, string>) => string

export function formatAmneziaImportErrorMessage(error: unknown, translate?: Translate): string {
  const message = extractErrorMessage(error)

  if (/This profile already exists|already exists|duplicate/i.test(message)) {
    return translateMessage(
      translate,
      'profile.amneziaErrors.duplicateImport',
      'This Amnezia profile has already been imported'
    )
  }

  if (/not valid base64url|payload is empty|malformed/i.test(message)) {
    return translateMessage(
      translate,
      'profile.amneziaErrors.malformedInput',
      'This vpn:// key is malformed'
    )
  }

  if (/Failed to decode/i.test(message)) {
    return translateMessage(
      translate,
      'profile.amneziaErrors.decodeFailed',
      'Could not decode this vpn:// key'
    )
  }

  if (/Mihomo rejected the generated Amnezia WireGuard profile|failed validation/i.test(message)) {
    const details = message.split(':').slice(1).join(':').trim()
    const prefix = translateMessage(
      translate,
      'profile.amneziaErrors.mihomoValidationFailed',
      'Mihomo rejected the generated Amnezia WireGuard profile'
    )
    return details ? `${prefix}: ${details}` : prefix
  }

  if (/missing_endpoint|missing_endpoint_port|endpoint host|endpoint/i.test(message)) {
    return translateMessage(
      translate,
      'profile.amneziaErrors.missingEndpoint',
      'This profile is missing the WireGuard endpoint host or port'
    )
  }

  if (/missing_private_key|missing_public_key|missing_keys|required keys/i.test(message)) {
    return translateMessage(
      translate,
      'profile.amneziaErrors.missingKeys',
      'This profile is missing required WireGuard keys'
    )
  }

  if (/missing_interface_address|missing_allowed_ips/i.test(message)) {
    return translateMessage(
      translate,
      'profile.amneziaErrors.missingRuntimeFields',
      'This profile is missing local address or allowed IPs'
    )
  }

  if (/missing_amnezia_wg_option|invalid_amnezia_wg_option/i.test(message)) {
    return translateMessage(
      translate,
      'profile.amneziaErrors.invalidAwgOptions',
      'This AmneziaWG profile is missing valid amnezia-wg-option fields'
    )
  }

  if (
    /not a supported self-contained WireGuard profile|Unsupported Amnezia vpn:\/\/ profile/i.test(
      message
    )
  ) {
    return translateMessage(
      translate,
      'profile.amneziaErrors.unsupportedSelfContained',
      'Only self-contained AmneziaWG/WireGuard vpn:// profiles are supported'
    )
  }

  if (/Decoded Amnezia payload is not text|Unsupported decoded payload|unsupported_payload/i.test(message)) {
    return translateMessage(
      translate,
      'profile.amneziaErrors.unsupportedPayload',
      'This vpn:// payload is not a supported self-contained AmneziaWG/WireGuard profile'
    )
  }

  return message
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
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
  return translated && translated !== key ? translated : fallback
}
