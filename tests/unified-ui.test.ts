import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createUnifiedRuleOwners,
  createUnifiedRuleSavePlan,
  createUnifiedSupportSummary,
  createUnifiedUiBundle,
  resolveDefaultRuleOwnerId
} from '../src/core/ui/unified-ui'
import {
  appendUnifiedManagedRule,
  createUnifiedRulesExportDocument,
  createEmptyUnifiedRulePatchFile,
  createUnifiedRulesForDisplay,
  dedupeUnifiedRulePatchFile,
  duplicateUnifiedManagedRulesToOwner,
  duplicateUnifiedManagedRuleToOwner,
  getSelectableUnifiedRuleIds,
  importUnifiedRulesToPatch,
  moveUnifiedManagedRule,
  removeUnifiedManagedRules,
  mapRulePatchesToUnifiedRules,
  removeUnifiedManagedRule,
  replaceUnifiedManagedRule,
  setUnifiedManagedRulesEnabled,
  setUnifiedManagedRuleEnabled
} from '../src/core/ui/unified-rule-management'
import {
  createKoalaRuBundleRule,
  pinKoalaRuBundleRulesLast
} from '../src/core/routing/mihomo-rule-provider-presets'

type TestProfileItem = Parameters<typeof createUnifiedRuleOwners>[0][number]

function createRuleOwners(
  profiles: TestProfileItem[],
  currentProfileId?: string
): ReturnType<typeof createUnifiedRuleOwners> {
  return createUnifiedRuleOwners(profiles).map((owner) => ({
    ...owner,
    isCurrent: owner.ownerProfileId === currentProfileId
  }))
}

