import {
  isKoalaRuBundleRuleString,
  pinKoalaRuBundleRulesLast
} from '../routing/mihomo-rule-provider-presets'
import {
  createRealtimePresetRules,
  DISCORD_REALTIME_PRESET_ID,
  getRealtimePresetDefinition
} from '../routing/realtime-reliability'
import {
  getUnifiedRuleDisplayTarget,
  isHiddenUnifiedRuntimeRule,
  isUserFacingRuleTarget,
  normalizeUnifiedRuleType,
  UnifiedRuleItem,
  UnifiedRuleOwner
} from './unified-ui'

export type UnifiedRulePatchSection = 'prepend' | 'append' | 'disabled'
export type UnifiedRulesExportFormat = 'koala-clash.unified-rules'

export interface UnifiedRulePatchFile {
  prepend: string[]
  append: string[]
  delete: string[]
  disabled: string[]
}

export interface UnifiedRuleDraft {
  type: string
  value: string
  target: string
}

export interface UnifiedRuleBulkInvalidEntry {
  value: string
  reason: string
}

export interface UnifiedRuleBulkImportResult {
  patch: UnifiedRulePatchFile
  added: number
  skippedDuplicate: number
  invalid: UnifiedRuleBulkInvalidEntry[]
}

export interface UnifiedRuleBulkDuplicateResult {
  patch: UnifiedRulePatchFile
  added: number
  skippedDuplicate: number
  invalid: UnifiedRuleBulkInvalidEntry[]
}

export interface UnifiedRealtimePresetApplyResult {
  patch: UnifiedRulePatchFile
  presetId: string
  added: number
  skippedDuplicate: number
  processCoverage: boolean
  domainCoverage: boolean
}

export interface UnifiedObservedIpPromotionResult {
  patch: UnifiedRulePatchFile
  added: number
  skippedDuplicate: number
  invalid: UnifiedRuleBulkInvalidEntry[]
  promotedRules: string[]
}

interface UnifiedBulkImportEntry {
  type: string
  value: string
}

export interface UnifiedRulesExportRule {
  ownerType: UnifiedRuleItem['ownerType']
  ownerProfileId?: string
  ownerProfileName?: string
  type: string
  value: string
  target: string
  displayTarget: string
  enabled: boolean
  note?: string
}

export interface UnifiedRulesExportDocument {
  format: UnifiedRulesExportFormat
  version: 1
  exportedAt: string
  rules: UnifiedRulesExportRule[]
}

type UnifiedSelectableRuleItem = UnifiedRuleItem & {
  ownerProfileId: string
  managedPatchSection: UnifiedRulePatchSection
  managedPatchIndex: number
}

interface ParsedRule {
  type: string
  value: string
  target: string
  additionalParams: string[]
}

export function normalizeUnifiedRulePatchFile(input: unknown): UnifiedRulePatchFile {
  if (!isRecord(input)) {
    return createEmptyUnifiedRulePatchFile()
  }

  return dedupeUnifiedRulePatchFile({
    prepend: toStringArray(input.prepend),
    append: toStringArray(input.append),
    delete: toStringArray(input.delete),
    disabled: toStringArray(input.disabled)
  })
}

export function createEmptyUnifiedRulePatchFile(): UnifiedRulePatchFile {
  return {
    prepend: [],
    append: [],
    delete: [],
    disabled: []
  }
}

export function serializeUnifiedRuleDraft(draft: UnifiedRuleDraft): string {
  const type = normalizeUnifiedRuleType(draft.type)
  const value = draft.value.trim()
  const target = draft.target.trim()
  if (!type) throw new Error('Rule type is required')
  if (!value && type !== 'MATCH') throw new Error('Rule value is required')
  if (!target) throw new Error('Rule target is required')
  if (!isUserFacingRuleTarget(target))
    throw new Error('Internal helper targets are not user editable')
  if (type === 'MATCH') return `${type},${target}`
  return `${type},${value},${target}`
}

export function appendUnifiedManagedRule(
  patch: UnifiedRulePatchFile,
  serializedRule: string
): { patch: UnifiedRulePatchFile; added: boolean } {
  const next = dedupeUnifiedRulePatchFile(patch)
  const existing = createPatchRuleSet(next)
  if (existing.has(serializedRule)) {
    return { patch: next, added: false }
  }

  return {
    patch: dedupeUnifiedRulePatchFile({
      ...next,
      prepend: isKoalaRuBundleRuleString(serializedRule)
        ? next.prepend
        : [...next.prepend, serializedRule],
      append: isKoalaRuBundleRuleString(serializedRule)
        ? [...next.append, serializedRule]
        : next.append
    }),
    added: true
  }
}

