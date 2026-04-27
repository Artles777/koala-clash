import {
  AMNEZIA_HELPER_RULE_TARGET,
  AmneziaHelperRule,
  AmneziaHelperRuleType,
  assertValidAmneziaHelperRule,
  createAmneziaHelperRule,
  normalizeAmneziaHelperRule,
  validateAmneziaHelperRule
} from './amnezia-helper-rules'

export const AMNEZIA_HELPER_RULE_PACK_FORMAT = 'koala-clash.amnezia-helper-rule-packs'
export const AMNEZIA_HELPER_RULE_PACK_VERSION = 1
export const DEFAULT_AMNEZIA_HELPER_RULE_PACK_ID = 'default'
export const DEFAULT_AMNEZIA_HELPER_RULE_PACK_NAME = 'Default'

export interface AmneziaHelperRulePack {
  id: string
  name: string
  enabled: boolean
  note?: string
  rules: AmneziaHelperRule[]
  createdAt: number
  updatedAt?: number
}

export interface AmneziaHelperRulePackInput {
  name: string
  enabled?: boolean
  note?: string
}

export interface AmneziaHelperRulePackPatch {
  name?: string
  enabled?: boolean
  note?: string
}

export interface AmneziaHelperRulePacksState {
  version: 2
  packs: AmneziaHelperRulePack[]
}

export type AmneziaHelperRuleBulkIssueCode =
  | 'empty_value'
  | 'invalid_value'
  | 'duplicate_input'
  | 'duplicate_existing'
  | 'invalid_type'
  | 'pack_not_found'
  | 'invalid_pack'
  | 'invalid_format'

export interface AmneziaHelperRuleBulkIssue {
  code: AmneziaHelperRuleBulkIssueCode
  line?: number
  value?: string
  type?: AmneziaHelperRuleType
  packName?: string
  message: string
}

export interface AmneziaHelperRuleBulkInput {
  packId?: string
  type: AmneziaHelperRuleType
  text: string
  enabled?: boolean
  note?: string
}

export interface AmneziaHelperRuleBulkResult {
  packId: string
  added: AmneziaHelperRule[]
  skipped: AmneziaHelperRuleBulkIssue[]
  invalid: AmneziaHelperRuleBulkIssue[]
  summary: {
    added: number
    skipped: number
    invalid: number
  }
}

export interface AmneziaHelperRulePackImportExportRule {
  type: AmneziaHelperRuleType
  value: string
  enabled?: boolean
  note?: string
}

export interface AmneziaHelperRulePackImportExportPack {
  name: string
  enabled?: boolean
  note?: string
  rules: AmneziaHelperRulePackImportExportRule[]
}

export interface AmneziaHelperRulePackExport {
  format: typeof AMNEZIA_HELPER_RULE_PACK_FORMAT
  version: typeof AMNEZIA_HELPER_RULE_PACK_VERSION
  exportedAt: number
  packs: AmneziaHelperRulePackImportExportPack[]
}

export interface AmneziaHelperRulePackImportResult {
  added: AmneziaHelperRule[]
  skipped: AmneziaHelperRuleBulkIssue[]
  invalid: AmneziaHelperRuleBulkIssue[]
  summary: {
    addedPacks: number
    mergedPacks: number
    addedRules: number
    skippedRules: number
    invalidRules: number
  }
}

export interface AmneziaHelperRulePackOptions {
  id?: () => string
  now?: () => number
}

export function createDefaultAmneziaHelperRulePack(
  rules: AmneziaHelperRule[] = [],
  now = Date.now()
): AmneziaHelperRulePack {
  return normalizeAmneziaHelperRulePack({
    id: DEFAULT_AMNEZIA_HELPER_RULE_PACK_ID,
    name: DEFAULT_AMNEZIA_HELPER_RULE_PACK_NAME,
    enabled: true,
    rules,
    createdAt: now
  })
}

