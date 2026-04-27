import { randomUUID } from 'crypto'
import {
  AmneziaHelperRule,
  AmneziaHelperRuleInput,
  AmneziaHelperRulePatch
} from '../../core/routing/amnezia-helper-rules'
import {
  AmneziaHelperRuleBulkInput,
  AmneziaHelperRuleBulkResult,
  AmneziaHelperRulePack,
  AmneziaHelperRulePackImportResult,
  AmneziaHelperRulePackInput,
  AmneziaHelperRulePackPatch
} from '../../core/routing/amnezia-helper-rule-packs'
import {
  addAmneziaHelperRuleToStore,
  addAmneziaHelperRulePackToStore,
  AmneziaHelperRulesStore,
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
} from '../../features/amnezia-helper-rules/store'
import { amneziaHelperRulesPath } from '../utils/dirs'

export async function getAmneziaHelperRules(): Promise<AmneziaHelperRule[]> {
  const store = await readStore()
  return getAmneziaHelperRulesFromStore(store, { enabledPacksOnly: true })
}

export async function getAmneziaHelperRulePacks(): Promise<AmneziaHelperRulePack[]> {
  const store = await readStore()
  return getAmneziaHelperRulePacksFromStore(store)
}

export async function addAmneziaHelperRulePack(
  input: AmneziaHelperRulePackInput
): Promise<AmneziaHelperRulePack> {
  const store = await readStore()
  const result = addAmneziaHelperRulePackToStore(store, input, {
    id: randomUUID,
    now: Date.now
  })
  await writeStoreAndReload(result.store)
  return result.pack
}

export async function updateAmneziaHelperRulePack(
  id: string,
  patch: AmneziaHelperRulePackPatch
): Promise<AmneziaHelperRulePack> {
  const store = await readStore()
  const result = updateAmneziaHelperRulePackInStore(store, id, patch, {
    now: Date.now
  })
  await writeStoreAndReload(result.store)
  return result.pack
}

export async function addAmneziaHelperRule(
  input: AmneziaHelperRuleInput
): Promise<AmneziaHelperRule> {
  const store = await readStore()
  const result = addAmneziaHelperRuleToStore(store, input, {
    id: randomUUID,
    now: Date.now
  })
  await writeStoreAndReload(result.store)
  return result.rule
}

export async function updateAmneziaHelperRule(
  id: string,
  patch: AmneziaHelperRulePatch
): Promise<AmneziaHelperRule> {
  const store = await readStore()
  const result = updateAmneziaHelperRuleInStore(store, id, patch, {
    now: Date.now
  })
  await writeStoreAndReload(result.store)
  return result.rule
}

export async function removeAmneziaHelperRule(id: string): Promise<void> {
  const store = await readStore()
  const result = removeAmneziaHelperRuleFromStore(store, id)
  if (!result.removed) return

  await writeStoreAndReload(result.store)
}

export async function bulkAddAmneziaHelperRules(
  input: AmneziaHelperRuleBulkInput
): Promise<AmneziaHelperRuleBulkResult> {
  const store = await readStore()
  const result = bulkAddAmneziaHelperRulesToStore(store, input, {
    id: randomUUID,
    now: Date.now
  })
  if (result.result.added.length > 0) {
    await writeStoreAndReload(result.store)
  }
  return result.result
}

export async function exportAmneziaHelperRulePacks(): Promise<string> {
  const store = await readStore()
  return exportAmneziaHelperRulesStore(store, Date.now())
}

export async function importAmneziaHelperRulePacks(
  content: string
): Promise<AmneziaHelperRulePackImportResult> {
  const store = await readStore()
  const result = importAmneziaHelperRulesStore(store, content, {
    id: randomUUID,
    now: Date.now
  })
  if (result.result.summary.addedPacks > 0 || result.result.summary.addedRules > 0) {
    await writeStoreAndReload(result.store)
  }
  return result.result
}

async function readStore(): Promise<AmneziaHelperRulesStore> {
  return readAmneziaHelperRulesStore(amneziaHelperRulesPath())
}

async function writeStoreAndReload(store: AmneziaHelperRulesStore): Promise<void> {
  await writeAmneziaHelperRulesStore(amneziaHelperRulesPath(), store)

  try {
    const { mihomoHotReloadConfig } = await import('../core/mihomoApi')
    await mihomoHotReloadConfig()
  } catch {
    // Core may be stopped; the next runtime config generation will include the saved rules.
  }
}
