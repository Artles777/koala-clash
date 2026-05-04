import { gunzipSync, inflateRawSync, inflateSync, unzipSync } from 'node:zlib'
import { AmneziaImportError } from './errors'

export interface DecodedAmneziaPayload {
  text: string
  encoding: 'qt-compressed' | 'zlib' | 'gzip' | 'deflate-raw' | 'plain'
  wasCompressed: boolean
  byteLength: number
}

const base64UrlPattern = /^[A-Za-z0-9_-]+={0,2}$/

export function isAmneziaVpnUri(input: string): boolean {
  return input.trim().startsWith('vpn://')
}

export function decodeAmneziaVpnUri(input: string): DecodedAmneziaPayload {
  const trimmed = input.trim()

  if (!isAmneziaVpnUri(trimmed)) {
    throw new AmneziaImportError(
      'unsupported_format',
      'Only Amnezia vpn:// keys are supported by this importer'
    )
  }

  const payload = trimmed.slice('vpn://'.length).trim()
  if (!payload || !base64UrlPattern.test(payload) || payload.length % 4 === 1) {
    throw new AmneziaImportError('malformed_input', 'Amnezia key payload is not valid base64url')
  }

  let bytes: Buffer
  try {
    bytes = Buffer.from(payload, 'base64url')
  } catch (error) {
    throw new AmneziaImportError('decode_failed', 'Failed to decode Amnezia key payload', error)
  }

  if (bytes.length === 0) {
    throw new AmneziaImportError('malformed_input', 'Amnezia key payload is empty')
  }

  const qtCompressed = tryQtUncompress(bytes)
  if (qtCompressed) {
    return {
      text: qtCompressed.toString('utf-8'),
      encoding: 'qt-compressed',
      wasCompressed: true,
      byteLength: qtCompressed.length
    }
  }

  const zlibCompressed = tryInflate(bytes)
  if (zlibCompressed) {
    return {
      text: zlibCompressed.text,
      encoding: zlibCompressed.encoding,
      wasCompressed: true,
      byteLength: zlibCompressed.buffer.length
    }
  }

  const text = bytes.toString('utf-8')
  if (!looksLikeText(text)) {
    throw new AmneziaImportError('unsupported_payload', 'Decoded Amnezia payload is not text')
  }

  return {
    text,
    encoding: 'plain',
    wasCompressed: false,
    byteLength: bytes.length
  }
}

function tryQtUncompress(bytes: Buffer): Buffer | null {
  if (bytes.length <= 4) return null

  try {
    const expectedLength = bytes.readUInt32BE(0)
    const inflated = inflateSync(bytes.subarray(4))
    if (expectedLength === 0 || expectedLength === inflated.length) {
      return inflated
    }

    return inflated
  } catch {
    return null
  }
}

function tryInflate(
  bytes: Buffer
): { buffer: Buffer; text: string; encoding: 'zlib' | 'gzip' | 'deflate-raw' } | null {
  const attempts: Array<{
    encoding: 'zlib' | 'gzip' | 'deflate-raw'
    inflate: (buffer: Buffer) => Buffer
  }> = [
    { encoding: 'zlib', inflate: unzipSync },
    { encoding: 'gzip', inflate: gunzipSync },
    { encoding: 'deflate-raw', inflate: inflateRawSync }
  ]

  for (const attempt of attempts) {
    try {
      const buffer = attempt.inflate(bytes)
      return { buffer, text: buffer.toString('utf-8'), encoding: attempt.encoding }
    } catch {
      // try the next compression variant
    }
  }

  return null
}

function looksLikeText(value: string): boolean {
  if (!value.trim()) return false

  let controlChars = 0
  for (const char of value) {
    const code = char.charCodeAt(0)
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      controlChars++
    }
  }

  return controlChars / value.length < 0.05
}
