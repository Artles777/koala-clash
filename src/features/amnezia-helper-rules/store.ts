import { existsSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import YAML from 'yaml'
import {
  AmneziaHelperRule,
  AmneziaHelperRuleInput,
  AmneziaHelperRulePatch,
  createAmneziaHelperRule,
  normalizeAmneziaHelperRule
} from '../../core/routing/amnezia-helper-rules'
import {
  addBulkAmneziaHelperRulesToPack,
  AmneziaHelperRuleBulkInput,
  AmneziaHelperRuleBulkResult,
  AmneziaHelperRulePack,
  AmneziaHelperRulePackImportResult,
  AmneziaHelperRulePackInput,
  AmneziaHelperRulePackOptions,
  AmneziaHelperRulePackPatch,
  AmneziaHelperRulePacksState,
  assertValidRuleAgainstState,
  createAmneziaHelperRulePack,
  DEFAULT_AMNEZIA_HELPER_RULE_PACK_ID,
  exportAmneziaHelperRulePacks,
  flattenAmneziaHelperRulePacks,
  importAmneziaHelperRulePacksIntoState,
  normalizeAmneziaHelperRulePack,
  normalizeAmneziaHelperRulePacksState
} from '../../core/routing/amnezia-helper-rule-packs'

export type AmneziaHelperRulesStore = AmneziaHelperRulePacksState

export type AmneziaHelperRuleStoreOptions = AmneziaHelperRulePackOptions

export async function readAmneziaHelperRulesStore(path: string): Promise<AmneziaHelperRulesStore> {
  if (!existsSync(path)) return normalizeAmneziaHelperRulePacksState({})

  const content = await readFile(path, 'utf-8')
  const parsed = YAML.parse(content) as
    | (Partial<AmneziaHelperRulesStore> & { items?: AmneziaHelperRule[] })
    | null
  if (!parsed || typeof parsed !== 'object') {
    return normalizeAmneziaHelperRulePacksState({})
  }

  return normalizeAmneziaHelperRulePacksState(parsed)
}

export async function writeAmneziaHelperRulesStore(
  path: string,
  store: AmneziaHelperRulesStore
): Promise<void> {
  const normalized = normalizeAmneziaHelperRulePacksState(store)
  await writeFile(
    path,
    YAML.stringify({
      version: normalized.version,
      packs: normalized.packs.map((pack) => normalizeAmneziaHelperRulePack(pack))
    }),
    'utf-8'
  )
}

export function getAmneziaHelperRulePacksFromStore(
  store: AmneziaHelperRulesStore
): AmneziaHelperRulePack[] {
  return normalizeAmneziaHelperRulePacksState(store).packs
}

export function getAmneziaHelperRulesFromStore(
  store: AmneziaHelperRulesStore,
  options: { enabledPacksOnly?: boolean } = {}
): AmneziaHelperRule[] {
  return flattenAmneziaHelperRulePacks(normalizeAmneziaHelperRulePacksState(store).packs, options)
}

export function addAmneziaHelperRulePackToStore(
  store: AmneziaHelperRulesStore,
  input: AmneziaHelperRulePackInput,
  options: AmneziaHelperRuleStoreOptions = {}
): { store: AmneziaHelperRulesStore; pack: AmneziaHelperRulePack } {
  const normalizedStore = normalizeAmneziaHelperRulePacksState(store)
  const now = options.now?.() ?? Date.now()
  const pack = createAmneziaHelperRulePack({
    id: options.id?.() ?? `amnezia-helper-pack-${now.toString(16)}`,
    name: input.name,
    enabled: input.enabled,
    note: input.note,
    now
  })

  if (
    normalizedStore.packs.some(
      (existing) => existing.name.toLowerCase() === pack.name.toLowerCase()
    )
  ) {
    throw new Error('A helper rule pack with the same name already exists')
  }

  return {
    store: {
      version: 2,
      packs: [...normalizedStore.packs, pack]
    },
    pack
  }
}

export function updateAmneziaHelperRulePackInStore(
  store: AmneziaHelperRulesStore,
  id: string,
  patch: AmneziaHelperRulePackPatch,
  options: Pick<AmneziaHelperRuleStoreOptions, 'now'> = {}
): { store: AmneziaHelperRulesStore; pack: AmneziaHelperRulePack } {
  const normalizedStore = normalizeAmneziaHelperRulePacksState(store)
  const index = normalizedStore.packs.findIndex((pack) => pack.id === id)
  if (index === -1) {
    throw new Error('Amnezia helper rule pack not found')
  }

  const next = normalizeAmneziaHelperRulePack({
    ...normalizedStore.packs[index],
    ...patch,
    updatedAt: options.now?.() ?? Date.now()
  })

  if (
    normalizedStore.packs.some(
      (pack) => pack.id !== id && pack.name.toLowerCase() === next.name.toLowerCase()
    )
  ) {
    throw new Error('A helper rule pack with the same name already exists')
  }

  const packs = [...normalizedStore.packs]
  packs[index] = next

  return {
    store: {
      version: 2,
      packs
    },
    pack: next
  }
}

export function addAmneziaHelperRuleToStore(
  store: AmneziaHelperRulesStore,
  input: AmneziaHelperRuleInput,
  options: AmneziaHelperRuleStoreOptions = {}
): { store: AmneziaHelperRulesStore; rule: AmneziaHelperRule } {
  const normalizedStore = normalizeAmneziaHelperRulePacksState(store)
  const packId = input.packId ?? DEFAULT_AMNEZIA_HELPER_RULE_PACK_ID
  const packIndex = normalizedStore.packs.findIndex((pack) => pack.id === packId)
  if (packIndex === -1) {
    throw new Error('Amnezia helper rule pack not found')
  }

  const now = options.now?.() ?? Date.now()
  const rule = createAmneziaHelperRule({
    id: options.id?.() ?? `amnezia-helper-rule-${now.toString(16)}`,
    type: input.type,
    value: input.value,
    enabled: input.enabled,
    note: input.note,
    now
  })
  const validRule = assertValidRuleAgainstState(normalizedStore, rule)
  const packs = [...normalizedStore.packs]
  packs[packIndex] = {
    ...packs[packIndex],
    rules: [...packs[packIndex].rules, validRule],
    updatedAt: now
  }

  return {
    store: {
      version: 2,
      packs
    },
    rule: validRule
  }
}

export function updateAmneziaHelperRuleInStore(
  store: AmneziaHelperRulesStore,
  id: string,
  patch: AmneziaHelperRulePatch,
  options: Pick<AmneziaHelperRuleStoreOptions, 'now'> = {}
): { store: AmneziaHelperRulesStore; rule: AmneziaHelperRule } {
  const normalizedStore = normalizeAmneziaHelperRulePacksState(store)
  const location = findRuleLocation(normalizedStore, id)
  if (!location) {
    throw new Error('Amnezia helper rule not found')
  }

  const current = normalizedStore.packs[location.packIndex].rules[location.ruleIndex]
  const next = normalizeAmneziaHelperRule({
    ...current,
    ...patch,
    target: current.target,
    updatedAt: options.now?.() ?? Date.now()
  })
  const validRule = assertValidRuleAgainstState(normalizedStore, next)
  const packs = [...normalizedStore.packs]
  const rules = [...packs[location.packIndex].rules]
  rules[location.ruleIndex] = validRule
  packs[location.packIndex] = {
    ...packs[location.packIndex],
    rules,
    updatedAt: options.now?.() ?? Date.now()
  }

  return {
    store: {
      version: 2,
      packs
    },
    rule: validRule
  }
}

export function removeAmneziaHelperRuleFromStore(
  store: AmneziaHelperRulesStore,
  id: string
): { store: AmneziaHelperRulesStore; removed: boolean } {
  const normalizedStore = normalizeAmneziaHelperRulePacksState(store)
  const packs = normalizedStore.packs.map((pack) => ({
    ...pack,
    rules: pack.rules.filter((rule) => rule.id !== id)
  }))
  const removed =
    flattenAmneziaHelperRulePacks(packs).length !==
    flattenAmneziaHelperRulePacks(normalizedStore.packs).length

  return {
    store: {
      version: 2,
      packs
    },
    removed
  }
}

export function bulkAddAmneziaHelperRulesToStore(
  store: AmneziaHelperRulesStore,
  input: AmneziaHelperRuleBulkInput,
  options: AmneziaHelperRuleStoreOptions = {}
): { store: AmneziaHelperRulesStore; result: AmneziaHelperRuleBulkResult } {
  const result = addBulkAmneziaHelperRulesToPack(store, input, options)
  return {
    store: result.state,
    result: result.result
  }
}

export function exportAmneziaHelperRulesStore(
  store: AmneziaHelperRulesStore,
  now = Date.now()
): string {
  return YAML.stringify(exportAmneziaHelperRulePacks(store, now))
}

export function importAmneziaHelperRulesStore(
  store: AmneziaHelperRulesStore,
  content: string,
  options: AmneziaHelperRuleStoreOptions = {}
): { store: AmneziaHelperRulesStore; result: AmneziaHelperRulePackImportResult } {
  let parsed: unknown
  try {
    parsed = YAML.parse(content)
  } catch {
    parsed = undefined
  }
  const result = importAmneziaHelperRulePacksIntoState(store, parsed, options)
  return {
    store: result.state,
    result: result.result
  }
}

function findRuleLocation(
  store: AmneziaHelperRulesStore,
  id: string
): { packIndex: number; ruleIndex: number } | undefined {
  for (let packIndex = 0; packIndex < store.packs.length; packIndex += 1) {
    const ruleIndex = store.packs[packIndex].rules.findIndex((rule) => rule.id === id)
    if (ruleIndex !== -1) return { packIndex, ruleIndex }
  }

  return undefined
}