export function dedupeUnifiedRulePatchFile(patch: UnifiedRulePatchFile): UnifiedRulePatchFile {
  const disabled = uniqueStrings(patch.disabled)
  const disabledSet = new Set(disabled)
  const prepend = uniqueStrings(patch.prepend.filter((rule) => !disabledSet.has(rule)))
  const activeSet = new Set(prepend)
  const append = uniqueStrings(
    patch.append.filter((rule) => !disabledSet.has(rule) && !activeSet.has(rule))
  )
  const pinnedRules = pinActiveRuBundleRules({
    prepend,
    append
  })

  return {
    prepend: pinnedRules.prepend,
    append: pinnedRules.append,
    delete: uniqueStrings(patch.delete),
    disabled
  }
}

export function mapRulePatchesToUnifiedRules(
  owners: UnifiedRuleOwner[],
  patchesByProfileId: Record<string, UnifiedRulePatchFile>
): UnifiedRuleItem[] {
  return owners.flatMap((owner) => {
    const patch = patchesByProfileId[owner.ownerProfileId] ?? createEmptyUnifiedRulePatchFile()
    return [
      ...mapPatchSection(owner, 'prepend', patch.prepend, true),
      ...mapPatchSection(owner, 'append', patch.append, true),
      ...mapPatchSection(owner, 'disabled', patch.disabled, false)
    ]
  })
}

export function createUnifiedRulesForDisplay(input: {
  runtimeRules: UnifiedRuleItem[]
  managedRules: UnifiedRuleItem[]
}): UnifiedRuleItem[] {
  const managedKeys = new Set(input.managedRules.map((rule) => getRuleIdentityKey(rule)))
  const runtimeOnlyRules = input.runtimeRules.filter(
    (rule) => !isHiddenUnifiedRuntimeRule(rule) && !managedKeys.has(getRuleIdentityKey(rule))
  )
  return [...input.managedRules, ...runtimeOnlyRules]
}

export function replaceUnifiedManagedRule(
  patch: UnifiedRulePatchFile,
  section: UnifiedRulePatchSection,
  index: number,
  draft: UnifiedRuleDraft
): UnifiedRulePatchFile {
  const next = clonePatch(patch)
  next[section] = replaceAt(next[section], index, serializeUnifiedRuleDraft(draft))
  return dedupeUnifiedRulePatchFile(next)
}

export function removeUnifiedManagedRule(
  patch: UnifiedRulePatchFile,
  section: UnifiedRulePatchSection,
  index: number
): UnifiedRulePatchFile {
  const next = clonePatch(patch)
  next[section] = removeAt(next[section], index)
  return next
}

export function moveUnifiedManagedRule(
  patch: UnifiedRulePatchFile,
  section: UnifiedRulePatchSection,
  index: number,
  direction: 'up' | 'down'
): UnifiedRulePatchFile {
  const next = clonePatch(dedupeUnifiedRulePatchFile(patch))
  const targetIndex = direction === 'up' ? index - 1 : index + 1
  const sectionRules = next[section]

  if (index < 0 || index >= sectionRules.length) return next
  if (targetIndex < 0 || targetIndex >= sectionRules.length) return next

  const currentRule = sectionRules[index]
  const targetRule = sectionRules[targetIndex]
  if (currentRule === undefined || targetRule === undefined) return next
  if (isKoalaRuBundleRuleString(currentRule) || isKoalaRuBundleRuleString(targetRule)) return next

  sectionRules[index] = targetRule
  sectionRules[targetIndex] = currentRule
  return next
}

export function setUnifiedManagedRuleEnabled(
  patch: UnifiedRulePatchFile,
  section: UnifiedRulePatchSection,
  index: number,
  enabled: boolean
): UnifiedRulePatchFile {
  const next = clonePatch(patch)
  const source = next[section]
  const rule = source[index]
  if (!rule) return next

  next[section] = removeAt(source, index)
  if (enabled) {
    if (isKoalaRuBundleRuleString(rule)) {
      next.append = appendUnique(next.append, rule)
    } else {
      next.prepend = appendUnique(next.prepend, rule)
    }
  } else {
    next.disabled = appendUnique(next.disabled, rule)
  }
  return dedupeUnifiedRulePatchFile(next)
}

