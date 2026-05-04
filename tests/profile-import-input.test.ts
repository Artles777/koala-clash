import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  classifyProfileImportInput,
  submitProfileImportInput
} from '../src/renderer/src/utils/profile-import-input'

describe('profile import input classification', () => {
  it('classifies http and https subscription URLs as remote_url', () => {
    assert.equal(classifyProfileImportInput('http://example.com/sub.yaml').kind, 'remote_url')
    assert.equal(classifyProfileImportInput('https://example.com/sub.yaml').kind, 'remote_url')
  })

  it('classifies vpn:// input as amnezia_key without URL validation errors', () => {
    const result = classifyProfileImportInput('vpn://AAAJ2Hic...')

    assert.equal(result.kind, 'amnezia_key')
    assert.equal(result.reason, undefined)
  })

  it('classifies unsupported or malformed input as invalid', () => {
    assert.deepEqual(classifyProfileImportInput(''), {
      kind: 'invalid',
      value: '',
      reason: 'empty'
    })
    assert.equal(classifyProfileImportInput('ftp://example.com/config.yaml').kind, 'invalid')
    assert.equal(classifyProfileImportInput('not a URL').kind, 'invalid')
  })
})

describe('profile import submit routing', () => {
  it('routes remote_url inputs to the remote import handler', async () => {
    const calls: string[] = []

    const result = await submitProfileImportInput('https://example.com/sub.yaml', {
      importRemoteUrl: async (url) => {
        calls.push(`remote:${url}`)
      },
      importAmneziaKey: async (raw) => {
        calls.push(`amnezia:${raw}`)
      }
    })

    assert.equal(result.kind, 'remote_url')
    assert.deepEqual(calls, ['remote:https://example.com/sub.yaml'])
  })

  it('routes vpn:// inputs to the Amnezia import handler', async () => {
    const calls: string[] = []

    const result = await submitProfileImportInput('vpn://AAAJ2Hic...', {
      importRemoteUrl: async (url) => {
        calls.push(`remote:${url}`)
      },
      importAmneziaKey: async (raw) => {
        calls.push(`amnezia:${raw}`)
      }
    })

    assert.equal(result.kind, 'amnezia_key')
    assert.deepEqual(calls, ['amnezia:vpn://AAAJ2Hic...'])
  })

  it('rejects invalid inputs without calling either import handler', async () => {
    const calls: string[] = []

    await assert.rejects(
      () =>
        submitProfileImportInput('ftp://example.com/config.yaml', {
          importRemoteUrl: async (url) => {
            calls.push(`remote:${url}`)
          },
          importAmneziaKey: async (raw) => {
            calls.push(`amnezia:${raw}`)
          }
        }),
      /Unsupported profile import input/
    )
    assert.deepEqual(calls, [])
  })
})