export function createAmneziaHelperRulePack(
  input: AmneziaHelperRulePackInput & { id: string; now?: number }
): AmneziaHelperRulePack {
  const now = input.now ?? Date.now()

  return normalizeAmneziaHelperRulePack({
    id: input.id,
    name: input.name,
    enabled: input.enabled ?? true,
    note: input.note,
    rules: [],
    createdAt: now
  })
}

export function normalizeAmneziaHelperRulePack(pack: AmneziaHelperRulePack): AmneziaHelperRulePack {
  const name = pack.name.trim() || DEFAULT_AMNEZIA_HELPER_RULE_PACK_NAME
  const note = pack.note?.trim()

  return {
    ...pack,
    name,
    enabled: pack.enabled ?? true,
    note: note || undefined,
    rules: Array.isArray(pack.rules) ? pack.rules.map(normalizeAmneziaHelperRule) : []
  }
}

export function normalizeAmneziaHelperRulePacksState(
  state: Partial<AmneziaHelperRulePacksState> & { items?: AmneziaHelperRule[] },
  now = Date.now()
): AmneziaHelperRulePacksState {
  if (Array.isArray(state.packs) && state.packs.length > 0) {
    return {
      version: 2,
      packs: state.packs.map(normalizeAmneziaHelperRulePack)
    }
  }

  return {
    version: 2,
    packs: [createDefaultAmneziaHelperRulePack(Array.isArray(state.items) ? state.items : [], now)]
  }
}

export function flattenAmneziaHelperRulePacks(
  packs: AmneziaHelperRulePack[],
  options: { enabledPacksOnly?: boolean } = {}
): AmneziaHelperRule[] {
  const rules: AmneziaHelperRule[] = []

  for (const pack of packs.map(normalizeAmneziaHelperRulePack)) {
    if (options.enabledPacksOnly && !pack.enabled) continue
    rules.push(...pack.rules)
  }

  return rules
}

export function parseAmneziaHelperRuleBulkValues(text: string): Array<{
  line: number
  value: string
}> {
  return text.split(/\r?\n/).flatMap((line, index) =>
    line
      .split(',')
      .map((value) => ({
        line: index + 1,
        value: value.trim()
      }))
      .filter((entry) => entry.value.length > 0)
  )
}

export function addBulkAmneziaHelperRulesToPack(
  state: AmneziaHelperRulePacksState,
  input: AmneziaHelperRuleBulkInput,
  options: AmneziaHelperRulePackOptions = {}
): { state: AmneziaHelperRulePacksState; result: AmneziaHelperRuleBulkResult } {
  const normalizedState = normalizeAmneziaHelperRulePacksState(state)
  const packId = input.packId ?? DEFAULT_AMNEZIA_HELPER_RULE_PACK_ID
  const packIndex = normalizedState.packs.findIndex((pack) => pack.id === packId)

  if (packIndex === -1) {
    const issue: AmneziaHelperRuleBulkIssue = {
      code: 'pack_not_found',
      message: 'Amnezia helper rule pack not found'
    }
    return {
      state: normalizedState,
      result: createBulkResult(packId, [], [], [issue])
    }
  }

  const now = options.now?.() ?? Date.now()
  const values = parseAmneziaHelperRuleBulkValues(input.text)
  const added: AmneziaHelperRule[] = []
  const skipped: AmneziaHelperRuleBulkIssue[] = []
  const invalid: AmneziaHelperRuleBulkIssue[] = []
  const seenInput = new Set<string>()
  const existingRules = flattenAmneziaHelperRulePacks(normalizedState.packs)

  for (const entry of values) {
    const key = createRuleKey(input.type, entry.value)
    if (seenInput.has(key)) {
      skipped.push({
        code: 'duplicate_input',
        line: entry.line,
        value: entry.value,
        type: input.type,
        message: 'Duplicate entry in pasted input'
      })
      continue
    }
    seenInput.add(key)

    const rule = createAmneziaHelperRule({
      id: options.id?.() ?? `amnezia-helper-rule-${now.toString(16)}-${added.length}`,
      type: input.type,
      value: entry.value,
      enabled: input.enabled,
      note: input.note,
      now
    })
    const issues = validateAmneziaHelperRule(rule, [...existingRules, ...added])

    if (issues.some((issue) => issue.code === 'duplicate_rule')) {
      skipped.push({
        code: 'duplicate_existing',
        line: entry.line,
        value: entry.value,
        type: input.type,
        message: 'A helper rule with the same type and value already exists'
      })
      continue
    }

    if (issues.length > 0) {
      invalid.push({
        code: issues[0].code === 'invalid_type' ? 'invalid_type' : 'invalid_value',
        line: entry.line,
        value: entry.value,
        type: input.type,
        message: issues[0].message
      })
      continue
    }

    added.push(rule)
  }

  const packs = [...normalizedState.packs]
  packs[packIndex] = {
    ...packs[packIndex],
    rules: [...packs[packIndex].rules, ...added],
    updatedAt: added.length > 0 ? now : packs[packIndex].updatedAt
  }

  return {
    state: {
      version: 2,
      packs
    },
    result: createBulkResult(packId, added, skipped, invalid)
  }
}

