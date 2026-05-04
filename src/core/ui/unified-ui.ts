import {
  getManagedProfileMetadata,
  getProfileRuntimeCapabilities,
  ManagedProfileItemLike,
  ManagedProfileKind,
  ManagedRuntimeSupport,
  ManagedValidityStatus,
  ProfileRuntimeCapabilities
} from '../profiles/managed-profile'

export type UnifiedProfileKind = ManagedProfileKind
export type UnifiedRuleScopeId = 'mihomo' | 'amnezia'
export type UnifiedRuleViewScopeId = 'all' | UnifiedRuleScopeId
export type UnifiedRuleOwnerType = 'mihomo' | 'amnezia'
export type UnifiedStatusLevel = 'ready' | 'warning' | 'blocked' | 'unknown'
export type UnifiedBadgeTone = 'neutral' | 'info' | 'warning' | 'danger'

const internalHelperTargets = new Set(['AMNEZIA_HELPER', 'AMNEZIA_HELPER_PROXY'])

export interface UnifiedBadge {
  code: string
  labelKey?: string
  label?: string
  tone: UnifiedBadgeTone
}

export interface UnifiedProfileItem {
  id: string
  name: string
  kind: UnifiedProfileKind
  sourceType: string
  isCurrent: boolean
  runtime: ProfileRuntimeCapabilities
  runtimeSupport: ManagedRuntimeSupport
  validityStatus: ManagedValidityStatus
  status: UnifiedStatusLevel
  statusCode: string
  ruleScopeId: UnifiedRuleScopeId
  badges: UnifiedBadge[]
  raw: ManagedProfileItemLike
}

export interface UnifiedMihomoRuleLike {
  type: string
  payload: string
  proxy: string
  size?: number
}

export interface UnifiedAmneziaRuleLike {
  id: string
  type: string
  value: string
  enabled: boolean
  target: 'AMNEZIA_HELPER'
  note?: string
}

export interface UnifiedAmneziaRulePackLike {
  id: string
  name: string
  enabled: boolean
  rules: UnifiedAmneziaRuleLike[]
}

