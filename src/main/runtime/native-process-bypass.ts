import { execFile as nodeExecFile, spawn } from 'node:child_process'
import { constants as fsConstants, readFileSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { promisify } from 'node:util'
import type {
  LinuxNativeProcessBypassIssue,
  LinuxNativeProcessBypassIssueCode,
  LinuxNativeProcessBypassPrerequisiteStatus,
  NativeProcessBypassCapability,
  NativeProcessBypassMechanism
} from '../../core/routing/bypass-capabilities'

export interface LinuxNativeProcessBypassPrerequisites {
  platform: string
  status: LinuxNativeProcessBypassPrerequisiteStatus
  cgroupV2Available: boolean
  nftAvailable: boolean
  ipAvailable: boolean
  hasRequiredPrivileges: boolean
  cgroupWritable: boolean
  issues: LinuxNativeProcessBypassIssue[]
}

export interface NativeProcessBypassOptions {
  enabled?: boolean
  platform?: string
  processNames?: string[]
  activeProcesses?: string[]
  executor?: NativeProcessBypassExecutor
  paths?: Partial<LinuxNativeProcessBypassPaths>
  getUid?: () => number | undefined
  capEffHex?: string
}

export interface NativeProcessBypassCommandPlan {
  mechanism: NativeProcessBypassMechanism
  requiredCapabilities: string[]
  setupSteps: string[]
  cleanupSteps: string[]
}

export interface NativeProcessBypassCommand {
  command: string
  args: string[]
  stdin?: string
  ignoreFailure?: boolean
}

export interface NativeProcessBypassExecutor {
  run(command: string, args: string[], stdin?: string): Promise<{ stdout: string; stderr: string }>
}

export interface LinuxNativeProcessBypassPaths {
  cgroupRoot: string
  procRoot: string
}

interface AppliedNativeProcessBypassState {
  processNames: string[]
  boundPids: number[]
  appliedAt: number
}

const linuxMechanism: NativeProcessBypassMechanism = 'linux-cgroup-fwmark'
const tableName = 'koala_process_bypass'
const chainName = 'output'
const cgroupName = 'koala-clash-bypass'
const fwmark = '0x4b0a1a'
const ipRulePriority = '100'
const defaultPaths: LinuxNativeProcessBypassPaths = {
  cgroupRoot: '/sys/fs/cgroup',
  procRoot: '/proc'
}

const execFile = promisify(nodeExecFile)
let currentStatus: NativeProcessBypassCapability | undefined
let appliedState: AppliedNativeProcessBypassState | undefined

export function canUseNativeProcessBypass(
  options: NativeProcessBypassOptions = {}
): NativeProcessBypassCapability {
  const enabled = options.enabled ?? false
  const platform = options.platform ?? process.platform
  const activeProcesses = options.activeProcesses ?? []

  if (platform !== 'linux') {
    return createCapability({
      enabled,
      platform,
      supportedOnPlatform: false,
      active: false,
      status: 'unsupported',
      diagnosticsReason: 'platform_unsupported',
      diagnostics: [
        'Native process bypass is currently implemented only on Linux. Learned bypass remains the fallback.'
      ],
      activeProcesses: []
    })
  }

  if (!enabled) {
    return createCapability({
      enabled: false,
      platform,
      supportedOnPlatform: true,
      active: false,
      status: 'disabled',
      diagnosticsReason: 'feature_disabled',
      diagnostics: ['Linux native process bypass is available, but the feature is disabled.'],
      activeProcesses: []
    })
  }

  return createCapability({
    enabled: true,
    platform,
    supportedOnPlatform: true,
    active: false,
    status: 'available',
    diagnosticsReason: 'linux_supported_pending_apply',
    diagnostics: [
      'Linux native process bypass can be attempted with cgroup v2, nftables/fwmark, and policy routing.',
      'Only already-running processes with an exact process-name match are bound in this MVP.'
    ],
    activeProcesses
  })
}

export async function detectLinuxNativeProcessBypassPrerequisites(
  options: NativeProcessBypassOptions = {}
): Promise<LinuxNativeProcessBypassPrerequisites> {
  const platform = options.platform ?? process.platform
  const paths = { ...defaultPaths, ...options.paths }
  const executor = options.executor ?? defaultExecutor
  const issues: LinuxNativeProcessBypassIssue[] = []

  if (platform !== 'linux') {
    return {
      platform,
      status: 'not_linux',
      cgroupV2Available: false,
      nftAvailable: false,
      ipAvailable: false,
      hasRequiredPrivileges: false,
      cgroupWritable: false,
      issues: [
        {
          code: 'not_linux',
          message: 'Native process bypass MVP is Linux-only.'
        }
      ]
    }
  }

  const cgroupV2Available = await exists(path.join(paths.cgroupRoot, 'cgroup.controllers'))
  const nftAvailable = await commandAvailable(executor, 'nft')
  const ipAvailable = await commandAvailable(executor, 'ip')
  const hasRequiredPrivileges = hasNativeBypassPrivileges(options)
  const cgroupWritable = await canWrite(paths.cgroupRoot)

  if (!cgroupV2Available) {
    issues.push({ code: 'cgroup_v2_missing', message: 'cgroup v2 is not available.' })
  }
  if (!nftAvailable) {
    issues.push({ code: 'nft_missing', message: 'nft command is not available.' })
  }
  if (!ipAvailable) {
    issues.push({ code: 'ip_missing', message: 'ip command is not available.' })
  }
  if (!hasRequiredPrivileges) {
    issues.push({
      code: 'insufficient_privileges',
      message: 'CAP_NET_ADMIN or root privileges are required for nftables and policy routing.'
    })
  }
  if (!cgroupWritable) {
    issues.push({
      code: 'cgroup_not_writable',
      message: 'The cgroup v2 root is not writable by this process.'
    })
  }

  const missingTooling = !cgroupV2Available || !nftAvailable || !ipAvailable
  const privilegeProblem = !hasRequiredPrivileges || !cgroupWritable
  const status: LinuxNativeProcessBypassPrerequisiteStatus = missingTooling
    ? 'missing_prerequisites'
    : privilegeProblem
      ? 'insufficient_privileges'
      : 'supported'

  return {
    platform,
    status,
    cgroupV2Available,
    nftAvailable,
    ipAvailable,
    hasRequiredPrivileges,
    cgroupWritable,
    issues
  }
}

export async function startNativeProcessBypass(
  options: NativeProcessBypassOptions = {}
): Promise<NativeProcessBypassCapability> {
  const base = canUseNativeProcessBypass(options)
  if (base.platform !== 'linux' || !base.enabled) {
    await cleanupLinuxNativeProcessBypass(options)
    currentStatus = base
    return cloneCapability(currentStatus)
  }

  const processNames = normalizeProcessNames(options.processNames ?? options.activeProcesses ?? [])
  if (processNames.length === 0) {
    await cleanupLinuxNativeProcessBypass(options)
    currentStatus = createCapability({
      ...base,
      active: false,
      status: 'available',
      diagnosticsReason: 'no_process_names',
      diagnostics: [
        ...base.diagnostics,
        'No PROCESS-NAME DIRECT rules are eligible for native bypass.'
      ]
    })
    return cloneCapability(currentStatus)
  }

  const prerequisites = await detectLinuxNativeProcessBypassPrerequisites(options)
  if (prerequisites.status !== 'supported') {
    await cleanupLinuxNativeProcessBypass(options)
    currentStatus = createCapability({
      ...base,
      active: false,
      status: prerequisites.status === 'not_linux' ? 'unsupported' : 'blocked',
      diagnosticsReason: prerequisites.status,
      diagnostics: [
        ...base.diagnostics,
        ...prerequisites.issues.map((issue) => `${issue.code}: ${issue.message}`)
      ],
      prerequisiteStatus: prerequisites.status,
      prerequisiteIssues: prerequisites.issues
    })
    return cloneCapability(currentStatus)
  }

  const paths = { ...defaultPaths, ...options.paths }
  const pids = await findLinuxProcessPidsByExactName(processNames, paths)
  if (pids.length === 0) {
    await cleanupLinuxNativeProcessBypass(options)
    currentStatus = createCapability({
      ...base,
      active: false,
      status: 'available',
      diagnosticsReason: 'no_matching_processes',
      diagnostics: [
        ...base.diagnostics,
        `No currently-running process matched: ${processNames.join(', ')}.`
      ],
      prerequisiteStatus: prerequisites.status,
      prerequisiteIssues: prerequisites.issues
    })
    return cloneCapability(currentStatus)
  }

  try {
    await applyLinuxNativeProcessBypass({ ...options, processNames, pids })
    appliedState = {
      processNames,
      boundPids: pids,
      appliedAt: Date.now()
    }
    currentStatus = createCapability({
      ...base,
      active: true,
      status: 'active',
      diagnosticsReason: 'native_process_bypass_applied',
      diagnostics: [
        `Native process bypass applied for ${processNames.length} process name(s).`,
        `Bound ${pids.length} process id(s) to cgroup ${cgroupName}.`,
        'Future processes are not automatically bound in this MVP; reload to refresh process membership.'
      ],
      activeProcesses: processNames,
      boundPids: pids,
      appliedAt: appliedState.appliedAt,
      prerequisiteStatus: prerequisites.status,
      prerequisiteIssues: prerequisites.issues
    })
    return cloneCapability(currentStatus)
  } catch (error) {
    await cleanupLinuxNativeProcessBypass({ ...options, pids })
    const issue = classifyApplyError(error)
    currentStatus = createCapability({
      ...base,
      active: false,
      status: 'blocked',
      diagnosticsReason: issue.code,
      diagnostics: [...base.diagnostics, `${issue.code}: ${issue.message}`],
      prerequisiteStatus: prerequisites.status,
      prerequisiteIssues: [...prerequisites.issues, issue]
    })
    return cloneCapability(currentStatus)
  }
}

export async function stopNativeProcessBypass(
  options: NativeProcessBypassOptions = {}
): Promise<NativeProcessBypassCapability> {
  const previous = currentStatus
  const cleanup = await cleanupLinuxNativeProcessBypass({
    ...options,
    activeProcesses: previous?.activeProcesses
  })
  currentStatus = canUseNativeProcessBypass({
    enabled: previous?.enabled ?? options.enabled ?? false,
    platform: previous?.platform ?? options.platform ?? process.platform
  })
  if (!cleanup.ok) {
    currentStatus = createCapability({
      ...currentStatus,
      active: false,
      status: 'blocked',
      diagnosticsReason: 'cleanup_failed',
      diagnostics: [...currentStatus.diagnostics, ...cleanup.diagnostics],
      prerequisiteIssues: cleanup.issues
    })
  }
  return cloneCapability(currentStatus)
}

export function getNativeProcessBypassStatus(
  options: NativeProcessBypassOptions = {}
): NativeProcessBypassCapability {
  if (!currentStatus) {
    return canUseNativeProcessBypass(options)
  }
  const desiredPlatform = options.platform ?? currentStatus.platform
  const desiredEnabled = options.enabled ?? currentStatus.enabled
  if (desiredPlatform !== currentStatus.platform || desiredEnabled !== currentStatus.enabled) {
    return canUseNativeProcessBypass(options)
  }
  return cloneCapability(currentStatus)
}

export async function syncNativeProcessBypass(input: {
  enabled: boolean
  tunEnabled: boolean
  processNames: string[]
  platform?: string
}): Promise<NativeProcessBypassCapability> {
  const platform = input.platform ?? process.platform
  if (!input.enabled || !input.tunEnabled || input.processNames.length === 0) {
    return stopNativeProcessBypass({ enabled: input.enabled, platform })
  }
  return startNativeProcessBypass({
    enabled: input.enabled,
    platform,
    processNames: input.processNames
  })
}

export function getLinuxNativeProcessBypassPlan(): NativeProcessBypassCommandPlan {
  return {
    mechanism: linuxMechanism,
    requiredCapabilities: ['CAP_NET_ADMIN', 'cgroup v2 write access'],
    setupSteps: [
      'detect cgroup v2, nft, ip, and required privileges',
      'create an app-owned cgroup for currently-running matching processes',
      'install nftables route-hook rules that set a fwmark for cgroup traffic',
      'install a high-priority policy rule for the fwmark via the main routing table',
      'move exact PROCESS-NAME matching PIDs into the bypass cgroup'
    ],
    cleanupSteps: [
      'move bound PIDs back to the root cgroup where possible',
      'remove the fwmark policy routing rule',
      'delete the nftables table created by Koala',
      'remove the app-owned cgroup when empty'
    ]
  }
}

export function buildLinuxNativeProcessBypassCommands(): {
  apply: NativeProcessBypassCommand[]
  cleanup: NativeProcessBypassCommand[]
} {
  const nftScript = [
    `table inet ${tableName} {`,
    `  chain ${chainName} {`,
    '    type route hook output priority mangle; policy accept;',
    `    socket cgroupv2 level 1 "${cgroupName}" meta mark set ${fwmark}`,
    '  }',
    '}',
    ''
  ].join('\n')

  return {
    apply: [
      { command: 'nft', args: ['delete', 'table', 'inet', tableName], ignoreFailure: true },
      { command: 'nft', args: ['-f', '-'], stdin: nftScript },
      {
        command: 'ip',
        args: ['rule', 'del', 'fwmark', fwmark, 'lookup', 'main', 'priority', ipRulePriority],
        ignoreFailure: true
      },
      {
        command: 'ip',
        args: ['rule', 'add', 'fwmark', fwmark, 'lookup', 'main', 'priority', ipRulePriority]
      }
    ],
    cleanup: [
      {
        command: 'ip',
        args: ['rule', 'del', 'fwmark', fwmark, 'lookup', 'main', 'priority', ipRulePriority],
        ignoreFailure: true
      },
      { command: 'nft', args: ['delete', 'table', 'inet', tableName], ignoreFailure: true }
    ]
  }
}

async function applyLinuxNativeProcessBypass(
  options: NativeProcessBypassOptions & { processNames: string[]; pids: number[] }
): Promise<void> {
  const paths = { ...defaultPaths, ...options.paths }
  const executor = options.executor ?? defaultExecutor
  const cgroupPath = path.join(paths.cgroupRoot, cgroupName)
  await cleanupLinuxNativeProcessBypass(options)

  try {
    await fs.mkdir(cgroupPath, { recursive: true })
  } catch (error) {
    throw createNativeBypassError('cgroup_creation_failed', error)
  }

  const commands = buildLinuxNativeProcessBypassCommands()
  for (const command of commands.apply) {
    try {
      await executor.run(command.command, command.args, command.stdin)
    } catch (error) {
      if (command.ignoreFailure) continue
      if (command.command === 'nft') throw createNativeBypassError('nft_apply_failed', error)
      if (command.command === 'ip') {
        throw createNativeBypassError('policy_route_apply_failed', error)
      }
      throw error
    }
  }

  try {
    for (const pid of options.pids) {
      await fs.writeFile(path.join(cgroupPath, 'cgroup.procs'), `${pid}`)
    }
  } catch (error) {
    throw createNativeBypassError('process_binding_failed', error)
  }
}

async function cleanupLinuxNativeProcessBypass(
  options: NativeProcessBypassOptions & { pids?: number[] }
): Promise<{ ok: boolean; diagnostics: string[]; issues: LinuxNativeProcessBypassIssue[] }> {
  const platform = options.platform ?? process.platform
  if (platform !== 'linux') return { ok: true, diagnostics: [], issues: [] }
  const paths = { ...defaultPaths, ...options.paths }
  const executor = options.executor ?? defaultExecutor
  const diagnostics: string[] = []
  const issues: LinuxNativeProcessBypassIssue[] = []
  let ok = true

  const pids = options.pids ?? appliedState?.boundPids ?? []
  for (const pid of pids) {
    try {
      await fs.writeFile(path.join(paths.cgroupRoot, 'cgroup.procs'), `${pid}`)
    } catch (error) {
      diagnostics.push(`cleanup_failed: could not move pid ${pid} to root cgroup: ${error}`)
    }
  }

  for (const command of buildLinuxNativeProcessBypassCommands().cleanup) {
    try {
      await executor.run(command.command, command.args, command.stdin)
    } catch (error) {
      if (!command.ignoreFailure) {
        ok = false
        const issue = createIssue('cleanup_failed', `Cleanup command failed: ${error}`)
        issues.push(issue)
        diagnostics.push(`${issue.code}: ${issue.message}`)
      }
    }
  }

  try {
    await fs.rm(path.join(paths.cgroupRoot, cgroupName), { force: true })
  } catch (error) {
    ok = false
    const issue = createIssue('cleanup_failed', `Could not remove cgroup: ${error}`)
    issues.push(issue)
    diagnostics.push(`${issue.code}: ${issue.message}`)
  }

  if (ok) {
    appliedState = undefined
  }
  return { ok, diagnostics, issues }
}

async function findLinuxProcessPidsByExactName(
  processNames: string[],
  paths: LinuxNativeProcessBypassPaths
): Promise<number[]> {
  const expected = new Set(processNames)
  const result: number[] = []
  let entries: string[]
  try {
    entries = await fs.readdir(paths.procRoot)
  } catch {
    return result
  }

  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue
    try {
      const comm = (await fs.readFile(path.join(paths.procRoot, entry, 'comm'), 'utf-8')).trim()
      if (expected.has(comm)) result.push(Number(entry))
    } catch {
      // Processes can exit while /proc is being scanned.
    }
  }
  return result.sort((a, b) => a - b)
}