export function duplicateUnifiedManagedRuleToOwner(input: {
  sourcePatch: UnifiedRulePatchFile
  sourceSection: UnifiedRulePatchSection
  sourceIndex: number
  targetPatch: UnifiedRulePatchFile
}): UnifiedRulePatchFile {
  const rule = input.sourcePatch[input.sourceSection][input.sourceIndex]
  if (!rule) return clonePatch(input.targetPatch)

  const nextTarget = clonePatch(input.targetPatch)
  if (isKoalaRuBundleRuleString(rule)) {
    nextTarget.append = appendUnique(nextTarget.append, rule)
  } else {
    nextTarget.prepend = appendUnique(nextTarget.prepend, rule)
  }
  return dedupeUnifiedRulePatchFile(nextTarget)
}

export function isUnifiedManagedRuleSelectable(
  rule: UnifiedRuleItem
): rule is UnifiedSelectableRuleItem {
  return (
    rule.editable &&
    !!rule.ownerProfileId &&
    !!rule.managedPatchSection &&
    rule.managedPatchIndex !== undefined
  )
}

export function getSelectableUnifiedRuleIds(rules: UnifiedRuleItem[]): string[] {
  return rules.filter(isUnifiedManagedRuleSelectable).map((rule) => rule.id)
}

export function setUnifiedManagedRulesEnabled(
  patch: UnifiedRulePatchFile,
  rules: UnifiedRuleItem[],
  enabled: boolean
): UnifiedRulePatchFile {
  const next = clonePatch(patch)
  const selected = collectPatchRuleStrings(next, rules)
  removePatchRulesByIndex(next, rules)

  for (const rule of selected) {
    if (enabled) {
      next.prepend = appendUnique(next.prepend, rule)
    } else {
      next.disabled = appendUnique(next.disabled, rule)
    }
  }

  return next
}

export function removeUnifiedManagedRules(
  patch: UnifiedRulePatchFile,
  rules: UnifiedRuleItem[]
): UnifiedRulePatchFile {
  const next = clonePatch(patch)
  removePatchRulesByIndex(next, rules)
  return next
}

export function duplicateUnifiedManagedRulesToOwner(input: {
  targetOwner: UnifiedRuleOwner
  targetPatch: UnifiedRulePatchFile
  rules: UnifiedRuleItem[]
}): UnifiedRuleBulkDuplicateResult {
  const next = clonePatch(input.targetPatch)
  const invalid: UnifiedRuleBulkInvalidEntry[] = []
  let added = 0
  let skippedDuplicate = 0
  const existing = createPatchRuleSet(next)

  for (const rule of input.rules) {
    if (!isUnifiedManagedRuleSelectable(rule)) {
      invalid.push({ value: rule.value, reason: 'read_only' })
      continue
    }
    if (!isTargetSupportedByOwner(input.targetOwner, rule.target)) {
      invalid.push({ value: rule.value, reason: 'unsupported_target' })
      continue
    }

    try {
      const serializedRule = serializeUnifiedRuleDraft({
        type: rule.type,
        value: rule.value,
        target: rule.target
      })
      if (existing.has(serializedRule)) {
        skippedDuplicate += 1
        continue
      }
      if (isKoalaRuBundleRuleString(serializedRule)) {
        next.append.push(serializedRule)
      } else {
        next.prepend.push(serializedRule)
      }
      existing.add(serializedRule)
      added += 1
    } catch (e) {
      invalid.push({ value: rule.value, reason: getErrorMessage(e) })
    }
  }

  return { patch: dedupeUnifiedRulePatchFile(next), added, skippedDuplicate, invalid }
}

