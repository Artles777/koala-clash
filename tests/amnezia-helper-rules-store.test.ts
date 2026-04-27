import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  AmneziaHelperRulePacksState,
  normalizeAmneziaHelperRulePacksState
} from '../src/core/routing/amnezia-helper-rule-packs'
import {
  addAmneziaHelperRulePackToStore,
  addAmneziaHelperRuleToStore,
  bulkAddAmneziaHelperRulesToStore,
  exportAmneziaHelperRulesStore,
  getAmneziaHelperRulePacksFromStore,
  getAmneziaHelperRulesFromStore,
  importAmneziaHelperRulesStore,
  readAmneziaHelperRulesStore,
  removeAmneziaHelperRuleFromStore,
  updateAmneziaHelperRulePackInStore,
  updateAmneziaHelperRuleInStore,
  writeAmneziaHelperRulesStore
} from '../src/features/amnezia-helper-rules/store'

let cleanupTasks: Array<() => Promise<void>> = []

describe('Amnezia helper rule store', () => {
  afterEach(async () => {
    const tasks = cleanupTasks
    cleanupTasks = []
    await Promise.all(tasks.map((task) => task()))
  })

  it('persists helper routing rules in a dedicated store file', async () => {
    const filePath = await createStorePath()
    const added = addAmneziaHelperRuleToStore(
      createEmptyStore(),
      {
        type: 'DOMAIN-SUFFIX',
        value: 'Example.COM',
        note: 'work'
      },
      {
        id: () => 'rule-1',
        now: () => 1710000000000
      }
    )

    await writeAmneziaHelperRulesStore(filePath, added.store)
    const loaded = await readAmneziaHelperRulesStore(filePath)
    const packs = getAmneziaHelperRulePacksFromStore(loaded)
    const rules = getAmneziaHelperRulesFromStore(loaded)

    assert.equal(packs.length, 1)
    assert.equal(packs[0].id, 'default')
    assert.equal(rules.length, 1)
    assert.equal(rules[0].id, 'rule-1')
    assert.equal(rules[0].value, 'example.com')
    assert.equal(rules[0].target, 'AMNEZIA_HELPER')
  })

  it('supports add, edit, disable, and delete operations', () => {
    const added = addAmneziaHelperRuleToStore(
      createEmptyStore(),
      {
        type: 'DOMAIN',
        value: 'example.com'
      },
      {
        id: () => 'rule-1',
        now: () => 1710000000000
      }
    )
    const updated = updateAmneziaHelperRuleInStore(
      added.store,
      'rule-1',
      {
        type: 'DOMAIN-KEYWORD',
        value: 'internal',
        enabled: false,
        note: 'disabled'
      },
      {
        now: () => 1710000001000
      }
    )
    const removed = removeAmneziaHelperRuleFromStore(updated.store, 'rule-1')

    assert.equal(updated.rule.type, 'DOMAIN-KEYWORD')
    assert.equal(updated.rule.value, 'internal')
    assert.equal(updated.rule.enabled, false)
    assert.equal(updated.rule.note, 'disabled')
    assert.equal(updated.rule.updatedAt, 1710000001000)
    assert.equal(removed.removed, true)
    assert.deepEqual(getAmneziaHelperRulesFromStore(removed.store), [])
  })

  it('rejects duplicate rules before writing them to the store', () => {
    const added = addAmneziaHelperRuleToStore(
      createEmptyStore(),
      {
        type: 'DOMAIN',
        value: 'example.com'
      },
      {
        id: () => 'rule-1'
      }
    )

    assert.throws(
      () =>
        addAmneziaHelperRuleToStore(
          added.store,
          {
            type: 'DOMAIN',
            value: 'EXAMPLE.com'
          },
          {
            id: () => 'rule-2'
          }
        ),
      /same type and value/
    )
  })

  it('migrates legacy flat rules into the default pack', async () => {
    const filePath = await createStorePath()
    await writeFile(
      filePath,
      [
        'items:',
        '  - id: legacy-rule',
        '    type: DOMAIN',
        '    value: legacy.example',
        '    enabled: true',
        '    target: AMNEZIA_HELPER',
        '    createdAt: 1710000000000'
      ].join('\n'),
      'utf-8'
    )

    const loaded = await readAmneziaHelperRulesStore(filePath)
    const packs = getAmneziaHelperRulePacksFromStore(loaded)

    assert.equal(packs.length, 1)
    assert.equal(packs[0].id, 'default')
    assert.equal(packs[0].rules[0].value, 'legacy.example')
  })

  it('supports pack creation and enable or disable behavior', () => {
    const packAdded = addAmneziaHelperRulePackToStore(
      { version: 2, packs: [] },
      {
        name: 'Work'
      },
      {
        id: () => 'pack-work',
        now: () => 1710000000000
      }
    )
    const ruleAdded = addAmneziaHelperRuleToStore(
      packAdded.store,
      {
        packId: 'pack-work',
        type: 'DOMAIN',
        value: 'work.example'
      },
      {
        id: () => 'rule-work'
      }
    )
    const disabled = updateAmneziaHelperRulePackInStore(ruleAdded.store, 'pack-work', {
      enabled: false
    })

    assert.equal(disabled.pack.enabled, false)
    assert.equal(getAmneziaHelperRulesFromStore(disabled.store).length, 1)
    assert.equal(
      getAmneziaHelperRulesFromStore(disabled.store, { enabledPacksOnly: true }).length,
      0
    )
  })

  it('bulk-adds helper rules with duplicate and invalid entry reporting', () => {
    const existing = addAmneziaHelperRuleToStore(
      createEmptyStore(),
      {
        type: 'DOMAIN',
        value: 'existing.example'
      },
      {
        id: () => 'rule-existing'
      }
    )
    const result = bulkAddAmneziaHelperRulesToStore(
      existing.store,
      {
        type: 'DOMAIN',
        text: 'example.com, example.com\nbad value\nexisting.example\ninternal.example'
      },
      {
        id: (() => {
          let index = 0
          return () => `bulk-${(index += 1)}`
        })(),
        now: () => 1710000000000
      }
    )

    assert.equal(result.result.summary.added, 2)
    assert.equal(result.result.summary.skipped, 2)
    assert.equal(result.result.summary.invalid, 1)
    assert.deepEqual(
      result.result.added.map((rule) => rule.value),
      ['example.com', 'internal.example']
    )
  })

  it('exports and imports rule packs with duplicate-safe merge behavior', () => {
    const source = addAmneziaHelperRuleToStore(
      createEmptyStore(),
      {
        type: 'DOMAIN-SUFFIX',
        value: 'source.example'
      },
      {
        id: () => 'rule-source'
      }
    )
    const exported = exportAmneziaHelperRulesStore(source.store, 1710000000000)
    assert.match(exported, /koala-clash\.amnezia-helper-rule-packs/)
    const target = addAmneziaHelperRuleToStore(
      createEmptyStore(),
      {
        type: 'DOMAIN-SUFFIX',
        value: 'source.example'
      },
      {
        id: () => 'rule-duplicate'
      }
    )
    const content = [
      'format: koala-clash.amnezia-helper-rule-packs',
      'version: 1',
      'exportedAt: 1710000000000',
      'packs:',
      '  - name: Default',
      '    enabled: true',
      '    rules:',
      '      - type: DOMAIN-SUFFIX',
      '        value: source.example',
      '        enabled: true',
      '      - type: DOMAIN',
      '        value: imported.example',
      '        enabled: true'
    ].join('\n')
    const imported = importAmneziaHelperRulesStore(target.store, content, {
      id: (() => {
        let index = 0
        return () => `imported-${(index += 1)}`
      })(),
      now: () => 1710000000000
    })

    assert.equal(imported.result.summary.addedRules, 1)
    assert.equal(imported.result.summary.skippedRules, 1)
    assert.equal(imported.result.summary.invalidRules, 0)
    assert.ok(
      getAmneziaHelperRulesFromStore(imported.store).some(
        (rule) => rule.value === 'imported.example'
      )
    )
  })
})

function createEmptyStore(): AmneziaHelperRulePacksState {
  return normalizeAmneziaHelperRulePacksState({})
}

async function createStorePath(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'koala-amnezia-rules-'))
  cleanupTasks.push(async () => rm(dir, { recursive: true, force: true }))
  return path.join(dir, 'amnezia-helper-rules.yaml')
}
