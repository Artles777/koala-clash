import { parseVlessUri } from '../../../shared/lib/vless/parser'
import { VlessUriParseResult } from '../../../shared/lib/vless/types'

export type ProfileImportInputKind = 'remote_url' | 'amnezia_key' | 'vless_uri' | 'invalid'

export type ProfileImportInvalidReason = 'empty' | 'unsupported_format'

export interface ProfileImportInputClassification {
  kind: ProfileImportInputKind
  value: string
  reason?: ProfileImportInvalidReason
  vless?: VlessUriParseResult
}

export interface ProfileImportSubmitHandlers {
  importRemoteUrl: (url: string) => Promise<void>
  importVlessUri: (raw: string) => Promise<void>
  importAmneziaKey?: (raw: string) => Promise<void>
}

/**
 * Проверяет, является ли строка поддерживаемым URL для профиля.
 * Поддерживаются http(s) протоколы с корректным hostname.
 */
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

/**
 * Классифицирует введённую строку:
 * - "vpn://" → ключ Amnezia;
 * - "vless://" → VLESS‑URI;
 * - http/https → удалённая подписка;
 * - пустая строка или иное → invalid.
 */
export function classifyProfileImportInput(input: string): ProfileImportInputClassification {
  const value = input.trim()

  if (!value) {
    return { kind: 'invalid', value, reason: 'empty' }
  }

  const lowerValue = value.toLowerCase()

  // Amnezia‑ключ
  if (lowerValue.startsWith('vpn://')) {
    return { kind: 'amnezia_key', value }
  }

  // VLESS‑URI
  if (lowerValue.startsWith('vless://')) {
    return {
      kind: 'vless_uri',
      value,
      vless: parseVlessUri(value)
    }
  }

  // HTTP/HTTPS подписка
  if (isSupportedRemoteProfileUrl(value)) {
    return { kind: 'remote_url', value }
  }

  return { kind: 'invalid', value, reason: 'unsupported_format' }
}

/**
 * Обработчик импорта профиля. В зависимости от классификации вызывает
 * соответствующий callback (importRemoteUrl, importVlessUri, importAmneziaKey).
 * Генерирует ошибку, если ввод неподдерживаем.
 */
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
    // проверяем валидность VLESS‑URI
    if (classification.vless?.ok === false) {
      throw new Error(classification.vless.errors[0]?.message || 'Unsupported VLESS URI')
    }
    await handlers.importVlessUri(classification.value)
    return classification
  }

  if (classification.kind === 'amnezia_key' && handlers.importAmneziaKey) {
    await handlers.importAmneziaKey(classification.value)
    return classification
  }

  throw new Error('Unsupported profile import input')
}
