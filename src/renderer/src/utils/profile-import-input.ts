export type ProfileImportInputKind = 'remote_url' | 'amnezia_key' | 'invalid'

export type ProfileImportInvalidReason = 'empty' | 'unsupported_format'

export interface ProfileImportInputClassification {
  kind: ProfileImportInputKind
  value: string
  reason?: ProfileImportInvalidReason
}

export interface ProfileImportSubmitHandlers {
  importRemoteUrl: (url: string) => Promise<void>
  importAmneziaKey: (raw: string) => Promise<void>
}

export function classifyProfileImportInput(input: string): ProfileImportInputClassification {
  const value = input.trim()

  if (!value) {
    return { kind: 'invalid', value, reason: 'empty' }
  }

  if (value.toLowerCase().startsWith('vpn://')) {
    return { kind: 'amnezia_key', value }
  }

  try {
    const url = new URL(value)
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return { kind: 'remote_url', value }
    }
  } catch {
    // fall through to unsupported format
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

  if (classification.kind === 'amnezia_key') {
    await handlers.importAmneziaKey(classification.value)
    return classification
  }

  throw new Error('Unsupported profile import input')
}
