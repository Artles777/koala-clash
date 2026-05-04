export type AmneziaImportErrorCode =
  | 'malformed_input'
  | 'unsupported_format'
  | 'unsupported_payload'
  | 'decode_failed'
  | 'missing_endpoint'
  | 'missing_keys'
  | 'duplicate_import'
  | 'validation_failed'

export class AmneziaImportError extends Error {
  readonly code: AmneziaImportErrorCode
  readonly details?: unknown

  constructor(code: AmneziaImportErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'AmneziaImportError'
    this.code = code
    this.details = details
  }
}
