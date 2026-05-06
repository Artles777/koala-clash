export type UnifiedStatusLevel = 'ready' | 'warning' | 'blocked' | 'unknown'

export interface UnifiedProfileItemLike {
  id: string
  name: string
  isCurrent?: boolean
}

export interface UnifiedMihomoRuleLike {
  type: string
  payload: string
  proxy: string
  size?: number
}

export interface UnifiedRuleItem {
  id: string
  scopeId: 'mihomo'
  ownerType: 'mihomo'
  ownerProfileId?: string
  ownerProfileName?: string
  type: string
  value: string
  target: string
  enabled: boolean
  ruleEnabled?: boolean
  editable: boolean
  size?: number
  packId?: string
  packName?: string
  packEnabled?: boolean
  note?: string
  managedPatchSection?: 'prepend' | 'append' | 'disabled'
  managedPatchIndex?: number
  managedRawRule?: string
}

export interface UnifiedRuleOwner {
  id: string
  ownerType: 'mihomo'
  ownerProfileId: string
  ownerProfileName: string
  scopeId: 'mihomo'
  isCurrent: boolean
  canEditRules: boolean
  status: UnifiedStatusLevel
}

export interface UnifiedRuleSavePlan {
  ownerType: 'mihomo'
  ownerProfileId: string
  ownerProfileName: string
  serializedRule: string
  userFacingTarget: string
  successMessageKey: string
}

export interface UnifiedConnectionStatus {
  overallStatus: UnifiedStatusLevel
  mihomoStatus: UnifiedStatusLevel
  tunStatus: UnifiedStatusLevel
  issues: string[]
}

export interface UnifiedSupportSummary {
  overallStatus: UnifiedStatusLevel
  primaryMessageKey: string
  mihomoStatus: UnifiedStatusLevel
  tunStatus: UnifiedStatusLevel
  topIssues: string[]
  recommendedActions: string[]
}

export interface UnifiedUiBundle {
  ruleOwners: UnifiedRuleOwner[]
  allRules: UnifiedRuleItem[]
  connectionStatus: UnifiedConnectionStatus
  supportSummary: UnifiedSupportSummary
  loadedAt: number
}

export interface UnifiedSupportInput {
  mihomo?: {
    running?: boolean
    currentProfileId?: string
    tunEnabled?: boolean
  }
}

export interface UnifiedUiBundleInput extends UnifiedSupportInput {
  profileItems?: UnifiedProfileItemLike[]
  currentProfileId?: string
  mihomoRules?: UnifiedMihomoRuleLike[]
}

export function createUnifiedUiBundle(input: UnifiedUiBundleInput): UnifiedUiBundle {
  const ruleOwners = createUnifiedRuleOwners(
    (input.profileItems ?? []).map((profile) => ({
      ...profile,
      isCurrent: profile.id === input.currentProfileId
    }))
  )
  const activeRuleOwner = ruleOwners.find(
    (owner) => owner.ownerProfileId === input.currentProfileId
  )
  const allRules = mapMihomoRulesToUnifiedRules(input.mihomoRules ?? [], activeRuleOwner)

  return {
    ruleOwners,
    allRules,
    connectionStatus: createUnifiedConnectionStatus(input),
    supportSummary: createUnifiedSupportSummary(input),
    loadedAt: Date.now()
  }
}

export function createUnifiedRuleOwners(profiles: UnifiedProfileItemLike[]): UnifiedRuleOwner[] {
  return profiles.map((profile) => ({
    id: `mihomo:${profile.id}`,
    ownerType: 'mihomo',
    ownerProfileId: profile.id,
    ownerProfileName: profile.name,
    scopeId: 'mihomo',
    isCurrent: Boolean(profile.isCurrent),
    canEditRules: true,
    status: 'ready'
  }))
}

export function resolveDefaultRuleOwnerId(
  owners: UnifiedRuleOwner[],
  currentOwnerId?: string
): string | undefined {
  const currentOwner = currentOwnerId
    ? owners.find((owner) => owner.id === currentOwnerId)
    : undefined
  if (currentOwner) return currentOwner.id

  return owners.find((owner) => owner.isCurrent)?.id ?? owners[0]?.id
}

