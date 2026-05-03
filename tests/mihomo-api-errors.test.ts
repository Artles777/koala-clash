import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isMihomoApiUnavailableError } from '../src/main/core/mihomoApiErrors'

describe('Mihomo API error classification', () => {
  it('treats local API socket connection failures as unavailable core errors', () => {
    assert.equal(
      isMihomoApiUnavailableError({
        code: 'ECONNREFUSED',
        message: 'connect ECONNREFUSED /tmp/koala-clash-mihomo-api.sock'
      }),
      true
    )

    assert.equal(
      isMihomoApiUnavailableError(new Error('connect ENOENT /tmp/koala-clash-mihomo-api.sock')),
      true
    )
  })

  it('checks nested causes from wrapped request errors', () => {
    assert.equal(
      isMihomoApiUnavailableError({
        message: 'request failed',
        cause: { code: 'ECONNRESET' }
      }),
      true
    )
  })

  it('does not treat profile content errors as unavailable core errors', () => {
    assert.equal(
      isMihomoApiUnavailableError({
        code: 'ERR_BAD_REQUEST',
        message: 'Proxy 0: unsupported vless option'
      }),
      false
    )

    assert.equal(isMihomoApiUnavailableError('invalid config'), false)
    assert.equal(isMihomoApiUnavailableError(new Error('provider file ENOENT')), false)
  })
})
