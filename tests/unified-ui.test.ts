import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createUnifiedRuleOwners,
  createUnifiedProfileItems,
  createUnifiedRuleSavePlan,
  createUnifiedRuleScopes,
  createUnifiedSupportSummary,
  createUnifiedUiBundle,
  getUnifiedRuleDisplayTarget,
  isHiddenUnifiedRuntimeRule,
  isUserFacingRuleTarget,
  resolveDefaultRuleOwnerId,
  resolveUnifiedRuleScopeId
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

describe('unified UI view models', () => {
  it('maps mixed Mihomo and Amnezia profiles into one presentation list', () => {
    const profiles = createUnifiedProfileItems(
      [
        {
          id: 'mihomo-1',
          type: 'remote',
          name: 'Main subscription',
          profileKind: 'mihomo'
        },
        {
          id: 'amnezia-1',
          type: 'local',
          name: 'Imported Amnezia',
          profileKind: 'amnezia',
          sourceType: 'amnezia_vpn_uri',
          importedSourceId: 'source-1',
          normalizedProfileId: 'normalized-1',
          runtimeSupport: 'prototype_available',
          validityStatus: 'valid',
          executionStatus: 'dry_run_available'
        }
      ],
      'mihomo-1'
    )

    assert.equal(profiles.length, 2)
    assert.equal(profiles[0].kind, 'mihomo')
    assert.equal(profiles[0].ruleScopeId, 'mihomo')
    assert.equal(profiles[0].isCurrent, true)
    assert.equal(
      profiles[0].badges.some((badge) => badge.code === 'mihomo'),
      true
    )
    assert.equal(profiles[1].kind, 'amnezia')
    assert.equal(profiles[1].ruleScopeId, 'amnezia')
    assert.equal(
      profiles[1].badges.some((badge) => badge.code === 'amnezia'),
      true
    )
  })

  it('builds separate unified rule scopes without merging storage models', () => {
    const profiles = createUnifiedProfileItems(
      [
        { id: 'mihomo-1', type: 'remote', name: 'Main', profileKind: 'mihomo' },
        {
          id: 'amnezia-1',
          type: 'local',
          name: 'VPN',
          profileKind: 'amnezia',
          importedSourceId: 'source-1',
          normalizedProfileId: 'normalized-1'
        }
      ],
      'mihomo-1'
    )
    const owners = createUnifiedRuleOwners(profiles)
    const scopes = createUnifiedRuleScopes({
      hasCurrentMihomoProfile: true,
      helperTargetInjected: true,
      ruleOwners: owners,
      activeRuleOwner: owners[0],
      mihomoRules: [{ type: 'DOMAIN-SUFFIX', payload: 'example.com', proxy: 'PROXY', size: 1 }],
      amneziaRulePacks: [
        {
          id: 'default',
          name: 'Default',
          enabled: true,
          rules: [
            {
              id: 'rule-1',
              type: 'DOMAIN',
              value: 'amnezia.example.com',
              enabled: true,
              target: 'AMNEZIA_HELPER'
            }
          ]
        }
      ]
    })

    assert.equal(scopes.length, 2)
    assert.equal(scopes[0].id, 'mihomo')
    assert.equal(scopes[0].rules[0].source, 'mihomo')
    assert.equal(scopes[0].rules[0].ownerProfileName, 'Main')
    assert.equal(scopes[0].rules[0].target, 'PROXY')
    assert.equal(scopes[1].id, 'amnezia')
    assert.equal(scopes[1].rules.length, 0)
  })

  it('builds one loaded bundle from separate Mihomo and Amnezia sources', () => {
    const bundle = createUnifiedUiBundle({
      currentProfileId: 'amnezia-1',
      requestedRuleScopeId: 'amnezia',
      profileItems: [
        {
          id: 'mihomo-1',
          type: 'remote',
          name: 'Main subscription',
          profileKind: 'mihomo'
        },
        {
          id: 'amnezia-1',
          type: 'local',
          name: 'Imported Amnezia',
          profileKind: 'amnezia',
          sourceType: 'amnezia_vpn_uri',
          importedSourceId: 'source-1',
          normalizedProfileId: 'normalized-1',
          runtimeSupport: 'prototype_available',
          validityStatus: 'valid',
          executionStatus: 'dry_run_available'
        }
      ],
      mihomo: { running: true, currentProfileId: 'mihomo-1', tunEnabled: false },
      mihomoRules: [{ type: 'DOMAIN', payload: 'mihomo.example.com', proxy: 'PROXY' }],
      amnezia: {
        session: {
          status: 'running',
          readiness: 'ready',
          localEndpoint: { protocol: 'socks5', host: '127.0.0.1', port: 10808 },
          routingTarget: { status: 'injected' }
        },
        readinessSummary: {
          overallStatus: 'ready',
          helperStatus: 'ready',
          tunStatus: 'ready',
          dnsRuleReliabilityStatus: 'ready',
          udpStatus: 'warning',
          releaseStatus: 'warning'
        }
      },
      amneziaRulePacks: [
        {
          id: 'default',
          name: 'Default',
          enabled: true,
          rules: [
            {
              id: 'rule-1',
              type: 'DOMAIN-SUFFIX',
              value: 'amnezia.example',
              enabled: true,
              target: 'AMNEZIA_HELPER'
            }
          ]
        }
      ]
    })

    assert.equal(bundle.profiles.length, 2)
    assert.equal(bundle.ruleOwners.length, 2)
    assert.equal(bundle.ruleScopes.length, 2)
    assert.equal(bundle.allRules.length, 1)
    assert.equal(bundle.allRules[0].source, 'amnezia')
    assert.equal(bundle.allRules[0].ownerType, 'amnezia')
    assert.equal(bundle.allRules[0].ownerProfileName, 'Imported Amnezia')
    assert.equal(bundle.activeRuleScopeId, 'amnezia')
    assert.equal(bundle.connectionStatus.helperRoutingInjected, true)
    assert.equal(bundle.connectionStatus.helperEndpoint, 'socks5://127.0.0.1:10808')
    assert.equal(bundle.supportSummary.overallStatus, 'warning')
    assert.ok(bundle.loadedAt > 0)
  })

  it('resolves active rule scope conservatively', () => {
    const scopes = createUnifiedRuleScopes({
      hasCurrentMihomoProfile: false,
      helperTargetInjected: true,
      amneziaRulePacks: []
    })

    assert.equal(resolveUnifiedRuleScopeId(undefined, scopes), 'mihomo')
    assert.equal(resolveUnifiedRuleScopeId('mihomo', scopes), 'mihomo')
    assert.equal(resolveUnifiedRuleScopeId('amnezia', scopes), 'amnezia')
    assert.equal(resolveUnifiedRuleScopeId('unknown', scopes), 'mihomo')
  })

  it('resolves rule owner defaults by page scope', () => {
    const profiles = createUnifiedProfileItems(
      [
        { id: 'mihomo-1', type: 'remote', name: 'Main Mihomo', profileKind: 'mihomo' },
        {
          id: 'amnezia-1',
          type: 'local',
          name: 'Work VPN',
          profileKind: 'amnezia',
          importedSourceId: 'source-1',
          normalizedProfileId: 'normalized-1'
        }
      ],
      'amnezia-1'
    )
    const owners = createUnifiedRuleOwners(profiles)

    assert.equal(resolveDefaultRuleOwnerId(owners, 'all'), 'amnezia:amnezia-1')
    assert.equal(resolveDefaultRuleOwnerId(owners, 'mihomo'), 'mihomo:mihomo-1')
    assert.equal(resolveDefaultRuleOwnerId(owners, 'amnezia'), 'amnezia:amnezia-1')
  })

  it('creates owner-aware save plans for PROXY rules', () => {
    const profiles = createUnifiedProfileItems(
      [
        { id: 'mihomo-1', type: 'remote', name: 'Main Mihomo', profileKind: 'mihomo' },
        {
          id: 'amnezia-1',
          type: 'local',
          name: 'Work VPN',
          profileKind: 'amnezia',
          importedSourceId: 'source-1',
          normalizedProfileId: 'normalized-1'
        }
      ],
      'mihomo-1'
    )
    const owners = createUnifiedRuleOwners(profiles)
    const mihomoPlan = createUnifiedRuleSavePlan({
      owner: owners[0],
      type: 'DOMAIN-SUFFIX',
      value: 'linkedin.com',
      target: 'PROXY'
    })
    const vpnPlan = createUnifiedRuleSavePlan({
      owner: owners[1],
      type: 'DOMAIN-SUFFIX',
      value: 'linkedin.com',
      target: 'PROXY'
    })

    assert.equal(mihomoPlan.serializedRule, 'DOMAIN-SUFFIX,linkedin.com,PROXY')
    assert.equal(mihomoPlan.successMessageKey, 'pages.rules.mihomoRuleAdded')
    assert.equal(vpnPlan.serializedRule, 'DOMAIN-SUFFIX,linkedin.com,PROXY')
    assert.equal(vpnPlan.userFacingTarget, 'VPN / PROXY')
    assert.equal(vpnPlan.successMessageKey, 'pages.rules.vpnRuleAdded')
  })

  it('serializes MATCH rules without a value for Mihomo and VPN owners', () => {
    const owners = createUnifiedRuleOwners(
      createUnifiedProfileItems(
        [
          { id: 'mihomo-1', type: 'remote', name: 'Main Mihomo', profileKind: 'mihomo' },
          {
            id: 'amnezia-1',
            type: 'local',
            name: 'Work VPN',
            profileKind: 'amnezia',
            importedSourceId: 'source-1',
            normalizedProfileId: 'normalized-1'
          }
        ],
        'amnezia-1'
      )
    )

    const mihomoPlan = createUnifiedRuleSavePlan({
      owner: owners[0],
      type: 'MATCH',
      value: '',
      target: 'PROXY'
    })
    const vpnPlan = createUnifiedRuleSavePlan({
      owner: owners[1],
      type: 'MATCH',
      value: '',
      target: 'PROXY'
    })

    assert.equal(mihomoPlan.serializedRule, 'MATCH,PROXY')
    assert.equal(vpnPlan.serializedRule, 'MATCH,PROXY')
    assert.equal(vpnPlan.userFacingTarget, 'VPN / PROXY')

    const rules = mapRulePatchesToUnifiedRules(owners, {
      'amnezia-1': { ...createEmptyUnifiedRulePatchFile(), prepend: ['MATCH,PROXY'] }
    })

    assert.equal(rules[0].type, 'MATCH')
    assert.equal(rules[0].value, '')
    assert.equal(rules[0].target, 'PROXY')
  })

  it('creates the RU bundle preset as a normal user-facing RULE-SET rule', () => {
    const owners = createUnifiedRuleOwners(
      createUnifiedProfileItems(
        [
          {
            id: 'amnezia-1',
            type: 'local',
            name: 'Work VPN',
            profileKind: 'amnezia',
            importedSourceId: 'source-1',
            normalizedProfileId: 'normalized-1'
          }
        ],
        'amnezia-1'
      )
    )
    const plan = createUnifiedRuleSavePlan({
      owner: owners[0],
      type: 'RULE-SET',
      value: 'ru-bundle',
      target: 'PROXY'
    })

    assert.equal(createKoalaRuBundleRule('PROXY'), 'RULE-SET,ru-bundle,PROXY')
    assert.equal(plan.serializedRule, 'RULE-SET,ru-bundle,PROXY')
    assert.equal(plan.userFacingTarget, 'VPN / PROXY')
  })

  it('pins RU bundle rules at the end of managed and runtime rule order', () => {
    const added = appendUnifiedManagedRule(
      {
        ...createEmptyUnifiedRulePatchFile(),
        prepend: ['DOMAIN-SUFFIX,linkedin.com,DIRECT']
      },
      'RULE-SET,ru-bundle,PROXY'
    )
    assert.equal(added.added, true)
    assert.deepEqual(added.patch.prepend, ['DOMAIN-SUFFIX,linkedin.com,DIRECT'])
    assert.deepEqual(added.patch.append, ['RULE-SET,ru-bundle,PROXY'])

    const patch = dedupeUnifiedRulePatchFile({
      ...createEmptyUnifiedRulePatchFile(),
      prepend: ['RULE-SET,ru-bundle,PROXY', 'DOMAIN-SUFFIX,linkedin.com,DIRECT'],
      append: ['IP-CIDR,95.161.76.100/32,DIRECT']
    })

    assert.deepEqual(patch.prepend, ['DOMAIN-SUFFIX,linkedin.com,DIRECT'])
    assert.deepEqual(patch.append, ['IP-CIDR,95.161.76.100/32,DIRECT', 'RULE-SET,ru-bundle,PROXY'])
    assert.deepEqual(
      pinKoalaRuBundleRulesLast([
        'RULE-SET,ru-bundle,DIRECT',
        'DOMAIN-SUFFIX,linkedin.com,DIRECT',
        'RULE-SET,ru-bundle,PROXY'
      ]),
      ['DOMAIN-SUFFIX,linkedin.com,DIRECT', 'RULE-SET,ru-bundle,PROXY']
    )
  })

  it('keeps AMNEZIA_HELPER internal in user-facing rule models', () => {
    assert.equal(isUserFacingRuleTarget('AMNEZIA_HELPER'), false)
    assert.equal(getUnifiedRuleDisplayTarget('amnezia', 'AMNEZIA_HELPER'), 'VPN / PROXY')

    const bundle = createUnifiedUiBundle({
      currentProfileId: 'amnezia-1',
      profileItems: [
        {
          id: 'amnezia-1',
          type: 'local',
          name: 'Imported Amnezia',
          profileKind: 'amnezia',
          importedSourceId: 'source-1',
          normalizedProfileId: 'normalized-1'
        }
      ],
      mihomoRules: [{ type: 'DOMAIN', payload: 'example.com', proxy: 'AMNEZIA_HELPER' }]
    })

    assert.equal(bundle.allRules[0].target, 'PROXY')
    assert.equal(bundle.allRules[0].internalTarget, 'AMNEZIA_HELPER')
    assert.equal(
      bundle.allRules.some((rule) => rule.target === 'AMNEZIA_HELPER'),
      false
    )
  })

  it('hides generated Amnezia TCP-only UDP guard rules from the normal rules list', () => {
    const bundle = createUnifiedUiBundle({
      currentProfileId: 'amnezia-1',
      profileItems: [
        {
          id: 'amnezia-1',
          type: 'local',
          name: 'Imported Amnezia',
          profileKind: 'amnezia',
          importedSourceId: 'source-1',
          normalizedProfileId: 'normalized-1'
        }
      ],
      mihomoRules: [
        {
          type: 'AND',
          payload: '((Network,udp) && (DstPort,443) && (DomainSuffix,linkedin.com))',
          proxy: 'REJECT'
        },
        { type: 'DOMAIN-SUFFIX', payload: 'linkedin.com', proxy: 'PROXY' }
      ]
    })

    assert.equal(
      isHiddenUnifiedRuntimeRule({
        id: 'runtime-guard',
        scopeId: 'amnezia',
        source: 'amnezia',
        ownerType: 'amnezia',
        type: 'AND',
        value: '((NETWORK,UDP),(DST-PORT,443),(DOMAIN-SUFFIX,linkedin.com))',
        target: 'REJECT',
        enabled: true,
        editable: false
      }),
      true
    )
    assert.equal(bundle.allRules.length, 1)
    assert.equal(bundle.allRules[0].type, 'DOMAIN-SUFFIX')
  })

  it('edits Mihomo-owned PROXY rules without changing owner', () => {
    const owners = createUnifiedRuleOwners(
      createUnifiedProfileItems(
        [{ id: 'mihomo-1', type: 'remote', name: 'Main Mihomo', profileKind: 'mihomo' }],
        'mihomo-1'
      )
    )
    const patch = {
      ...createEmptyUnifiedRulePatchFile(),
      prepend: ['DOMAIN-SUFFIX,linkedin.com,PROXY']
    }
    const next = replaceUnifiedManagedRule(patch, 'prepend', 0, {
      type: 'DOMAIN-SUFFIX',
      value: 'github.com',
      target: 'PROXY'
    })
    const rules = mapRulePatchesToUnifiedRules(owners, { 'mihomo-1': next })

    assert.deepEqual(next.prepend, ['DOMAIN-SUFFIX,github.com,PROXY'])
    assert.equal(rules[0].ownerType, 'mihomo')
    assert.equal(rules[0].ownerProfileId, 'mihomo-1')
    assert.equal(rules[0].target, 'PROXY')
  })

  it('edits VPN-owned PROXY rules while keeping VPN / PROXY display mapping', () => {
    const owners = createUnifiedRuleOwners(
      createUnifiedProfileItems(
        [
          {
            id: 'amnezia-1',
            type: 'local',
            name: 'Work VPN',
            profileKind: 'amnezia',
            importedSourceId: 'source-1',
            normalizedProfileId: 'normalized-1'
          }
        ],
        'amnezia-1'
      )
    )
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
    assert.equal(rules[0].ownerType, 'amnezia')
    assert.equal(getUnifiedRuleDisplayTarget(rules[0].ownerType, rules[0].target), 'VPN / PROXY')
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
    const targetPatch = createEmptyUnifiedRulePatchFile()
    const copied = duplicateUnifiedManagedRuleToOwner({
      sourcePatch,
      sourceSection: 'prepend',
      sourceIndex: 0,
      targetPatch
    })

    assert.deepEqual(sourcePatch.prepend, ['DOMAIN-SUFFIX,linkedin.com,PROXY'])
    assert.deepEqual(copied.prepend, ['DOMAIN-SUFFIX,linkedin.com,PROXY'])
  })

  it('prefers managed editable rules and keeps runtime-only rules read-only', () => {
    const owners = createUnifiedRuleOwners(
      createUnifiedProfileItems(
        [{ id: 'mihomo-1', type: 'remote', name: 'Main Mihomo', profileKind: 'mihomo' }],
        'mihomo-1'
      )
    )
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
        source: 'mihomo' as const,
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
    assert.equal(displayRules[0].managedPatchSection, 'prepend')
    assert.equal(displayRules[1].editable, false)
  })

  it('deduplicates managed rules against Mihomo API rule type casing', () => {
    const owners = createUnifiedRuleOwners(
      createUnifiedProfileItems(
        [
          {
            id: 'amnezia-1',
            type: 'local',
            name: 'Work VPN',
            profileKind: 'amnezia',
            importedSourceId: 'source-1',
            normalizedProfileId: 'normalized-1'
          }
        ],
        'amnezia-1'
      )
    )
    const managedRules = mapRulePatchesToUnifiedRules(owners, {
      'amnezia-1': {
        ...createEmptyUnifiedRulePatchFile(),
        prepend: ['DOMAIN-SUFFIX,www.linkedin.com,PROXY']
      }
    })
    const runtimeRules = [
      {
        ...managedRules[0],
        id: 'runtime-domainsuffix',
        type: 'DomainSuffix',
        editable: false,
        managedPatchSection: undefined,
        managedPatchIndex: undefined
      }
    ]
    const displayRules = createUnifiedRulesForDisplay({ runtimeRules, managedRules })

    assert.equal(displayRules.length, 1)
    assert.equal(displayRules[0].editable, true)
    assert.equal(displayRules[0].type, 'DOMAIN-SUFFIX')
  })

  it('selects only editable managed rules for bulk actions', () => {
    const owners = createUnifiedRuleOwners(
      createUnifiedProfileItems(
        [{ id: 'mihomo-1', type: 'remote', name: 'Main Mihomo', profileKind: 'mihomo' }],
        'mihomo-1'
      )
    )
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
    const owners = createUnifiedRuleOwners(
      createUnifiedProfileItems(
        [{ id: 'mihomo-1', type: 'remote', name: 'Main Mihomo', profileKind: 'mihomo' }],
        'mihomo-1'
      )
    )
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
    assert.deepEqual(enabled.prepend, [
      'DOMAIN,example.com,DIRECT',
      'DOMAIN-SUFFIX,linkedin.com,PROXY'
    ])
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
      append: ['RULE-SET,ru-bundle,PROXY']
    }

    const movedUp = moveUnifiedManagedRule(patch, 'prepend', 2, 'up')
    assert.deepEqual(movedUp.prepend, [
      'DOMAIN-SUFFIX,linkedin.com,PROXY',
      'PROCESS-NAME,Telegram,DIRECT',
      'DOMAIN-SUFFIX,youtube.com,PROXY'
    ])

    const movedDown = moveUnifiedManagedRule(movedUp, 'prepend', 1, 'down')
    assert.deepEqual(movedDown.prepend, patch.prepend)
    assert.deepEqual(movedDown.append, ['RULE-SET,ru-bundle,PROXY'])
    assert.deepEqual(moveUnifiedManagedRule(patch, 'prepend', 0, 'up').prepend, patch.prepend)
    assert.deepEqual(moveUnifiedManagedRule(patch, 'append', 0, 'up').append, patch.append)
  })

  it('bulk duplicates selected rules to an owner with owner-safe target validation', () => {
    const owners = createUnifiedRuleOwners(
      createUnifiedProfileItems(
        [
          { id: 'mihomo-1', type: 'remote', name: 'Main Mihomo', profileKind: 'mihomo' },
          {
            id: 'amnezia-1',
            type: 'local',
            name: 'Work VPN',
            profileKind: 'amnezia',
            importedSourceId: 'source-1',
            normalizedProfileId: 'normalized-1'
          }
        ],
        'mihomo-1'
      )
    )
    const sourcePatch = {
      ...createEmptyUnifiedRulePatchFile(),
      prepend: ['DOMAIN-SUFFIX,linkedin.com,PROXY', 'DOMAIN,example.com,CustomGroup']
    }
    const sourceRules = mapRulePatchesToUnifiedRules(owners, { 'mihomo-1': sourcePatch })
    const result = duplicateUnifiedManagedRulesToOwner({
      targetOwner: owners[1],
      targetPatch: createEmptyUnifiedRulePatchFile(),
      rules: sourceRules
    })

    assert.equal(result.added, 1)
    assert.equal(result.invalid.length, 1)
    assert.deepEqual(result.patch.prepend, ['DOMAIN-SUFFIX,linkedin.com,PROXY'])
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
    assert.deepEqual(result.patch.prepend, [
      'DOMAIN-SUFFIX,linkedin.com,PROXY',
      'DOMAIN-SUFFIX,github.com,PROXY'
    ])
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
    assert.deepEqual(result.patch.prepend, ['MATCH,PROXY'])
  })

  it('imports process-name rules with spaces for VPN and Mihomo owners', () => {
    const vpnResult = importUnifiedRulesToPatch({
      patch: createEmptyUnifiedRulePatchFile(),
      type: 'PROCESS-NAME',
      target: 'PROXY',
      text: 'Yandex Helper\nChatGPT'
    })

    assert.equal(vpnResult.added, 2)
    assert.equal(vpnResult.invalid.length, 0)
    assert.deepEqual(vpnResult.patch.prepend, [
      'PROCESS-NAME,Yandex Helper,PROXY',
      'PROCESS-NAME,ChatGPT,PROXY'
    ])

    const mihomoResult = appendUnifiedManagedRule(
      createEmptyUnifiedRulePatchFile(),
      'PROCESS-NAME,Yandex Helper,PROXY'
    )

    assert.equal(mihomoResult.added, true)
    assert.deepEqual(mihomoResult.patch.prepend, ['PROCESS-NAME,Yandex Helper,PROXY'])
  })

  it('prevents duplicate managed rule appends from stale UI state', () => {
    const patch = {
      ...createEmptyUnifiedRulePatchFile(),
      prepend: ['DOMAIN-SUFFIX,linkedin.com,PROXY']
    }

    const result = appendUnifiedManagedRule(patch, 'DOMAIN-SUFFIX,linkedin.com,PROXY')

    assert.equal(result.added, false)
    assert.deepEqual(result.patch.prepend, ['DOMAIN-SUFFIX,linkedin.com,PROXY'])
  })

  it('normalizes duplicate managed rules with disabled rules taking precedence', () => {
    const normalized = dedupeUnifiedRulePatchFile({
      prepend: [
        'DOMAIN-SUFFIX,linkedin.com,PROXY',
        'DOMAIN-SUFFIX,linkedin.com,PROXY',
        'DOMAIN-SUFFIX,github.com,PROXY'
      ],
      append: ['DOMAIN-SUFFIX,github.com,PROXY', 'DOMAIN-SUFFIX,example.com,DIRECT'],
      delete: [],
      disabled: ['DOMAIN-SUFFIX,linkedin.com,PROXY', 'DOMAIN-SUFFIX,linkedin.com,PROXY']
    })

    assert.deepEqual(normalized.prepend, ['DOMAIN-SUFFIX,github.com,PROXY'])
    assert.deepEqual(normalized.append, ['DOMAIN-SUFFIX,example.com,DIRECT'])
    assert.deepEqual(normalized.disabled, ['DOMAIN-SUFFIX,linkedin.com,PROXY'])
  })

  it('imports app-owned JSON export into an explicit owner/action context', () => {
    const exported = JSON.stringify({
      format: 'koala-clash.unified-rules',
      version: 1,
      exportedAt: '2026-04-27T00:00:00.000Z',
      rules: [{ type: 'DOMAIN', value: 'example.com', target: 'PROXY' }]
    })
    const result = importUnifiedRulesToPatch({
      patch: createEmptyUnifiedRulePatchFile(),
      type: 'DOMAIN-SUFFIX',
      target: 'REJECT',
      text: exported
    })

    assert.equal(result.added, 1)
    assert.deepEqual(result.patch.prepend, ['DOMAIN,example.com,REJECT'])
  })

  it('exports app-owned JSON without exposing internal helper targets', () => {
    const owners = createUnifiedRuleOwners(
      createUnifiedProfileItems(
        [
          {
            id: 'amnezia-1',
            type: 'local',
            name: 'Work VPN',
            profileKind: 'amnezia',
            importedSourceId: 'source-1',
            normalizedProfileId: 'normalized-1'
          }
        ],
        'amnezia-1'
      )
    )
    const rules = mapRulePatchesToUnifiedRules(owners, {
      'amnezia-1': {
        ...createEmptyUnifiedRulePatchFile(),
        prepend: ['DOMAIN-SUFFIX,linkedin.com,AMNEZIA_HELPER']
      }
    })
    const document = createUnifiedRulesExportDocument(rules, new Date('2026-04-27T00:00:00.000Z'))

    assert.equal(document.format, 'koala-clash.unified-rules')
    assert.equal(document.rules[0].target, 'PROXY')
    assert.equal(document.rules[0].displayTarget, 'VPN / PROXY')
    assert.equal(JSON.stringify(document).includes('AMNEZIA_HELPER'), false)
  })

  it('detects hidden legacy helper rules without exposing them in normal rules', () => {
    const bundle = createUnifiedUiBundle({
      amneziaRulePacks: [
        {
          id: 'default',
          name: 'Default',
          enabled: true,
          rules: [
            {
              id: 'legacy-1',
              type: 'DOMAIN-SUFFIX',
              value: 'legacy.example',
              enabled: true,
              target: 'AMNEZIA_HELPER'
            }
          ]
        }
      ]
    })

    assert.equal(bundle.legacyHelperRules.totalRules, 1)
    assert.equal(bundle.legacyHelperRules.enabledRules, 1)
    assert.equal(
      bundle.allRules.some((rule) => rule.target === 'AMNEZIA_HELPER'),
      false
    )
  })

  it('aggregates support summary status with blocker precedence', () => {
    const summary = createUnifiedSupportSummary({
      mihomo: { running: true, tunEnabled: true },
      amnezia: {
        readinessSummary: {
          overallStatus: 'ready_with_warnings',
          helperStatus: 'ready',
          tunStatus: 'ready',
          dnsRuleReliabilityStatus: 'warning',
          udpStatus: 'warning',
          releaseStatus: 'warning',
          topIssues: [{ code: 'udp_tcp_only', message: 'TCP-only' }],
          recommendedActions: [{ code: 'validate_udp', message: 'Validate UDP' }]
        }
      }
    })

    assert.equal(summary.overallStatus, 'warning')
    assert.equal(summary.mihomoStatus, 'ready')
    assert.equal(summary.udpStatus, 'warning')
    assert.deepEqual(summary.topIssues, ['udp_tcp_only'])
    assert.deepEqual(summary.recommendedActions, ['validate_udp'])

    const blocked = createUnifiedSupportSummary({
      mihomo: { running: false },
      amnezia: {
        readinessSummary: {
          overallStatus: 'ready',
          helperStatus: 'ready',
          tunStatus: 'ready',
          dnsRuleReliabilityStatus: 'ready',
          udpStatus: 'ready',
          releaseStatus: 'supported'
        }
      }
    })

    assert.equal(blocked.overallStatus, 'blocked')
    assert.deepEqual(blocked.topIssues, ['mihomo_not_running'])
  })
})