export function importUnifiedRulesToPatch(input: {
  patch: UnifiedRulePatchFile
  type: string
  target: string
  text: string
}): UnifiedRuleBulkImportResult {
  const next = clonePatch(input.patch)
  const existing = createPatchRuleSet(next)
  const parsedValues = parseBulkRuleEntries(input.text, input.type)
  const invalid: UnifiedRuleBulkInvalidEntry[] = []
  let added = 0
  let skippedDuplicate = 0

  for (const entry of parsedValues) {
    const valueError = validateBulkRuleValue(entry.type, entry.value)
    if (valueError) {
      invalid.push({ value: entry.value, reason: valueError })
      continue
    }

    try {
      const serializedRule = serializeUnifiedRuleDraft({
        type: entry.type,
        value: entry.value,
        target: input.target
      })
      if (existing.has(serializedRule)) {
        skippedDuplicate += 1
        continue
      }
      if (isKoalaRuBundleRuleString(serializedRule)) {
        next.append.push(serializedRule)
      } else {
        next.prepend.push(serializedRule)
      }
      existing.add(serializedRule)
      added += 1
    } catch (e) {
      invalid.push({ value: entry.value, reason: getErrorMessage(e) })
    }
  }

  return { patch: dedupeUnifiedRulePatchFile(next), added, skippedDuplicate, invalid }
}

export function applyDiscordRealtimePresetToPatch(
  patch: UnifiedRulePatchFile,
  target = 'PROXY'
): UnifiedRealtimePresetApplyResult {
  return applyRealtimePresetToPatch({
    patch,
    presetId: DISCORD_REALTIME_PRESET_ID,
    target
  })
}

export function applyRealtimePresetToPatch(input: {
  patch: UnifiedRulePatchFile
  presetId: string
  target?: string
}): UnifiedRealtimePresetApplyResult {
  const next = clonePatch(input.patch)
  const existing = createPatchRuleSet(next)
  let added = 0
  let skippedDuplicate = 0
  const target = input.target ?? 'PROXY'
  const definition = getRealtimePresetDefinition(input.presetId)

  for (const rule of createRealtimePresetRules(input.presetId, target)) {
    if (existing.has(rule)) {
      skippedDuplicate += 1
      continue
    }
    next.prepend.push(rule)
    existing.add(rule)
    added += 1
  }

  return {
    patch: dedupeUnifiedRulePatchFile(next),
    presetId: input.presetId,
    added,
    skippedDuplicate,
    processCoverage: (definition?.processNames.length ?? 0) > 0,
    domainCoverage:
      (definition?.domains.length ?? 0) > 0 || (definition?.domainSuffixes.length ?? 0) > 0
  }
}

export function promoteObservedIpsToUnifiedRules(input: {
  patch: UnifiedRulePatchFile
  observedIps: string[]
  target?: string
}): UnifiedObservedIpPromotionResult {
  const next = clonePatch(input.patch)
  const target = input.target ?? 'PROXY'
  const existing = createPatchRuleSet(next)
  const invalid: UnifiedRuleBulkInvalidEntry[] = []
  const promotedRules: string[] = []
  let added = 0
  let skippedDuplicate = 0

  if (!isUserFacingRuleTarget(target)) {
    return {
      patch: dedupeUnifiedRulePatchFile(next),
      added,
      skippedDuplicate,
      invalid: input.observedIps.map((ip) => ({ value: ip, reason: 'unsupported_target' })),
      promotedRules
    }
  }

  for (const observedIp of uniqueStrings(input.observedIps)) {
    const cidr = normalizeObservedIpToIpv4Cidr(observedIp)
    if (!cidr) {
      invalid.push({ value: observedIp, reason: 'unsupported_ip' })
      continue
    }

    const rule = `IP-CIDR,${cidr},${target}`
    if (existing.has(rule)) {
      skippedDuplicate += 1
      continue
    }
    next.prepend.push(rule)
    existing.add(rule)
    promotedRules.push(rule)
    added += 1
  }

  return {
    patch: dedupeUnifiedRulePatchFile(next),
    added,
    skippedDuplicate,
    invalid,
    promotedRules
  }
}

export function createUnifiedRulesExportDocument(
  rules: UnifiedRuleItem[],
  exportedAt = new Date()
): UnifiedRulesExportDocument {
  return {
    format: 'koala-clash.unified-rules',
    version: 1,
    exportedAt: exportedAt.toISOString(),
    rules: rules.filter(isUnifiedManagedRuleSelectable).map((rule) => ({
      ownerType: rule.ownerType,
      ownerProfileId: rule.ownerProfileId,
      ownerProfileName: rule.ownerProfileName,
      type: rule.type,
      value: rule.value,
      target: isUserFacingRuleTarget(rule.target) ? rule.target : 'PROXY',
      displayTarget: getUnifiedRuleDisplayTarget(rule.ownerType, rule.target),
      enabled: rule.enabled,
      note: rule.note
    }))
  }
}