export function exportAmneziaHelperRulePacks(
  state: AmneziaHelperRulePacksState,
  exportedAt = Date.now()
): AmneziaHelperRulePackExport {
  const normalizedState = normalizeAmneziaHelperRulePacksState(state)

  return {
    format: AMNEZIA_HELPER_RULE_PACK_FORMAT,
    version: AMNEZIA_HELPER_RULE_PACK_VERSION,
    exportedAt,
    packs: normalizedState.packs.map((pack) => ({
      name: pack.name,
      enabled: pack.enabled,
      note: pack.note,
      rules: pack.rules.map((rule) => ({
        type: rule.type,
        value: rule.value,
        enabled: rule.enabled,
        note: rule.note
      }))
    }))
  }
}

export function importAmneziaHelperRulePacksIntoState(
  state: AmneziaHelperRulePacksState,
  input: unknown,
  options: AmneziaHelperRulePackOptions = {}
): { state: AmneziaHelperRulePacksState; result: AmneziaHelperRulePackImportResult } {
  const normalizedState = normalizeAmneziaHelperRulePacksState(state)
  const parsed = normalizeImportPayload(input)

  if (!parsed) {
    const invalid = [
      {
        code: 'invalid_format' as const,
        message: 'Imported helper rule pack state is not valid'
      }
    ]
    return {
      state: normalizedState,
      result: createImportResult([], [], invalid, 0, 0)
    }
  }

  const packs = normalizedState.packs.map(normalizeAmneziaHelperRulePack)
  const added: AmneziaHelperRule[] = []
  const skipped: AmneziaHelperRuleBulkIssue[] = []
  const invalid: AmneziaHelperRuleBulkIssue[] = []
  let addedPacks = 0
  let mergedPacks = 0

  for (const importedPack of parsed.packs) {
    const name = importedPack.name.trim()
    if (!name) {
      invalid.push({
        code: 'invalid_pack',
        packName: importedPack.name,
        message: 'Imported helper rule pack name is required'
      })
      continue
    }

    const now = options.now?.() ?? Date.now()
    let packIndex = packs.findIndex((pack) => pack.name.toLowerCase() === name.toLowerCase())
    if (packIndex === -1) {
      packs.push(
        createAmneziaHelperRulePack({
          id: options.id?.() ?? `amnezia-helper-pack-${now.toString(16)}-${packs.length}`,
          name,
          enabled: importedPack.enabled,
          note: importedPack.note,
          now
        })
      )
      packIndex = packs.length - 1
      addedPacks += 1
    } else {
      mergedPacks += 1
    }

    const existingRules = () => flattenAmneziaHelperRulePacks(packs)
    for (const importedRule of importedPack.rules) {
      const rule = createAmneziaHelperRule({
        id: options.id?.() ?? `amnezia-helper-rule-${now.toString(16)}-${added.length}`,
        type: importedRule.type,
        value: importedRule.value,
        enabled: importedRule.enabled,
        note: importedRule.note,
        now
      })
      const issues = validateAmneziaHelperRule(rule, existingRules())

      if (issues.some((issue) => issue.code === 'duplicate_rule')) {
        skipped.push({
          code: 'duplicate_existing',
          value: importedRule.value,
          type: importedRule.type,
          packName: name,
          message: 'A helper rule with the same type and value already exists'
        })
        continue
      }

      if (issues.length > 0) {
        invalid.push({
          code: issues[0].code === 'invalid_type' ? 'invalid_type' : 'invalid_value',
          value: importedRule.value,
          type: importedRule.type,
          packName: name,
          message: issues[0].message
        })
        continue
      }

      packs[packIndex] = {
        ...packs[packIndex],
        rules: [...packs[packIndex].rules, rule],
        updatedAt: now
      }
      added.push(rule)
    }
  }

  return {
    state: {
      version: 2,
      packs
    },
    result: createImportResult(added, skipped, invalid, addedPacks, mergedPacks)
  }
}