describe('unified UI view models', () => {
  it('maps all profile imports into ordinary Mihomo rule ownership', () => {
    const owners = createRuleOwners(
      [
        { id: 'mihomo-1', name: 'Main subscription' },
        { id: 'amnezia-1', name: 'Imported Amnezia' },
        { id: 'vless-1', name: 'Imported VLESS' }
      ],
      'amnezia-1'
    )

    assert.deepEqual(
      owners.map((owner) => owner.ownerType),
      ['mihomo', 'mihomo', 'mihomo']
    )
    assert.equal(owners[1].isCurrent, true)
  })

  it('builds one loaded bundle from Mihomo-native sources', () => {
    const bundle = createUnifiedUiBundle({
      currentProfileId: 'amnezia-1',
      profileItems: [
        { id: 'mihomo-1', name: 'Main subscription' },
        { id: 'amnezia-1', name: 'Imported Amnezia' }
      ],
      mihomo: { running: true, currentProfileId: 'amnezia-1', tunEnabled: false },
      mihomoRules: [{ type: 'DOMAIN', payload: 'mihomo.example.com', proxy: 'PROXY' }]
    })

    assert.equal(bundle.ruleOwners.length, 2)
    assert.equal(bundle.allRules[0].ownerType, 'mihomo')
    assert.equal(bundle.allRules[0].ownerProfileName, 'Imported Amnezia')
    assert.equal(bundle.supportSummary.overallStatus, 'ready')
  })

  it('resolves rule owners conservatively', () => {
    const owners = createRuleOwners(
      [
        { id: 'mihomo-1', name: 'Main Mihomo' },
        { id: 'native-1', name: 'Native Import' }
      ],
      'native-1'
    )

    assert.equal(resolveDefaultRuleOwnerId(owners), 'mihomo:native-1')
  })

  it('creates owner-aware save plans for native PROXY rules', () => {
    const owners = createRuleOwners(
      [
        { id: 'mihomo-1', name: 'Main Mihomo' },
        { id: 'amnezia-1', name: 'Work VPN' }
      ],
      'mihomo-1'
    )
    const plan = createUnifiedRuleSavePlan({
      owner: owners[1],
      type: 'DOMAIN-SUFFIX',
      value: 'linkedin.com',
      target: 'PROXY'
    })

    assert.equal(plan.serializedRule, 'DOMAIN-SUFFIX,linkedin.com,PROXY')
    assert.equal(plan.userFacingTarget, 'PROXY')
    assert.equal(plan.successMessageKey, 'pages.rules.mihomoRuleAdded')
  })

  it('serializes MATCH rules without a value', () => {
    const owners = createRuleOwners([{ id: 'profile-1', name: 'Native' }], 'profile-1')
    const plan = createUnifiedRuleSavePlan({
      owner: owners[0],
      type: 'MATCH',
      value: '',
      target: 'PROXY'
    })

    assert.equal(plan.serializedRule, 'MATCH,PROXY')
  })

  it('creates the RU bundle preset as a normal user-facing RULE-SET rule', () => {
    const owners = createRuleOwners([{ id: 'profile-1', name: 'Native' }], 'profile-1')
    const plan = createUnifiedRuleSavePlan({
      owner: owners[0],
      type: 'RULE-SET',
      value: 'ru-bundle',
      target: 'DIRECT'
    })

    assert.equal(createKoalaRuBundleRule(), 'RULE-SET,ru-bundle,DIRECT')
    assert.equal(plan.serializedRule, 'RULE-SET,ru-bundle,DIRECT')
  })

  it('pins RU bundle rules at the end of the effective runtime rule order', () => {
    const added = appendUnifiedManagedRule(
      {
        ...createEmptyUnifiedRulePatchFile(),
        prepend: ['DOMAIN-SUFFIX,linkedin.com,DIRECT']
      },
      createKoalaRuBundleRule()
    )
    assert.equal(added.added, true)
    assert.deepEqual(added.patch.prepend, ['DOMAIN-SUFFIX,linkedin.com,DIRECT'])
    assert.deepEqual(added.patch.append, ['RULE-SET,ru-bundle,DIRECT'])

    const patch = dedupeUnifiedRulePatchFile({
      ...createEmptyUnifiedRulePatchFile(),
      prepend: ['RULE-SET,ru-bundle,PROXY', 'DOMAIN-SUFFIX,linkedin.com,DIRECT'],
      append: ['IP-CIDR,95.161.76.100/32,DIRECT']
    })

    assert.deepEqual(patch.prepend, ['DOMAIN-SUFFIX,linkedin.com,DIRECT'])
    assert.deepEqual(patch.append, ['IP-CIDR,95.161.76.100/32,DIRECT', 'RULE-SET,ru-bundle,PROXY'])
    assert.deepEqual(
      dedupeUnifiedRulePatchFile({
        ...createEmptyUnifiedRulePatchFile(),
        prepend: ['RULE-SET,ru-bundle,PROXY', 'DOMAIN-SUFFIX,linkedin.com,DIRECT'],
        append: ['MATCH,DIRECT']
      }),
      {
        prepend: ['DOMAIN-SUFFIX,linkedin.com,DIRECT'],
        append: ['RULE-SET,ru-bundle,PROXY', 'MATCH,DIRECT'],
        delete: [],
        disabled: []
      }
    )
    assert.deepEqual(
      pinKoalaRuBundleRulesLast([
        'DOMAIN-SUFFIX,linkedin.com,DIRECT',
        'MATCH,PROXY',
        'RULE-SET,ru-bundle,DIRECT',
        'RULE-SET,ru-bundle,PROXY'
      ]),
      ['DOMAIN-SUFFIX,linkedin.com,DIRECT', 'RULE-SET,ru-bundle,PROXY', 'MATCH,PROXY']
    )
  })

  it('treats unknown target names as ordinary user-facing data', () => {
    const owners = createRuleOwners([{ id: 'profile-1', name: 'Native' }], 'profile-1')
    const plan = createUnifiedRuleSavePlan({
      owner: owners[0],
      type: 'DOMAIN-SUFFIX',
      value: 'example.com',
      target: 'LEGACY_TARGET'
    })

    assert.equal(plan.userFacingTarget, 'LEGACY_TARGET')
  })

  it('edits native imported PROXY rules as ordinary Mihomo rules', () => {
    const owners = createRuleOwners([{ id: 'amnezia-1', name: 'Work VPN' }], 'amnezia-1')
    const patch = {
      ...createEmptyUnifiedRulePatchFile(),
      prepend: ['DOMAIN-SUFFIX,linkedin.com,PROXY']
    }
    const next = replaceUnifiedManagedRule(patch, 'prepend', 0, {
      type: 'DOMAIN',
      value: 'www.linkedin.com',
      target: 'PROXY'
    })
    const rules = mapRulePatchesToUnifiedRules(owners, { 'amnezia-1': next })

    assert.deepEqual(next.prepend, ['DOMAIN,www.linkedin.com,PROXY'])
    assert.equal(rules[0].ownerType, 'mihomo')
    assert.equal(rules[0].target, 'PROXY')
  })

  it('enables, disables, and deletes managed rules consistently', () => {
    const patch = {
      ...createEmptyUnifiedRulePatchFile(),
      prepend: ['DOMAIN-SUFFIX,linkedin.com,PROXY']
    }
    const disabled = setUnifiedManagedRuleEnabled(patch, 'prepend', 0, false)
    const enabled = setUnifiedManagedRuleEnabled(disabled, 'disabled', 0, true)
    const removed = removeUnifiedManagedRule(enabled, 'prepend', 0)

    assert.deepEqual(disabled.prepend, [])
    assert.deepEqual(disabled.disabled, ['DOMAIN-SUFFIX,linkedin.com,PROXY'])
    assert.deepEqual(enabled.prepend, ['DOMAIN-SUFFIX,linkedin.com,PROXY'])
    assert.deepEqual(enabled.disabled, [])
    assert.deepEqual(removed.prepend, [])
  })

  it('duplicates managed rules to another owner without deleting the source', () => {
    const sourcePatch = {
      ...createEmptyUnifiedRulePatchFile(),
      prepend: ['DOMAIN-SUFFIX,linkedin.com,PROXY']
    }
    const copied = duplicateUnifiedManagedRuleToOwner({
      sourcePatch,
      sourceSection: 'prepend',
      sourceIndex: 0,
      targetPatch: createEmptyUnifiedRulePatchFile()
    })

    assert.deepEqual(sourcePatch.prepend, ['DOMAIN-SUFFIX,linkedin.com,PROXY'])
    assert.deepEqual(copied.prepend, ['DOMAIN-SUFFIX,linkedin.com,PROXY'])
  })

  it('prefers managed editable rules and keeps runtime-only rules read-only', () => {
    const owners = createRuleOwners([{ id: 'mihomo-1', name: 'Main Mihomo' }], 'mihomo-1')
    const managedRules = mapRulePatchesToUnifiedRules(owners, {
      'mihomo-1': {
        ...createEmptyUnifiedRulePatchFile(),
        prepend: ['DOMAIN-SUFFIX,linkedin.com,PROXY']
      }
    })
    const runtimeRules = [
      ...managedRules.map((rule) => ({ ...rule, id: 'runtime-duplicate', editable: false })),
      {
        id: 'runtime-only',
        scopeId: 'mihomo' as const,
        ownerType: 'mihomo' as const,
        ownerProfileId: 'mihomo-1',
        ownerProfileName: 'Main Mihomo',
        type: 'DOMAIN',
        value: 'example.com',
        target: 'DIRECT',
        enabled: true,
        editable: false
      }
    ]
    const displayRules = createUnifiedRulesForDisplay({ runtimeRules, managedRules })

    assert.equal(displayRules.length, 2)
    assert.equal(displayRules[0].editable, true)
    assert.equal(displayRules[1].editable, false)
  })

  it('selects only editable managed rules for bulk actions', () => {
    const owners = createRuleOwners([{ id: 'mihomo-1', name: 'Main Mihomo' }], 'mihomo-1')
    const managedRules = mapRulePatchesToUnifiedRules(owners, {
      'mihomo-1': {
        ...createEmptyUnifiedRulePatchFile(),
        prepend: ['DOMAIN-SUFFIX,linkedin.com,PROXY']
      }
    })
    const readOnlyRule = {
      ...managedRules[0],
      id: 'runtime-only',
      editable: false,
      managedPatchSection: undefined,
      managedPatchIndex: undefined
    }

    assert.deepEqual(getSelectableUnifiedRuleIds([...managedRules, readOnlyRule]), [
      managedRules[0].id
    ])
  })

  it('bulk enables, disables, and deletes selected managed rules', () => {
    const owners = createRuleOwners([{ id: 'mihomo-1', name: 'Main Mihomo' }], 'mihomo-1')
    const patch = {
      ...createEmptyUnifiedRulePatchFile(),
      prepend: ['DOMAIN-SUFFIX,linkedin.com,PROXY', 'DOMAIN,example.com,DIRECT']
    }
    const rules = mapRulePatchesToUnifiedRules(owners, { 'mihomo-1': patch })
    const disabled = setUnifiedManagedRulesEnabled(patch, [rules[0]], false)
    const disabledRules = mapRulePatchesToUnifiedRules(owners, { 'mihomo-1': disabled })
    const enabled = setUnifiedManagedRulesEnabled(disabled, [disabledRules[1]], true)
    const deleted = removeUnifiedManagedRules(enabled, [disabledRules[0]])

    assert.deepEqual(disabled.prepend, ['DOMAIN,example.com,DIRECT'])
    assert.deepEqual(disabled.disabled, ['DOMAIN-SUFFIX,linkedin.com,PROXY'])
    assert.deepEqual(enabled.disabled, [])
    assert.deepEqual(deleted.prepend, ['DOMAIN-SUFFIX,linkedin.com,PROXY'])
  })

  it('moves managed rules within their profile patch order', () => {
    const patch = {
      ...createEmptyUnifiedRulePatchFile(),
      prepend: [
        'DOMAIN-SUFFIX,linkedin.com,PROXY',
        'DOMAIN-SUFFIX,youtube.com,PROXY',
        'PROCESS-NAME,Telegram,DIRECT'
      ],
      append: ['RULE-SET,ru-bundle,DIRECT']
    }

    const movedUp = moveUnifiedManagedRule(patch, 'prepend', 2, 'up')
    assert.deepEqual(movedUp.prepend, [
      'DOMAIN-SUFFIX,linkedin.com,PROXY',
      'PROCESS-NAME,Telegram,DIRECT',
      'DOMAIN-SUFFIX,youtube.com,PROXY'
    ])
    assert.deepEqual(moveUnifiedManagedRule(movedUp, 'prepend', 1, 'down').prepend, patch.prepend)
  })

  it('bulk duplicates selected rules to another owner', () => {
    const owners = createRuleOwners(
      [
        { id: 'mihomo-1', name: 'Main Mihomo' },
        { id: 'native-1', name: 'Native Import' }
      ],
      'mihomo-1'
    )
    const sourcePatch = {
      ...createEmptyUnifiedRulePatchFile(),
      prepend: ['DOMAIN-SUFFIX,linkedin.com,PROXY', 'DOMAIN,example.com,CustomGroup']
    }
    const sourceRules = mapRulePatchesToUnifiedRules(owners, { 'mihomo-1': sourcePatch })
    const result = duplicateUnifiedManagedRulesToOwner({
      targetPatch: createEmptyUnifiedRulePatchFile(),
      rules: sourceRules
    })

    assert.equal(result.added, 2)
    assert.equal(result.invalid.length, 0)
  })

  it('bulk imports owner-aware rules with duplicate and invalid summaries', () => {
    const patch = {
      ...createEmptyUnifiedRulePatchFile(),
      prepend: ['DOMAIN-SUFFIX,linkedin.com,PROXY']
    }
    const result = importUnifiedRulesToPatch({
      patch,
      type: 'DOMAIN-SUFFIX',
      target: 'PROXY',
      text: 'linkedin.com, github.com\nbad value'
    })

    assert.equal(result.added, 1)
    assert.equal(result.skippedDuplicate, 1)
    assert.equal(result.invalid.length, 1)
  })

  it('bulk imports MATCH as a single value-less rule', () => {
    const result = importUnifiedRulesToPatch({
      patch: createEmptyUnifiedRulePatchFile(),
      type: 'MATCH',
      target: 'PROXY',
      text: 'all traffic'
    })

    assert.equal(result.added, 1)
    assert.equal(result.invalid.length, 0)
    assert.deepEqual(result.patch.prepend, [])
    assert.deepEqual(result.patch.append, ['MATCH,PROXY'])
  })

  it('exports app-owned JSON without rewriting target names', () => {
    const owners = createRuleOwners([{ id: 'native-1', name: 'Native Import' }], 'native-1')
    const rules = mapRulePatchesToUnifiedRules(owners, {
      'native-1': {
        ...createEmptyUnifiedRulePatchFile(),
        prepend: ['DOMAIN-SUFFIX,linkedin.com,PROXY']
      }
    })
    const document = createUnifiedRulesExportDocument(rules, new Date('2026-04-27T00:00:00.000Z'))

    assert.equal(document.format, 'koala-clash.unified-rules')
    assert.equal(document.rules[0].target, 'PROXY')
    assert.equal(document.rules[0].displayTarget, 'PROXY')
  })

  it('aggregates support summary status with blocker precedence', () => {
    const ready = createUnifiedSupportSummary({ mihomo: { running: true, tunEnabled: true } })
    const blocked = createUnifiedSupportSummary({ mihomo: { running: false } })

    assert.equal(ready.overallStatus, 'ready')
    assert.equal(ready.mihomoStatus, 'ready')
    assert.equal(blocked.overallStatus, 'blocked')
    assert.deepEqual(blocked.topIssues, ['mihomo_not_running'])
  })
})