export interface UnifiedRuleItem {
  id: string
  scopeId: UnifiedRuleScopeId
  source: 'mihomo' | 'amnezia'
  ownerType: UnifiedRuleOwnerType
  ownerProfileId?: string
  ownerProfileName?: string
  type: string
  value: string
  target: string
  internalTarget?: string
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

export interface UnifiedRuleScope {
  id: UnifiedRuleScopeId
  titleKey: string
  descriptionKey: string
  editable: boolean
  active: boolean
  ruleCount: number
  enabledRuleCount: number
  unavailableReason?: string
  rules: UnifiedRuleItem[]
}

export interface UnifiedRuleOwner {
  id: string
  ownerType: UnifiedRuleOwnerType
  ownerProfileId: string
  ownerProfileName: string
  scopeId: UnifiedRuleScopeId
  isCurrent: boolean
  canEditRules: boolean
  status: UnifiedStatusLevel
}

export interface UnifiedRuleSavePlan {
  ownerType: UnifiedRuleOwnerType
  ownerProfileId: string
  ownerProfileName: string
  serializedRule: string
  userFacingTarget: string
  successMessageKey: string
}

export interface UnifiedConnectionStatus {
  overallStatus: UnifiedStatusLevel
  mihomoStatus: UnifiedStatusLevel
  amneziaStatus: UnifiedStatusLevel
  tunStatus: UnifiedStatusLevel
  activeProfileKind?: UnifiedProfileKind
  helperRoutingInjected: boolean
  helperEndpoint?: string
  issues: string[]
}

export interface UnifiedSupportSummary {
  overallStatus: UnifiedStatusLevel
  primaryMessageKey: string
  mihomoStatus: UnifiedStatusLevel
  amneziaStatus: UnifiedStatusLevel
  tunStatus: UnifiedStatusLevel
  dnsRuleReliabilityStatus: UnifiedStatusLevel
  udpStatus: UnifiedStatusLevel
  releaseStatus: UnifiedStatusLevel
  topIssues: string[]
  recommendedActions: string[]
}

export interface UnifiedLegacyHelperRuleSummary {
  packCount: number
  totalRules: number
  enabledRules: number
}

export interface UnifiedUiBundle {
  profiles: UnifiedProfileItem[]
  ruleOwners: UnifiedRuleOwner[]
  ruleScopes: UnifiedRuleScope[]
  allRules: UnifiedRuleItem[]
  legacyHelperRules: UnifiedLegacyHelperRuleSummary
  activeRuleScopeId: UnifiedRuleScopeId
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
  amnezia?: {
    readinessSummary?: {
      overallStatus: 'ready' | 'ready_with_warnings' | 'blocked' | 'unknown'
      helperStatus: string
      tunStatus: string
      dnsRuleReliabilityStatus: string
      udpStatus: string
      releaseStatus: 'supported' | 'warning' | 'blocked'
      topIssues?: Array<{ code: string; message: string }>
      recommendedActions?: Array<{ code: string; message: string }>
    }
    session?: {
      status?: string
      readiness?: string
      localEndpoint?: {
        host: string
        port: number
        protocol: string
      }
      routingTarget?: {
        status: string
      }
    }
  }
}

export interface UnifiedUiBundleInput extends UnifiedSupportInput {
  profileItems?: ManagedProfileItemLike[]
  currentProfileId?: string
  mihomoRules?: UnifiedMihomoRuleLike[]
  amneziaRulePacks?: UnifiedAmneziaRulePackLike[]
  requestedRuleScopeId?: string
}

export function createUnifiedProfileItem(
  item: ManagedProfileItemLike,
  currentProfileId?: string
): UnifiedProfileItem {
  const metadata = getManagedProfileMetadata(item)
  const runtime = getProfileRuntimeCapabilities(item)
  const status = getProfileStatus(metadata.validityStatus, runtime)

  return {
    id: item.id,
    name: item.name,
    kind: metadata.profileKind,
    sourceType: metadata.sourceType,
    isCurrent: item.id === currentProfileId,
    runtime,
    runtimeSupport: metadata.runtimeSupport,
    validityStatus: metadata.validityStatus,
    status,
    statusCode: getProfileStatusCode(metadata.validityStatus, runtime),
    ruleScopeId: metadata.profileKind === 'amnezia' ? 'amnezia' : 'mihomo',
    badges: createUnifiedProfileBadges(
      metadata.profileKind,
      metadata.runtimeSupport,
      metadata.validityStatus
    ),
    raw: item
  }
}

export function createUnifiedProfileItems(
  items: ManagedProfileItemLike[],
  currentProfileId?: string
): UnifiedProfileItem[] {
  return items.map((item) => createUnifiedProfileItem(item, currentProfileId))
}

export function createUnifiedUiBundle(input: UnifiedUiBundleInput): UnifiedUiBundle {
  const profiles = createUnifiedProfileItems(input.profileItems ?? [], input.currentProfileId)
  const ruleOwners = createUnifiedRuleOwners(profiles)
  const activeRuleOwner = ruleOwners.find(
    (owner) => owner.ownerProfileId === input.currentProfileId
  )
  const ruleScopes = createUnifiedRuleScopes({
    mihomoRules: input.mihomoRules,
    amneziaRulePacks: input.amneziaRulePacks,
    ruleOwners,
    activeRuleOwner,
    hasCurrentMihomoProfile: profiles.some(
      (profile) => profile.id === input.currentProfileId && profile.kind === 'mihomo'
    ),
    helperTargetInjected: input.amnezia?.session?.routingTarget?.status === 'injected'
  })

  return {
    profiles,
    ruleOwners,
    ruleScopes,
    allRules: createUnifiedRulesList(ruleScopes),
    legacyHelperRules: createUnifiedLegacyHelperRuleSummary(input.amneziaRulePacks ?? []),
    activeRuleScopeId: resolveUnifiedRuleScopeId(input.requestedRuleScopeId, ruleScopes),
    connectionStatus: createUnifiedConnectionStatus(input),
    supportSummary: createUnifiedSupportSummary(input),
    loadedAt: Date.now()
  }
}

export function createUnifiedRuleScopes(input: {
  mihomoRules?: UnifiedMihomoRuleLike[]
  amneziaRulePacks?: UnifiedAmneziaRulePackLike[]
  ruleOwners?: UnifiedRuleOwner[]
  activeRuleOwner?: UnifiedRuleOwner
  hasCurrentMihomoProfile?: boolean
  helperTargetInjected?: boolean
}): UnifiedRuleScope[] {
  const runtimeRules = mapMihomoRulesToUnifiedRules(
    input.mihomoRules ?? [],
    input.activeRuleOwner
  ).filter((rule) => !isHiddenUnifiedRuntimeRule(rule))
  const mihomoRules = runtimeRules.filter((rule) => rule.scopeId === 'mihomo')
  const amneziaRules = runtimeRules.filter((rule) => rule.scopeId === 'amnezia')
  const hasMihomoOwner =
    input.ruleOwners?.some((owner) => owner.ownerType === 'mihomo' && owner.canEditRules) ??
    Boolean(input.hasCurrentMihomoProfile)
  const hasAmneziaOwner =
    input.ruleOwners?.some((owner) => owner.ownerType === 'amnezia' && owner.canEditRules) ?? false

  return [
    {
      id: 'mihomo',
      titleKey: 'pages.rules.scopeMihomo',
      descriptionKey: 'pages.rules.scopeMihomoDescription',
      editable: hasMihomoOwner,
      active: input.activeRuleOwner?.scopeId === 'mihomo' || Boolean(input.hasCurrentMihomoProfile),
      ruleCount: mihomoRules.length,
      enabledRuleCount: mihomoRules.length,
      unavailableReason: hasMihomoOwner ? undefined : 'no_mihomo_rule_owner',
      rules: mihomoRules
    },
    {
      id: 'amnezia',
      titleKey: 'pages.rules.scopeAmnezia',
      descriptionKey: 'pages.rules.scopeAmneziaDescription',
      editable: hasAmneziaOwner,
      active: input.activeRuleOwner?.scopeId === 'amnezia',
      ruleCount: amneziaRules.length,
      enabledRuleCount: amneziaRules.filter((rule) => rule.enabled).length,
      unavailableReason: hasAmneziaOwner ? undefined : 'no_amnezia_rule_owner',
      rules: amneziaRules
    }
  ]
}

export function resolveUnifiedRuleScopeId(
  requestedScope: string | undefined,
  scopes: UnifiedRuleScope[]
): UnifiedRuleScopeId {
  if (requestedScope === 'mihomo' || requestedScope === 'amnezia') {
    if (scopes.some((scope) => scope.id === requestedScope)) return requestedScope
  }
  return scopes.find((scope) => scope.active)?.id ?? scopes[0]?.id ?? 'mihomo'
}

export function createUnifiedRulesList(scopes: UnifiedRuleScope[]): UnifiedRuleItem[] {
  return scopes.flatMap((scope) => scope.rules)
}

export function createUnifiedLegacyHelperRuleSummary(
  packs: UnifiedAmneziaRulePackLike[]
): UnifiedLegacyHelperRuleSummary {
  return packs.reduce<UnifiedLegacyHelperRuleSummary>(
    (summary, pack) => {
      summary.packCount += 1
      summary.totalRules += pack.rules.length
      summary.enabledRules += pack.enabled ? pack.rules.filter((rule) => rule.enabled).length : 0
      return summary
    },
    {
      packCount: 0,
      totalRules: 0,
      enabledRules: 0
    }
  )
}

export function createUnifiedRuleOwners(profiles: UnifiedProfileItem[]): UnifiedRuleOwner[] {
  return profiles
    .filter((profile) => profile.runtime.canEditRules)
    .map((profile) => ({
      id: getUnifiedRuleOwnerId(profile.kind, profile.id),
      ownerType: profile.kind,
      ownerProfileId: profile.id,
      ownerProfileName: profile.name,
      scopeId: profile.kind === 'amnezia' ? 'amnezia' : 'mihomo',
      isCurrent: profile.isCurrent,
      canEditRules: profile.runtime.canEditRules,
      status: profile.status
    }))
}

export function getUnifiedRuleOwnerId(
  ownerType: UnifiedRuleOwnerType,
  ownerProfileId: string
): string {
  return `${ownerType}:${ownerProfileId}`
}

export function resolveDefaultRuleOwnerId(
  owners: UnifiedRuleOwner[],
  scope: UnifiedRuleViewScopeId,
  currentOwnerId?: string
): string | undefined {
  const currentOwner = currentOwnerId
    ? owners.find((owner) => owner.id === currentOwnerId)
    : undefined
  if (currentOwner && (scope === 'all' || currentOwner.scopeId === scope)) return currentOwner.id

  const scopedOwners = scope === 'all' ? owners : owners.filter((owner) => owner.scopeId === scope)
  return scopedOwners.find((owner) => owner.isCurrent)?.id ?? scopedOwners[0]?.id
}

export function createUnifiedRuleSavePlan(input: {
  owner: UnifiedRuleOwner
  type: string
  value: string
  target: string
}): UnifiedRuleSavePlan {
  const type = normalizeUnifiedRuleType(input.type)
  const value = type === 'MATCH' ? '' : input.value.trim()
  const target = normalizeUserFacingRuleTarget(input.target)
  if (!type) throw new Error('Rule type is required')
  if (!value && type !== 'MATCH') throw new Error('Rule value is required')

  return {
    ownerType: input.owner.ownerType,
    ownerProfileId: input.owner.ownerProfileId,
    ownerProfileName: input.owner.ownerProfileName,
    serializedRule: type === 'MATCH' ? `${type},${target}` : `${type},${value},${target}`,
    userFacingTarget: getUnifiedRuleDisplayTarget(input.owner.ownerType, target),
    successMessageKey:
      input.owner.ownerType === 'amnezia'
        ? 'pages.rules.vpnRuleAdded'
        : 'pages.rules.mihomoRuleAdded'
  }
}

export function normalizeUserFacingRuleTarget(target: string): string {
  const normalized = target.trim()
  if (!normalized || internalHelperTargets.has(normalized)) {
    throw new Error('Internal helper targets are not available in the normal rules UI')
  }
  return normalized
}

export function getUnifiedRuleDisplayTarget(
  ownerType: UnifiedRuleOwnerType,
  target: string
): string {
  if (internalHelperTargets.has(target)) return ownerType === 'amnezia' ? 'VPN / PROXY' : 'PROXY'
  if (ownerType === 'amnezia' && target === 'PROXY') return 'VPN / PROXY'
  return target
}

export function isUserFacingRuleTarget(target: string): boolean {
  return !internalHelperTargets.has(target)
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
  const ownerType = owner?.ownerType ?? 'mihomo'
  const scopeId = owner?.scopeId ?? 'mihomo'
  return rules.map((rule, index) => ({
    id: `mihomo-${index}-${normalizeUnifiedRuleType(rule.type)}-${rule.payload}-${rule.proxy}`,
    scopeId,
    source: ownerType,
    ownerType,
    ownerProfileId: owner?.ownerProfileId,
    ownerProfileName: owner?.ownerProfileName,
    type: normalizeUnifiedRuleType(rule.type),
    value: rule.payload,
    target: internalHelperTargets.has(rule.proxy) ? 'PROXY' : rule.proxy,
    internalTarget: internalHelperTargets.has(rule.proxy) ? rule.proxy : undefined,
    enabled: true,
    editable: false,
    size: rule.size
  }))
}

export function isHiddenUnifiedRuntimeRule(rule: UnifiedRuleItem): boolean {
  if (rule.editable || rule.ownerType !== 'amnezia') return false
  if (normalizeUnifiedRuleType(rule.type) !== 'AND') return false
  if (normalizeUserFacingRuntimeTarget(rule.target) !== 'REJECT') return false

  const normalizedPayload = rule.value.toLowerCase().replace(/[\s_\-()]/g, '')
  return (
    normalizedPayload.includes('network,udp') &&
    normalizedPayload.includes('dstport,443')
  )
}

function normalizeUserFacingRuntimeTarget(target: string): string {
  return target.trim().toUpperCase()
}

export function mapAmneziaHelperRulePacksToUnifiedRules(
  packs: UnifiedAmneziaRulePackLike[],
  owner?: UnifiedRuleOwner
): UnifiedRuleItem[] {
  return packs.flatMap((pack) =>
    pack.rules.map((rule) => ({
      id: rule.id,
      scopeId: 'amnezia' as const,
      source: 'amnezia' as const,
      ownerType: 'amnezia' as const,
      ownerProfileId: owner?.ownerProfileId,
      ownerProfileName: owner?.ownerProfileName,
      type: rule.type,
      value: rule.value,
      target: 'PROXY',
      internalTarget: rule.target,
      enabled: pack.enabled && rule.enabled,
      ruleEnabled: rule.enabled,
      editable: true,
      packId: pack.id,
      packName: pack.name,
      packEnabled: pack.enabled,
      note: rule.note
    }))
  )
}

export function createUnifiedConnectionStatus(input: UnifiedSupportInput): UnifiedConnectionStatus {
  const helperEndpoint = input.amnezia?.session?.localEndpoint
  const helperEndpointLabel = helperEndpoint
    ? `${helperEndpoint.protocol}://${helperEndpoint.host}:${helperEndpoint.port}`
    : undefined
  const amneziaStatus = mapReadinessStatus(input.amnezia?.readinessSummary?.overallStatus)
  const mihomoStatus =
    input.mihomo?.running === false ? 'blocked' : input.mihomo?.running ? 'ready' : 'unknown'
  const tunStatus = input.mihomo?.tunEnabled
    ? mapComponentStatus(input.amnezia?.readinessSummary?.tunStatus)
    : 'unknown'
  const helperRoutingInjected = input.amnezia?.session?.routingTarget?.status === 'injected'
  const issues: string[] = []

  if (mihomoStatus === 'blocked') issues.push('mihomo_not_running')
  if (amneziaStatus === 'blocked') issues.push('amnezia_helper_blocked')
  if (input.mihomo?.tunEnabled && tunStatus === 'blocked') issues.push('tun_blocked')

  return {
    overallStatus: highestStatus([mihomoStatus, amneziaStatus, tunStatus]),
    mihomoStatus,
    amneziaStatus,
    tunStatus,
    helperRoutingInjected,
    helperEndpoint: helperEndpointLabel,
    issues
  }
}

export function createUnifiedSupportSummary(input: UnifiedSupportInput): UnifiedSupportSummary {
  const amnezia = input.amnezia?.readinessSummary
  const mihomoStatus =
    input.mihomo?.running === false ? 'blocked' : input.mihomo?.running ? 'ready' : 'unknown'
  const amneziaStatus = mapReadinessStatus(amnezia?.overallStatus)
  const tunStatus = mapComponentStatus(amnezia?.tunStatus)
  const dnsRuleReliabilityStatus = mapComponentStatus(amnezia?.dnsRuleReliabilityStatus)
  const udpStatus = mapComponentStatus(amnezia?.udpStatus)
  const releaseStatus = mapReleaseStatus(amnezia?.releaseStatus)
  const topIssues = [
    ...(mihomoStatus === 'blocked' ? ['mihomo_not_running'] : []),
    ...(amnezia?.topIssues?.map((issue) => issue.code || issue.message) ?? [])
  ]
  const recommendedActions =
    amnezia?.recommendedActions?.map((action) => action.code || action.message) ?? []
  const overallStatus = highestStatus([
    mihomoStatus,
    amneziaStatus,
    tunStatus,
    dnsRuleReliabilityStatus,
    udpStatus,
    releaseStatus
  ])

  return {
    overallStatus,
    primaryMessageKey: getSupportPrimaryMessageKey(overallStatus),
    mihomoStatus,
    amneziaStatus,
    tunStatus,
    dnsRuleReliabilityStatus,
    udpStatus,
    releaseStatus,
    topIssues,
    recommendedActions
  }
}

function createUnifiedProfileBadges(
  kind: ManagedProfileKind,
  runtimeSupport: ManagedRuntimeSupport,
  validityStatus: ManagedValidityStatus
): UnifiedBadge[] {
  const badges: UnifiedBadge[] =
    kind === 'amnezia'
      ? [
          { code: 'imported', labelKey: 'profile.badgeImported', tone: 'neutral' },
          { code: 'amnezia', labelKey: 'profile.badgeAmnezia', tone: 'info' }
        ]
      : [{ code: 'mihomo', labelKey: 'profile.badgeMihomo', tone: 'neutral' }]

  if (kind === 'amnezia') {
    if (runtimeSupport === 'prototype_available') {
      badges.push({
        code: 'runtime_prototype_available',
        labelKey: 'profile.badgeRuntimePrototypeAvailable',
        tone: 'warning'
      })
    } else if (runtimeSupport === 'requires_helper') {
      badges.push({
        code: 'runtime_requires_helper',
        labelKey: 'profile.badgeRuntimeRequiresHelper',
        tone: 'warning'
      })
    } else if (runtimeSupport === 'planned') {
      badges.push({
        code: 'runtime_planned',
        labelKey: 'profile.badgeRuntimePlanned',
        tone: 'warning'
      })
    } else if (runtimeSupport === 'none') {
      badges.push({
        code: 'runtime_not_supported',
        labelKey: 'profile.badgeRuntimeNotSupported',
        tone: 'danger'
      })
    }
  }

  if (validityStatus === 'invalid') {
    badges.push({ code: 'invalid', labelKey: 'profile.badgeInvalid', tone: 'danger' })
  } else if (validityStatus === 'partial') {
    badges.push({ code: 'partial', labelKey: 'profile.badgePartial', tone: 'warning' })
  }

  return badges
}

function getProfileStatus(
  validityStatus: ManagedValidityStatus,
  runtime: ProfileRuntimeCapabilities
): UnifiedStatusLevel {
  if (validityStatus === 'invalid') return 'blocked'
  if (validityStatus === 'partial') return 'warning'
  if (runtime.canActivate || runtime.requiresHelper) return 'ready'
  return 'warning'
}

function getProfileStatusCode(
  validityStatus: ManagedValidityStatus,
  runtime: ProfileRuntimeCapabilities
): string {
  if (validityStatus !== 'valid') return `profile_${validityStatus}`
  if (runtime.canActivate) return 'runtime_ready'
  if (runtime.requiresHelper) return 'helper_runtime'
  return 'runtime_unavailable'
}

function mapReadinessStatus(status: string | undefined): UnifiedStatusLevel {
  switch (status) {
    case 'ready':
      return 'ready'
    case 'ready_with_warnings':
      return 'warning'
    case 'blocked':
      return 'blocked'
    case 'unknown':
    default:
      return 'unknown'
  }
}

function mapComponentStatus(status: string | undefined): UnifiedStatusLevel {
  switch (status) {
    case 'ready':
    case 'not_applicable':
      return 'ready'
    case 'warning':
      return 'warning'
    case 'blocked':
      return 'blocked'
    case 'unknown':
    default:
      return 'unknown'
  }
}

function mapReleaseStatus(status: string | undefined): UnifiedStatusLevel {
  switch (status) {
    case 'supported':
      return 'ready'
    case 'warning':
      return 'warning'
    case 'blocked':
      return 'blocked'
    default:
      return 'unknown'
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