function hasNativeBypassPrivileges(options: NativeProcessBypassOptions): boolean {
  const uid =
    options.getUid?.() ?? (typeof process.getuid === 'function' ? process.getuid() : undefined)
  if (uid === 0) return true
  const capEffHex = options.capEffHex ?? readCurrentCapEff()
  return hasLinuxCapability(capEffHex, 12)
}

function hasLinuxCapability(capEffHex: string | undefined, bit: number): boolean {
  if (!capEffHex) return false
  const value = BigInt(`0x${capEffHex.trim()}`)
  return (value & (1n << BigInt(bit))) !== 0n
}

function readCurrentCapEff(): string | undefined {
  try {
    const status = readFileSync('/proc/self/status', 'utf-8')
    return status
      .split('\n')
      .find((line) => line.startsWith('CapEff:'))
      ?.split(/\s+/)[1]
  } catch {
    return undefined
  }
}

async function commandAvailable(
  executor: NativeProcessBypassExecutor,
  command: string
): Promise<boolean> {
  try {
    await executor.run('sh', ['-c', `command -v ${command}`])
    return true
  } catch {
    return false
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

async function canWrite(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, fsConstants.W_OK)
    return true
  } catch {
    return false
  }
}

const defaultExecutor: NativeProcessBypassExecutor = {
  run(command, args, stdin) {
    if (stdin === undefined) {
      return execFile(command, args).then(({ stdout, stderr }) => ({
        stdout: String(stdout),
        stderr: String(stderr)
      }))
    }

    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString()
      })
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
      })
      child.on('error', reject)
      child.on('close', (code) => {
        if (code === 0) resolve({ stdout, stderr })
        else reject(new Error(`${command} ${args.join(' ')} exited with ${code}: ${stderr}`))
      })
      child.stdin.end(stdin)
    })
  }
}

