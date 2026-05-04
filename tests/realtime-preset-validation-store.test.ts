import * as assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, it } from 'node:test'
import {
  getRealtimePresetValidationEvidence,
  readRealtimePresetValidationStore,
  upsertRealtimePresetValidationEvidence,
  writeRealtimePresetValidationStore
} from '../src/features/realtime-preset-validation/store'

describe('realtime preset validation store', () => {
  it('persists manual confirmation evidence by profile and preset', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'koala-realtime-preset-'))
    const filePath = path.join(dir, 'validation.json')
    try {
      const store = upsertRealtimePresetValidationEvidence(
        await readRealtimePresetValidationStore(filePath),
        {
          profileId: 'vpn-1',
          presetId: 'discord_voice_vpn',
          validationStatus: 'smoke_passed',
          validationSource: 'preset_smoke',
          lastValidatedAt: 1710000000000,
          validationSummary: 'Smoke passed.',
          smokeResult: 'passed',
          observedIpEvidenceCount: 2,
          observedIpEvidenceProcesses: ['Discord'],
          observedIpEvidenceIps: ['162.159.135.234'],
          validationExpired: false,
          environmentChanged: false,
          lastEnvironmentFingerprint:
            'profile=vpn-1|platform=darwin|tun=on|helper=production|udp=proxy_validated',
          validationNotes: ['Runtime smoke passed.']
        }
      )
      await writeRealtimePresetValidationStore(filePath, store)

      const persisted = await readRealtimePresetValidationStore(filePath)
      const evidence = getRealtimePresetValidationEvidence(persisted, 'vpn-1', 'discord_voice_vpn')
      assert.equal(evidence?.validationStatus, 'smoke_passed')
      assert.equal(evidence?.validationSource, 'preset_smoke')
      assert.equal(evidence?.validationSummary, 'Smoke passed.')
      assert.equal(evidence?.observedIpEvidenceCount, 2)
      assert.deepEqual(evidence?.observedIpEvidenceProcesses, ['Discord'])
      assert.deepEqual(evidence?.observedIpEvidenceIps, ['162.159.135.234'])
      assert.equal(JSON.parse(await readFile(filePath, 'utf8')).schemaVersion, 1)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