export function createUnifiedRuleSavePlan(input: {
  owner: UnifiedRuleOwner
  type: string
  value: string
  target: string
}): UnifiedRuleSavePlan {
  const type = normalizeUnifiedRuleType(input.type)
  const value = type === 'MATCH' ? '' : input.value.trim()
  const target = input.target.trim()
  if (!type) throw new Error('Rule type is required')
  if (!value && type !== 'MATCH') throw new Error('Rule value is required')
  if (!target) throw new Error('Rule target is required')

  return {
    ownerType: input.owner.ownerType,
    ownerProfileId: input.owner.ownerProfileId,
    ownerProfileName: input.owner.ownerProfileName,
    serializedRule: type === 'MATCH' ? `${type},${target}` : `${type},${value},${target}`,
    userFacingTarget: target,
    successMessageKey: 'pages.rules.mihomoRuleAdded'
  }
}

export function normalizeUnifiedRuleType(type: string): string {
  const trimmed = type.trim()
  const compact = trimmed.replace(/[\s_-]/g, '').toUpperCase()
  const knownTypes: Record<string, string> = {
    DOMAIN: 'DOMAIN',
    DOMAINSUFFIX: 'DOMAIN-SUFFIX',
    DOMAINKEYWORD: 'DOMAIN-KEYWORD',
    DOMAINREGEX: 'DOMAIN-REGEX',
    IPCIDR: 'IP-CIDR',
    IPCIDR6: 'IP-CIDR6',
    SRCIPCIDR: 'SRC-IP-CIDR',
    SRCIPCIDR6: 'SRC-IP-CIDR6',
    GEOIP: 'GEOIP',
    GEOSITE: 'GEOSITE',
    RULESET: 'RULE-SET',
    PROCESSNAME: 'PROCESS-NAME',
    PROCESSPATH: 'PROCESS-PATH',
    DSTPORT: 'DST-PORT',
    SRCPORT: 'SRC-PORT',
    MATCH: 'MATCH'
  }

  return knownTypes[compact] ?? trimmed
}

export function mapMihomoRulesToUnifiedRules(
  rules: UnifiedMihomoRuleLike[],
  owner?: UnifiedRuleOwner
): UnifiedRuleItem[] {
  return rules.map((rule, index) => ({
    id: `mihomo-${index}-${normalizeUnifiedRuleType(rule.type)}-${rule.payload}-${rule.proxy}`,
    scopeId: 'mihomo',
    ownerType: 'mihomo',
    ownerProfileId: owner?.ownerProfileId,
    ownerProfileName: owner?.ownerProfileName,
    type: normalizeUnifiedRuleType(rule.type),
    value: rule.payload,
    target: rule.proxy,
    enabled: true,
    editable: false,
    size: rule.size
  }))
}

export function createUnifiedConnectionStatus(input: UnifiedSupportInput): UnifiedConnectionStatus {
  const mihomoStatus =
    input.mihomo?.running === false ? 'blocked' : input.mihomo?.running ? 'ready' : 'unknown'
  const tunStatus = input.mihomo?.tunEnabled ? 'ready' : 'unknown'
  const issues: string[] = []

  if (mihomoStatus === 'blocked') issues.push('mihomo_not_running')

  return {
    overallStatus: highestStatus([mihomoStatus]),
    mihomoStatus,
    tunStatus,
    issues
  }
}

export function createUnifiedSupportSummary(input: UnifiedSupportInput): UnifiedSupportSummary {
  const mihomoStatus =
    input.mihomo?.running === false ? 'blocked' : input.mihomo?.running ? 'ready' : 'unknown'
  const tunStatus = input.mihomo?.tunEnabled ? 'ready' : 'unknown'
  const topIssues = mihomoStatus === 'blocked' ? ['mihomo_not_running'] : []
  const overallStatus = highestStatus([mihomoStatus])

  return {
    overallStatus,
    primaryMessageKey: getSupportPrimaryMessageKey(overallStatus),
    mihomoStatus,
    tunStatus,
    topIssues,
    recommendedActions: []
  }
}

function highestStatus(statuses: UnifiedStatusLevel[]): UnifiedStatusLevel {
  if (statuses.includes('blocked')) return 'blocked'
  if (statuses.includes('warning')) return 'warning'
  if (statuses.includes('unknown')) return 'unknown'
  return 'ready'
}

function getSupportPrimaryMessageKey(status: UnifiedStatusLevel): string {
  switch (status) {
    case 'ready':
      return 'pages.rules.unifiedStatusReady'
    case 'warning':
      return 'pages.rules.unifiedStatusWarning'
    case 'blocked':
      return 'pages.rules.unifiedStatusBlocked'
    case 'unknown':
      return 'pages.rules.unifiedStatusUnknown'
  }
}
