import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  importVlessUri,
  prepareVlessImport,
  validateVlessProfile,
  VlessImportError,
  VlessImportRuntime
} from '../src/main/config/vlessImport'

const uuid = '00000000-0000-4000-8000-000000000000'
const validUri = `vless://${uuid}@example.com:443#Imported%20VLESS`

describe('main-process VLESS import path', () => {
  it('prepares a deterministic local Mihomo profile from a VLESS URI', () => {
    const prepared = prepareVlessImport(validUri, 1710000000000)

    assert.equal(prepared.profile.id, 'vless-9cb2051cd659f097')
    assert.equal(prepared.profile.name, 'Imported VLESS')
    assert.equal(prepared.profile.type, 'local')
    assert.equal(prepared.profile.sourceType, 'vless_uri')
    assert.deepEqual(prepared.profile.source?.vless, {
      host: 'example.com',
      port: 443,
      transport: 'tcp',
      security: 'none',
      packetEncoding: undefined,
      flow: undefined,
      serverName: undefined
    })
    assert.equal(prepared.profile.autoUpdate, false)
    assert.equal(prepared.profile.updated, 1710000000000)
    assert.match(prepared.yaml, /type: vless/)
    assert.match(prepared.yaml, /MATCH,Proxy/)
  })

  it('imports a VLESS URI through an injectable main-process runtime', async () => {
    const runtime = createRuntime()
    const profile = await importVlessUri(validUri, runtime)

    assert.equal(profile.id, 'vless-9cb2051cd659f097')
    assert.equal(profile.name, 'Imported VLESS')
    assert.equal(runtime.config.current, profile.id)
    assert.deepEqual(runtime.validatedYaml, [profile.file])
    assert.deepEqual(
      runtime.config.items?.map((item) => item.id),
      [profile.id]
    )
  })

  it('rejects duplicate VLESS imports before writing a profile', async () => {
    const runtime = createRuntime({
      items: [
        {
          id: 'vless-9cb2051cd659f097',
          name: 'Existing VLESS',
          type: 'local'
        }
      ]
    })

    await assert.rejects(
      () => importVlessUri(validUri, runtime),
      (error) => {
        assert.equal(error instanceof VlessImportError, true)
        assert.equal((error as VlessImportError).code, 'duplicate_import')
        return true
      }
    )
    assert.deepEqual(runtime.validatedYaml, [])
  })

  it('surfaces parser errors for unsupported VLESS variants', async () => {
    const runtime = createRuntime()

    await assert.rejects(
      () => importVlessUri(`vless://${uuid}@example.com:443?type=splithttp`, runtime),
      (error) => {
        assert.equal(error instanceof VlessImportError, true)
        assert.equal((error as VlessImportError).code, 'parse_failed')
        assert.match((error as Error).message, /Unsupported VLESS URI/)
        assert.match((error as Error).message, /unsupported/)
        return true
      }
    )
  })

  it('prepares metadata for expanded supported VLESS variants', () => {
    const prepared = prepareVlessImport(
      `vless://${uuid}@edge.example:443?type=xhttp&path=%2F&host=cdn.edge&mode=auto&packet-encoding=xudp&security=tls&sni=edge.example`,
      1710000000000
    )

    assert.deepEqual(prepared.profile.source?.vless, {
      host: 'edge.example',
      port: 443,
      transport: 'xhttp',
      security: 'tls',
      packetEncoding: 'xudp',
      flow: undefined,
      serverName: 'edge.example'
    })
  })

  it('surfaces Mihomo validation errors without saving broken profiles', async () => {
    const runtime = createRuntime(undefined, async () => {
      throw new VlessImportError(
        'mihomo_validation_failed',
        'Generated VLESS Mihomo profile failed validation'
      )
    })

    await assert.rejects(
      () => importVlessUri(validUri, runtime),
      (error) => {
        assert.equal(error instanceof VlessImportError, true)
        assert.equal((error as VlessImportError).code, 'mihomo_validation_failed')
        return true
      }
    )
    assert.deepEqual(runtime.config.items, [])
  })

  it('validates an existing imported VLESS profile without changing config', async () => {
    const runtime = createRuntime()
    const profile = await importVlessUri(validUri, runtime)
    const result = await validateVlessProfile(profile.id, runtime)

    assert.equal(result.profileId, profile.id)
    assert.equal(result.checkedAt, 1710000000000)
    assert.deepEqual(runtime.validatedYaml, [profile.file, profile.file])
    assert.equal(runtime.config.items?.length, 1)
  })

  it('rejects validation for non-VLESS profiles and missing VLESS YAML', async () => {
    await assert.rejects(
      () =>
        validateVlessProfile(
          'local-profile',
          createRuntime({
            items: [{ id: 'local-profile', name: 'Local', type: 'local', file: 'proxies: []' }]
          })
        ),
      (error) => {
        assert.equal(error instanceof VlessImportError, true)
        assert.equal((error as VlessImportError).code, 'not_vless_profile')
        return true
      }
    )

    await assert.rejects(
      () =>
        validateVlessProfile(
          'vless-missing-yaml',
          createRuntime({
            items: [
              {
                id: 'vless-missing-yaml',
                name: 'Broken VLESS',
                type: 'local',
                sourceType: 'vless_uri',
                source: {
                  vless: {
                    host: 'example.com',
                    port: 443,
                    transport: 'tcp',
                    security: 'tls'
                  }
                }
              }
            ]
          })
        ),
      (error) => {
        assert.equal(error instanceof VlessImportError, true)
        assert.equal((error as VlessImportError).code, 'missing_profile_yaml')
        return true
      }
    )
  })
})

function createRuntime(
  initialConfig: ProfileConfig = { items: [] },
  validateMihomoYaml: VlessImportRuntime['validateMihomoYaml'] = async () => {}
): VlessImportRuntime & { config: ProfileConfig; validatedYaml: string[] } {
  const runtime = {
    config: initialConfig,
    validatedYaml: [] as string[],
    now: () => 1710000000000,
    validateMihomoYaml: async (yaml: string) => {
      runtime.validatedYaml.push(yaml)
      await validateMihomoYaml(yaml)
    },
    getProfileConfig: async () => runtime.config,
    setProfileConfig: async (config: ProfileConfig) => {
      runtime.config = config
    },
    createProfile: async (item: Partial<ProfileItem>) =>
      ({
        id: item.id || 'generated-id',
        name: item.name || 'Generated',
        type: item.type || 'local',
        sourceType: item.sourceType,
        source: item.source,
        file: item.file,
        autoUpdate: item.autoUpdate,
        updated: item.updated
      }) as ProfileItem,
    changeCurrentProfile: async (id: string) => {
      runtime.config.current = id
    }
  }
  return runtime
}
