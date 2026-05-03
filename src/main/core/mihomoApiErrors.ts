const MIHOMO_API_UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOENT',
  'ENOTCONN',
  'EPIPE',
  'ETIMEDOUT'
])

export function isMihomoApiUnavailableError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as {
      code?: unknown
      cause?: unknown
      message?: unknown
    }

    if (
      typeof candidate.code === 'string' &&
      MIHOMO_API_UNAVAILABLE_CODES.has(candidate.code)
    ) {
      return true
    }

    if (typeof candidate.message === 'string') {
      const message = candidate.message
      if (
        /(?:connect|socket|pipe|\/tmp\/koala-clash-mihomo)/i.test(message) &&
        [...MIHOMO_API_UNAVAILABLE_CODES].some((code) => message.includes(code))
      ) {
        return true
      }
    }

    if (candidate.cause) {
      return isMihomoApiUnavailableError(candidate.cause)
    }
  }

  return false
}