function createCapability(
  input: Omit<
    NativeProcessBypassCapability,
    'mechanism' | 'requiresPrivileges' | 'requiresService'
  > &
    Partial<
      Pick<
        NativeProcessBypassCapability,
        | 'mechanism'
        | 'requiresPrivileges'
        | 'requiresService'
        | 'prerequisiteStatus'
        | 'prerequisiteIssues'
        | 'boundPids'
        | 'appliedAt'
      >
    >
): NativeProcessBypassCapability {
  return {
    mechanism: input.supportedOnPlatform ? linuxMechanism : input.mechanism,
    requiresPrivileges: input.supportedOnPlatform,
    requiresService: input.supportedOnPlatform,
    ...input,
    diagnostics: [...input.diagnostics],
    activeProcesses: [...input.activeProcesses],
    prerequisiteIssues: input.prerequisiteIssues?.map((issue) => ({ ...issue })),
    boundPids: input.boundPids ? [...input.boundPids] : undefined
  }
}

function normalizeProcessNames(processNames: string[]): string[] {
  return [...new Set(processNames.map((name) => name.trim()).filter(Boolean))].sort()
}

function classifyApplyError(error: unknown): LinuxNativeProcessBypassIssue {
  if (isNativeBypassError(error)) return createIssue(error.code, error.message)
  return createIssue('process_binding_failed', String(error))
}

function createNativeBypassError(code: LinuxNativeProcessBypassIssueCode, error: unknown): Error {
  const wrapped = new Error(String(error)) as Error & { code: LinuxNativeProcessBypassIssueCode }
  wrapped.code = code
  return wrapped
}

function isNativeBypassError(
  error: unknown
): error is Error & { code: LinuxNativeProcessBypassIssueCode } {
  return error instanceof Error && 'code' in error
}

function createIssue(
  code: LinuxNativeProcessBypassIssueCode,
  message: string
): LinuxNativeProcessBypassIssue {
  return { code, message }
}

function cloneCapability(capability: NativeProcessBypassCapability): NativeProcessBypassCapability {
  return {
    ...capability,
    diagnostics: [...capability.diagnostics],
    activeProcesses: [...capability.activeProcesses],
    prerequisiteIssues: capability.prerequisiteIssues?.map((issue) => ({ ...issue })),
    boundPids: capability.boundPids ? [...capability.boundPids] : undefined
  }
}
