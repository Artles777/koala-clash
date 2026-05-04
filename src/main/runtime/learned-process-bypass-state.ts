import {
  LearnedProcessBypassEntry,
  LearnedProcessBypassResolution
} from '../../core/routing/learned-process-bypass'

export const defaultLearnedProcessBypassTtlMs = 10 * 60 * 1000

interface ObserveProcessBypassOptions {
  ttlMs?: number
  platform?: string
  now?: () => number
}

interface ObserveProcessBypassResult {
  changed: boolean
  observed: number
  ignored: number
}

const entries = new Map<string, LearnedProcessBypassEntry>()
let lastResolution: LearnedProcessBypassResolution | undefined

export function observeProcessBypassConnections(
  payload: ControllerConnections,
  options: ObserveProcessBypassOptions = {}
): ObserveProcessBypassResult {
  const now = options.now?.() ?? Date.now()
  const ttlMs = options.ttlMs ?? defaultLearnedProcessBypassTtlMs
  const platform = options.platform ?? process.platform
  let changed = false
  let observed = 0
  let ignored = 0

  for (const connection of payload.connections ?? []) {
    const processName = connection.metadata?.process?.trim()
    const destinationIp = connection.metadata?.destinationIP?.trim()
    if (
      !processName ||
      !destinationIp ||
      !isProcessNameDirectConnection(connection) ||
      !isSupportedIp(destinationIp)
    ) {
      ignored += 1
      continue
    }

    const normalizedIp = normalizeIp(destinationIp)
    const key = createEntryKey(processName, normalizedIp)
    const existing = entries.get(key)
    const wasActive = Boolean(existing && existing.ttlExpiresAt > now)
    const next: LearnedProcessBypassEntry = {
      processName,
      observedIp: normalizedIp,
      observedAt: now,
      ttlExpiresAt: now + ttlMs,
      sourceConfidence: 'runtime_connection',
      platform,
      active: true,
      learnedFromRuntime: true,
      notes: `Observed from Mihomo ${connection.rule}/${connection.rulePayload || processName}`
    }

    entries.set(key, next)
    observed += 1
    if (!wasActive) changed = true
  }

  return { changed, observed, ignored }
}

export function getObservedProcessBypassEntries(): LearnedProcessBypassEntry[] {
  return [...entries.values()].map(cloneEntry)
}

export function clearObservedProcessBypassEntries(): void {
  entries.clear()
}

export function updateLearnedProcessBypassState(
  resolution: LearnedProcessBypassResolution | undefined
): void {
  lastResolution = resolution ? cloneResolution(resolution) : undefined
}

export function getLastLearnedProcessBypass(): LearnedProcessBypassResolution | undefined {
  return cloneResolution(lastResolution)
}

function isProcessNameDirectConnection(connection: ControllerConnectionDetail): boolean {
  const rule = connection.rule?.toLowerCase()
  return (
    rule === 'processname' &&
    connection.chains?.some((chain) => chain.toUpperCase() === 'DIRECT') === true
  )
}

function createEntryKey(processName: string, ip: string): string {
  return `${processName.trim().toLowerCase()}\0${ip}`
}

function isSupportedIp(value: string): boolean {
  return isIpv4Address(normalizeIp(value)) || isIpv6Address(normalizeIp(value))
}

function normalizeIp(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return trimmed.slice(1, -1)
  return trimmed
}

function isIpv4Address(value: string): boolean {
  const parts = value.split('.')
  if (parts.length !== 4) return false
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false
    const octet = Number(part)
    return Number.isInteger(octet) && octet >= 0 && octet <= 255
  })
}

function isIpv6Address(value: string): boolean {
  return value.includes(':') && /^[0-9a-fA-F:.]+$/.test(value)
}

function cloneEntry(entry: LearnedProcessBypassEntry): LearnedProcessBypassEntry {
  return { ...entry }
}

function cloneResolution(
  resolution: LearnedProcessBypassResolution | undefined
): LearnedProcessBypassResolution | undefined {
  if (!resolution) return undefined
  return {
    ...resolution,
    routeExcludeAddresses: [...resolution.routeExcludeAddresses],
    entries: resolution.entries.map(cloneEntry),
    warnings: resolution.warnings.map((warning) => ({ ...warning })),
    ruleModes: resolution.ruleModes.map((mode) => ({ ...mode }))
  }
}
