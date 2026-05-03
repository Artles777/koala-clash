import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  classifyProfileImportInput,
  isSupportedRemoteProfileUrl,
  submitProfileImportInput
} from '../src/renderer/src/utils/profile-import-input'

const uuid = '00000000-0000-4000-8000-000000000000'

describe('profile import input classification', () => {
  it('keeps http and https subscription URLs routed as remote_url', () => {
    assert.equal(classifyProfileImportInput('http://example.com/sub.yaml').kind, 'remote_url')
    assert.equal(classifyProfileImportInput('https://example.com/sub.yaml').kind, 'remote_url')
  })

  it('accepts http and https subscription URLs regardless of TLD', () => {
    const ru = classifyProfileImportInput('https://bot.xxxxx.ru/xxx_sub/yyyy/ddddd')
    const com = classifyProfileImportInput('https://bot.xxxxx.com/xxx_sub/yyyy/ddddd')

    assert.equal(ru.kind, 'remote_url')
    assert.equal(ru.value, 'https://bot.xxxxx.ru/xxx_sub/yyyy/ddddd')
    assert.equal(com.kind, 'remote_url')
    assert.equal(com.value, 'https://bot.xxxxx.com/xxx_sub/yyyy/ddddd')
  })

  it('validates remote subscription URLs by http(s) scheme without TLD allowlists', () => {
    assert.equal(isSupportedRemoteProfileUrl('https://bot.xxxxx.ru/xxx_sub/yyyy/ddddd'), true)
    assert.equal(isSupportedRemoteProfileUrl('https://bot.xxxxx.com/xxx_sub/yyyy/ddddd'), true)
    assert.equal(isSupportedRemoteProfileUrl('http://localhost:7890/sub'), true)
    assert.equal(isSupportedRemoteProfileUrl('ftp://example.ru/config.yaml'), false)
    assert.equal(isSupportedRemoteProfileUrl('https://'), false)
    assert.equal(isSupportedRemoteProfileUrl('not a URL'), false)
  })

  it('keeps vpn:// routed as amnezia_key without touching Amnezia flows', () => {
    const result = classifyProfileImportInput('vpn://AAAJ2Hic...')

    assert.equal(result.kind, 'amnezia_key')
    assert.equal(result.reason, undefined)
  })

  it('routes valid vless:// input as vless_uri with a parsed draft', () => {
    const result = classifyProfileImportInput(`vless://${uuid}@example.com:443?security=tls`)

    assert.equal(result.kind, 'vless_uri')
    assert.equal(result.vless?.ok, true)
    if (result.vless?.ok !== true) return
    assert.equal(result.vless.draft.uuid, uuid)
    assert.equal(result.vless.draft.server.host, 'example.com')
    assert.equal(result.vless.draft.security, 'tls')
  })

  it('routes invalid vless:// input as vless_uri with structured parser errors', () => {
    const result = classifyProfileImportInput('vless://not-a-uuid@example.com:443?type=splithttp')

    assert.equal(result.kind, 'vless_uri')
    assert.equal(result.vless?.ok, false)
    if (result.vless?.ok !== false) return
    assert.deepEqual(
      result.vless.errors.map((error) => error.code),
      ['invalid_uuid', 'unsupported_transport']
    )
  })

  it('keeps unsupported non-vless input invalid', () => {
    assert.deepEqual(classifyProfileImportInput(''), {
      kind: 'invalid',
      value: '',
      reason: 'empty'
    })
    assert.equal(classifyProfileImportInput('ftp://example.com/config.yaml').kind, 'invalid')
    assert.equal(classifyProfileImportInput('not a URL').kind, 'invalid')
  })
})

describe('profile import input submit routing', () => {
  it('routes remote_url inputs to the remote handler', async () => {
    const calls: string[] = []

    const result = await submitProfileImportInput('https://example.com/sub.yaml', {
      importRemoteUrl: async (url) => {
        calls.push(`remote:${url}`)
      },
      importVlessUri: async (raw) => {
        calls.push(`vless:${raw}`)
      }
    })

    assert.equal(result.kind, 'remote_url')
    assert.deepEqual(calls, ['remote:https://example.com/sub.yaml'])
  })

  it('routes valid vless_uri inputs to the VLESS handler', async () => {
    const calls: string[] = []
    const uri = `vless://${uuid}@example.com:443`

    const result = await submitProfileImportInput(uri, {
      importRemoteUrl: async (url) => {
        calls.push(`remote:${url}`)
      },
      importVlessUri: async (raw) => {
        calls.push(`vless:${raw}`)
      }
    })

    assert.equal(result.kind, 'vless_uri')
    assert.deepEqual(calls, [`vless:${uri}`])
  })

  it('surfaces unsupported vless_uri variants before handler execution', async () => {
    const calls: string[] = []

    await assert.rejects(
      () =>
        submitProfileImportInput(`vless://${uuid}@example.com:443?type=splithttp`, {
          importRemoteUrl: async (url) => {
            calls.push(`remote:${url}`)
          },
          importVlessUri: async (raw) => {
            calls.push(`vless:${raw}`)
          }
        }),
      /intentionally unsupported|Unsupported VLESS transport/
    )
    assert.deepEqual(calls, [])
  })

  it('keeps vpn:// classification available without requiring a VLESS handler path', async () => {
    const calls: string[] = []

    const result = await submitProfileImportInput('vpn://AAAJ2Hic...', {
      importRemoteUrl: async (url) => {
        calls.push(`remote:${url}`)
      },
      importVlessUri: async (raw) => {
        calls.push(`vless:${raw}`)
      },
      importAmneziaKey: async (raw) => {
        calls.push(`amnezia:${raw}`)
      }
    })

    assert.equal(result.kind, 'amnezia_key')
    assert.deepEqual(calls, ['amnezia:vpn://AAAJ2Hic...'])
  })
})