export function serializeUnifiedRulesExportDocument(
  rules: UnifiedRuleItem[],
  exportedAt = new Date()
): string {
  return `${JSON.stringify(createUnifiedRulesExportDocument(rules, exportedAt), null, 2)}\n`
}

function mapPatchSection(
  owner: UnifiedRuleOwner,
  section: UnifiedRulePatchSection,
  rules: string[],
  enabled: boolean
): UnifiedRuleItem[] {
  return rules.map((raw, index) => {
    const parsed = parseRuleString(raw)
    const target = isUserFacingRuleTarget(parsed.target) ? parsed.target : 'PROXY'
    return {
      id: `managed-${owner.id}-${section}-${index}`,
      scopeId: owner.scopeId,
      source: owner.ownerType,
      ownerType: owner.ownerType,
      ownerProfileId: owner.ownerProfileId,
      ownerProfileName: owner.ownerProfileName,
      type: normalizeUnifiedRuleType(parsed.type),
      value: parsed.value,
      target,
      internalTarget: target === parsed.target ? undefined : parsed.target,
      enabled,
      editable: true,
      note: parsed.additionalParams.length > 0 ? parsed.additionalParams.join(',') : undefined,
      managedPatchSection: section,
      managedPatchIndex: index,
      managedRawRule: raw
    }
  })
}

function parseRuleString(rule: string): ParsedRule {
  const parts = rule.split(',').map((part) => part.trim())
  const type = normalizeUnifiedRuleType(parts[0] ?? '')
  if (type === 'MATCH') {
    return {
      type,
      value: '',
      target: parts[1] ?? '',
      additionalParams: parts.slice(2)
    }
  }

  return {
    type,
    value: parts[1] ?? '',
    target: parts[2] ?? '',
    additionalParams: parts.slice(3)
  }
}

function getRuleIdentityKey(rule: UnifiedRuleItem): string {
  return [
    rule.ownerProfileId ?? rule.ownerType,
    normalizeUnifiedRuleType(rule.type),
    rule.value.trim().toLowerCase(),
    getUnifiedRuleDisplayTarget(rule.ownerType, rule.target)
  ].join('\u0000')
}

function clonePatch(patch: UnifiedRulePatchFile): UnifiedRulePatchFile {
  return {
    prepend: [...patch.prepend],
    append: [...patch.append],
    delete: [...patch.delete],
    disabled: [...patch.disabled]
  }
}

function pinActiveRuBundleRules(patch: Pick<UnifiedRulePatchFile, 'prepend' | 'append'>): {
  prepend: string[]
  append: string[]
} {
  const prepend = patch.prepend.filter((rule) => !isKoalaRuBundleRuleString(rule))
  const append = patch.append.filter((rule) => !isKoalaRuBundleRuleString(rule))
  const pinned = pinKoalaRuBundleRulesLast([...patch.prepend, ...patch.append]).filter(
    isKoalaRuBundleRuleString
  )
  const pinnedRule = pinned[pinned.length - 1]

  return {
    prepend,
    append: pinnedRule ? [...append, pinnedRule] : append
  }
}

function replaceAt(items: string[], index: number, value: string): string[] {
  if (index < 0 || index >= items.length) return items
  return items.map((item, i) => (i === index ? value : item))
}

function removeAt(items: string[], index: number): string[] {
  if (index < 0 || index >= items.length) return items
  return items.filter((_item, i) => i !== index)
}

function appendUnique(items: string[], value: string): string[] {
  return items.includes(value) ? items : [...items, value]
}

function uniqueStrings(items: string[]): string[] {
  return [...new Set(items)]
}

function collectPatchRuleStrings(patch: UnifiedRulePatchFile, rules: UnifiedRuleItem[]): string[] {
  const collected: string[] = []
  for (const rule of rules) {
    if (!isUnifiedManagedRuleSelectable(rule)) continue
    const raw = patch[rule.managedPatchSection][rule.managedPatchIndex]
    if (raw) collected.push(raw)
  }
  return collected
}

function removePatchRulesByIndex(patch: UnifiedRulePatchFile, rules: UnifiedRuleItem[]): void {
  for (const section of ['prepend', 'append', 'disabled'] as const) {
    const indexes = new Set(
      rules
        .filter(
          (rule) =>
            isUnifiedManagedRuleSelectable(rule) &&
            rule.managedPatchSection === section &&
            rule.managedPatchIndex !== undefined
        )
        .map((rule) => rule.managedPatchIndex as number)
    )
    if (indexes.size > 0) {
      patch[section] = patch[section].filter((_item, index) => !indexes.has(index))
    }
  }
}

