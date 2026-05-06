export type ProfileImportInputKind = 'remote_url' | 'amnezia_key' | 'vless_uri' | 'invalid'

export type ProfileImportInvalidReason = 'empty' | 'unsupported_format'

export interface ProfileImportInputClassification {
  kind: ProfileImportInputKind
  value: string
  reason?: ProfileImportInvalidReason
}

export interface ProfileImportSubmitHandlers {
  importRemoteUrl: (url: string) => Promise<void>
  importVlessUri: (raw: string) => Promise<void>
  importAmneziaKey?: (raw: string) => Promise<void>
}

export function isSupportedRemoteProfileUrl(input: string): boolean {
  const value = input.trim()
  if (!/^https?:\/\//i.test(value)) return false

  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && !!url.hostname
  } catch {
    return false
  }
}

export function classifyProfileImportInput(input: string): ProfileImportInputClassification {
  const value = input.trim()

  if (!value) {
    return { kind: 'invalid', value, reason: 'empty' }
  }

  const lowerValue = value.toLowerCase()

  if (lowerValue.startsWith('vpn://')) {
    return { kind: 'amnezia_key', value }
  }

  if (lowerValue.startsWith('vless://')) {
    return { kind: 'vless_uri', value }
  }

  if (isSupportedRemoteProfileUrl(value)) {
    return { kind: 'remote_url', value }
  }

  return { kind: 'invalid', value, reason: 'unsupported_format' }
}

export async function submitProfileImportInput(
  input: string,
  handlers: ProfileImportSubmitHandlers
): Promise<ProfileImportInputClassification> {
  const classification = classifyProfileImportInput(input)

  if (classification.kind === 'remote_url') {
    await handlers.importRemoteUrl(classification.value)
    return classification
  }

  if (classification.kind === 'vless_uri') {
    await handlers.importVlessUri(classification.value)
    return classification
  }

  if (classification.kind === 'amnezia_key' && handlers.importAmneziaKey) {
    await handlers.importAmneziaKey(classification.value)
    return classification
  }

  throw new Error('Unsupported profile import input. Use http(s)://, vless://, or vpn://.')
}