export function assertValidRuleAgainstState(
  state: AmneziaHelperRulePacksState,
  rule: AmneziaHelperRule
): AmneziaHelperRule {
  return assertValidAmneziaHelperRule(rule, flattenAmneziaHelperRulePacks(state.packs))
}

function normalizeImportPayload(input: unknown): AmneziaHelperRulePackExport | undefined {
  if (!input || typeof input !== 'object') return undefined
  const candidate = input as Partial<AmneziaHelperRulePackExport> & {
    packs?: Array<Partial<AmneziaHelperRulePackImportExportPack>>
    items?: AmneziaHelperRule[]
  }

  if (Array.isArray(candidate.items)) {
    return exportAmneziaHelperRulePacks(
      normalizeAmneziaHelperRulePacksState({ items: candidate.items }),
      Date.now()
    )
  }

  if (!Array.isArray(candidate.packs)) return undefined

  return {
    format: AMNEZIA_HELPER_RULE_PACK_FORMAT,
    version: AMNEZIA_HELPER_RULE_PACK_VERSION,
    exportedAt: Date.now(),
    packs: candidate.packs.map((pack) => ({
      name: typeof pack.name === 'string' ? pack.name : '',
      enabled: typeof pack.enabled === 'boolean' ? pack.enabled : true,
      note: typeof pack.note === 'string' ? pack.note : undefined,
      rules: Array.isArray(pack.rules)
        ? pack.rules.map((rule) => ({
            type: rule.type as AmneziaHelperRuleType,
            value: typeof rule.value === 'string' ? rule.value : '',
            enabled: typeof rule.enabled === 'boolean' ? rule.enabled : true,
            note: typeof rule.note === 'string' ? rule.note : undefined
          }))
        : []
    }))
  }
}

function createBulkResult(
  packId: string,
  added: AmneziaHelperRule[],
  skipped: AmneziaHelperRuleBulkIssue[],
  invalid: AmneziaHelperRuleBulkIssue[]
): AmneziaHelperRuleBulkResult {
  return {
    packId,
    added,
    skipped,
    invalid,
    summary: {
      added: added.length,
      skipped: skipped.length,
      invalid: invalid.length
    }
  }
}

function createImportResult(
  added: AmneziaHelperRule[],
  skipped: AmneziaHelperRuleBulkIssue[],
  invalid: AmneziaHelperRuleBulkIssue[],
  addedPacks: number,
  mergedPacks: number
): AmneziaHelperRulePackImportResult {
  return {
    added,
    skipped,
    invalid,
    summary: {
      addedPacks,
      mergedPacks,
      addedRules: added.length,
      skippedRules: skipped.length,
      invalidRules: invalid.length
    }
  }
}

function createRuleKey(type: AmneziaHelperRuleType, value: string): string {
  return `${type}:${value.trim().toLowerCase()}:${AMNEZIA_HELPER_RULE_TARGET}`
}