function createPatchRuleSet(patch: UnifiedRulePatchFile): Set<string> {
  return new Set([...patch.prepend, ...patch.append, ...patch.disabled])
}

function parseBulkRuleEntries(text: string, fallbackType: string): UnifiedBulkImportEntry[] {
  const normalizedFallbackType = normalizeUnifiedRuleType(fallbackType)
  const parsedDocument = parseRulesExportDocument(text)
  if (parsedDocument) {
    return parsedDocument.rules
      .map((rule) => ({
        type: typeof rule.type === 'string' ? rule.type.trim() : '',
        value: typeof rule.value === 'string' ? rule.value.trim() : ''
      }))
      .filter((entry) => entry.type.length > 0 || entry.value.length > 0)
  }

  if (normalizedFallbackType === 'MATCH') {
    return [{ type: normalizedFallbackType, value: '' }]
  }

  return text
    .split(/[\n,]+/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value) => ({ type: fallbackType, value }))
}

function parseRulesExportDocument(
  text: string
): { rules: Array<Record<string, unknown>> } | undefined {
  try {
    const parsed = JSON.parse(text) as unknown
    if (!isRecord(parsed) || parsed.format !== 'koala-clash.unified-rules') return undefined
    if (!Array.isArray(parsed.rules)) return undefined
    return { rules: parsed.rules.filter(isRecord) }
  } catch {
    return undefined
  }
}

function validateBulkRuleValue(type: string, value: string): string | undefined {
  if (normalizeUnifiedRuleType(type) === 'MATCH') return undefined
  if (!value) return 'empty_value'
  if (value.includes(',')) return 'contains_comma'

  switch (type) {
    case 'PROCESS-NAME':
      return value.length <= 255 ? undefined : 'process_name_too_long'
    case 'IP-CIDR':
      if (/\s/.test(value)) return 'contains_whitespace'
      return isValidIpv4Cidr(value) ? undefined : 'invalid_ipv4_cidr'
    case 'DOMAIN':
    case 'DOMAIN-SUFFIX':
      if (/\s/.test(value)) return 'contains_whitespace'
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return 'domain_contains_scheme'
      return isLikelyDomainValue(value) ? undefined : 'invalid_domain'
    case 'DOMAIN-KEYWORD':
      if (/\s/.test(value)) return 'contains_whitespace'
      return value.length > 0 ? undefined : 'empty_value'
    default:
      if (/\s/.test(value)) return 'contains_whitespace'
      return undefined
  }
}

function isLikelyDomainValue(value: string): boolean {
  const normalized = value.startsWith('*.') || value.startsWith('+.') ? value.slice(2) : value
  return normalized.length > 0 && normalized.length <= 253 && /^[a-z0-9.-]+$/i.test(normalized)
}

function isValidIpv4Cidr(value: string): boolean {
  const parts = value.split('/')
  if (parts.length !== 2) return false
  const [address, prefixText] = parts
  const prefix = Number(prefixText)
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false
  const octets = address.split('.')
  return (
    octets.length === 4 &&
    octets.every((octet) => {
      if (!/^\d+$/.test(octet)) return false
      const value = Number(octet)
      return value >= 0 && value <= 255
    })
  )
}

function normalizeObservedIpToIpv4Cidr(value: string): string | undefined {
  const normalized = value.trim()
  if (!normalized) return undefined
  if (normalized.includes('/')) return isValidIpv4Cidr(normalized) ? normalized : undefined
  return isValidIpv4Address(normalized) ? `${normalized}/32` : undefined
}

function isValidIpv4Address(value: string): boolean {
  const octets = value.split('.')
  return (
    octets.length === 4 &&
    octets.every((octet) => {
      if (!/^\d+$/.test(octet)) return false
      const parsed = Number(octet)
      return parsed >= 0 && parsed <= 255
    })
  )
}

function isTargetSupportedByOwner(owner: UnifiedRuleOwner, target: string): boolean {
  if (owner.ownerType !== 'amnezia') return isUserFacingRuleTarget(target)
  return target === 'PROXY' || target === 'DIRECT' || target === 'REJECT'
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : `${error}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}
