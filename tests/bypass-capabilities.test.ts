import * as assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { describe, it } from 'node:test'
import {
  evaluateBypassCapabilities,
  type NativeProcessBypassCapability
} from '../src/core/routing/bypass-capabilities'
import type { DirectTunBypassResolution } from '../src/core/routing/direct-tun-bypass'
import type { LearnedProcessBypassResolution } from '../src/core/routing/learned-process-bypass'
import {
  buildLinuxNativeProcessBypassCommands,
  canUseNativeProcessBypass,
  detectLinuxNativeProcessBypassPrerequisites,
  getLinuxNativeProcessBypassPlan,
  startNativeProcessBypass,
  stopNativeProcessBypass,
  type NativeProcessBypassExecutor
} from '../src/main/runtime/native-process-bypass'

const directResolved: DirectTunBypassResolution = {
  enabled: true,
  mode: 'conservative',
  tunEnabled: true,
  status: 'resolved',
  directExcludeOverallStatus: 'active',
  active: true,
  directRuleCount: 1,
  excludableRuleCount: 1,
  supportedRuleCount: 1,
  unsupportedRuleCount: 0,
  partialRuleCount: 0,
  failedRuleCount: 0,
  resolvedAddressCount: 1,
  routeExcludeAddresses: ['149.154.160.0/20'],
  warnings: [],
  unsupportedRules: [],
  resolvedAt: 1_700_000_000_000
}

function nativeCapability(
  input: Partial<NativeProcessBypassCapability> = {}
): NativeProcessBypassCapability {
  return {
    enabled: false,
    platform: 'darwin',
    supportedOnPlatform: false,
    active: false,
    status: 'unsupported',
    requiresPrivileges: false,
    requiresService: false,
    diagnosticsReason: 'platform_unsupported',
    diagnostics: ['unsupported'],
    activeProcesses: [],
    ...input
  }
}

function learnedResolution(mode: 'learned_bypass' | 'direct_only'): LearnedProcessBypassResolution {
  return {
    enabled: true,
    supportedOnPlatform: true,
    platform: 'darwin',
    status: mode === 'learned_bypass' ? 'active' : 'observing',
    active: mode === 'learned_bypass',
    ruleCount: 1,
    processCount: mode === 'learned_bypass' ? 1 : 0,
    entryCount: mode === 'learned_bypass' ? 1 : 0,
    expiredCount: 0,
    resolvedAddressCount: mode === 'learned_bypass' ? 1 : 0,
    routeExcludeAddresses: mode === 'learned_bypass' ? ['149.154.167.50/32'] : [],
    entries: [],
    warnings: [],
    ruleModes: [
      {
        rule: 'PROCESS-NAME,Telegram,DIRECT',
        processName: 'Telegram',
        effectiveMode: mode,
        learnedEntryCount: mode === 'learned_bypass' ? 1 : 0
      }
    ],
    resolvedAt: 1_700_000_000_000
  }
}

describe('bypass capability model', () => {
  it('classifies IP-CIDR DIRECT as true bypass when route exclusions are active', () => {
    const report = evaluateBypassCapabilities({
      config: {
        tun: { enable: true },
        rules: ['IP-CIDR,149.154.160.0/20,DIRECT']
      },
      platform: 'darwin',
      nativeProcessBypass: nativeCapability(),
      directTunBypass: directResolved,
      now: () => 1
    })

    assert.equal(report.rules[0].effectiveBypassMode, 'true_bypass')
    assert.equal(report.summary.trueBypassRuleCount, 1)
  })

  it('uses native true bypass before learned bypass for PROCESS-NAME rules', () => {
    const report = evaluateBypassCapabilities({
      config: {
        tun: { enable: true },
        rules: ['PROCESS-NAME,Telegram,DIRECT']
      },
      platform: 'linux',
      nativeProcessBypass: nativeCapability({
        enabled: true,
        platform: 'linux',
        supportedOnPlatform: true,
        active: true,
        status: 'active',
        mechanism: 'linux-cgroup-fwmark',
        requiresPrivileges: true,
        requiresService: true,
        diagnosticsReason: 'native_process_bypass_active',
        diagnostics: [],
        activeProcesses: ['Telegram']
      }),
      learnedProcessBypass: learnedResolution('learned_bypass'),
      now: () => 1
    })

    assert.equal(report.rules[0].effectiveBypassMode, 'true_bypass')
    assert.equal(report.rules[0].requiresNativeBypass, true)
    assert.equal(report.summary.trueBypassRuleCount, 1)
    assert.equal(report.summary.learnedBypassRuleCount, 0)
  })

  it('falls back to learned bypass when native process bypass is unavailable', () => {
    const report = evaluateBypassCapabilities({
      config: {
        tun: { enable: true },
        rules: ['PROCESS-NAME,Telegram,DIRECT']
      },
      platform: 'darwin',
      nativeProcessBypass: nativeCapability(),
      learnedProcessBypass: learnedResolution('learned_bypass'),
      now: () => 1
    })

    assert.equal(report.rules[0].effectiveBypassMode, 'learned_bypass')
    assert.equal(report.summary.learnedBypassRuleCount, 1)
    assert.ok(report.warnings.some((warning) => warning.includes('learned IPs')))
  })

  it('keeps PROCESS-NAME DIRECT as direct_only when no native or learned bypass is active', () => {
    const report = evaluateBypassCapabilities({
      config: {
        tun: { enable: true },
        rules: ['PROCESS-NAME,Telegram,DIRECT']
      },
      platform: 'darwin',
      nativeProcessBypass: nativeCapability(),
      learnedProcessBypass: learnedResolution('direct_only'),
      now: () => 1
    })

    assert.equal(report.rules[0].effectiveBypassMode, 'direct_only')
    assert.equal(report.rules[0].diagnosticsReason, 'native_process_bypass_unsupported')
    assert.equal(report.summary.directOnlyRuleCount, 1)
  })
})

describe('Linux native process bypass MVP', () => {
  it('reports unsupported native bypass on non-Linux platforms', () => {
    const capability = canUseNativeProcessBypass({ enabled: true, platform: 'darwin' })

    assert.equal(capability.supportedOnPlatform, false)
    assert.equal(capability.status, 'unsupported')
    assert.equal(capability.active, false)
  })

  it('reports Linux availability before privileged apply is attempted', () => {
    const capability = canUseNativeProcessBypass({ enabled: true, platform: 'linux' })

    assert.equal(capability.supportedOnPlatform, true)
    assert.equal(capability.status, 'available')
    assert.equal(capability.active, false)
    assert.equal(capability.requiresPrivileges, true)
    assert.equal(capability.mechanism, 'linux-cgroup-fwmark')
  })

  it('detects missing Linux prerequisites without running privileged commands', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'koala-native-bypass-'))
    const executor = createMockExecutor({ availableCommands: ['ip'] })
    const prerequisites = await detectLinuxNativeProcessBypassPrerequisites({
      enabled: true,
      platform: 'linux',
      executor,
      paths: {
        cgroupRoot: root,
        procRoot: root
      },
      getUid: () => 0
    })

    assert.equal(prerequisites.status, 'missing_prerequisites')
    assert.ok(prerequisites.issues.some((issue) => issue.code === 'cgroup_v2_missing'))
    assert.ok(prerequisites.issues.some((issue) => issue.code === 'nft_missing'))
  })

  it('applies and cleans up native process bypass with a mock Linux executor', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'koala-native-bypass-'))
    const cgroupRoot = path.join(root, 'cgroup')
    const procRoot = path.join(root, 'proc')
    await mkdir(cgroupRoot)
    await writeFile(path.join(cgroupRoot, 'cgroup.controllers'), 'cpu io memory')
    await mkdir(path.join(procRoot, '101'), { recursive: true })
    await mkdir(path.join(procRoot, '102'), { recursive: true })
    await writeFile(path.join(procRoot, '101', 'comm'), 'Telegram\n')
    await writeFile(path.join(procRoot, '102', 'comm'), 'Browser\n')
    const executor = createMockExecutor({ availableCommands: ['ip', 'nft'] })

    const capability = await startNativeProcessBypass({
      enabled: true,
      platform: 'linux',
      processNames: ['Telegram'],
      executor,
      paths: { cgroupRoot, procRoot },
      getUid: () => 0
    })

    assert.equal(capability.status, 'active')
    assert.equal(capability.active, true)
    assert.deepEqual(capability.activeProcesses, ['Telegram'])
    assert.deepEqual(capability.boundPids, [101])
    assert.ok(executor.calls.some((call) => call.command === 'nft' && call.args[0] === '-f'))
    assert.ok(
      executor.calls.some(
        (call) => call.command === 'ip' && call.args.includes('add') && call.args.includes('fwmark')
      )
    )

    await stopNativeProcessBypass({
      enabled: true,
      platform: 'linux',
      executor,
      paths: { cgroupRoot, procRoot }
    })

    assert.ok(
      executor.calls.some(
        (call) => call.command === 'ip' && call.args.includes('del') && call.args.includes('fwmark')
      )
    )
    assert.ok(
      executor.calls.some(
        (call) => call.command === 'nft' && call.args[0] === 'delete' && call.args.includes('table')
      )
    )
  })

  it('reports nft apply failures and falls back to non-active capability', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'koala-native-bypass-'))
    const cgroupRoot = path.join(root, 'cgroup')
    const procRoot = path.join(root, 'proc')
    await mkdir(cgroupRoot)
    await writeFile(path.join(cgroupRoot, 'cgroup.controllers'), 'cpu io memory')
    await mkdir(path.join(procRoot, '101'), { recursive: true })
    await writeFile(path.join(procRoot, '101', 'comm'), 'Telegram\n')
    const executor = createMockExecutor({ availableCommands: ['ip', 'nft'], failNftApply: true })

    const capability = await startNativeProcessBypass({
      enabled: true,
      platform: 'linux',
      processNames: ['Telegram'],
      executor,
      paths: { cgroupRoot, procRoot },
      getUid: () => 0
    })

    assert.equal(capability.status, 'blocked')
    assert.equal(capability.active, false)
    assert.equal(capability.diagnosticsReason, 'nft_apply_failed')
  })

  it('documents the Linux cgroup plus fwmark integration plan', () => {
    const plan = getLinuxNativeProcessBypassPlan()

    assert.equal(plan.mechanism, 'linux-cgroup-fwmark')
    assert.ok(plan.requiredCapabilities.includes('CAP_NET_ADMIN'))
    assert.ok(plan.setupSteps.some((step) => step.includes('cgroup')))
    assert.ok(plan.setupSteps.some((step) => step.includes('fwmark')))
  })

  it('generates deterministic apply and cleanup commands', () => {
    const commands = buildLinuxNativeProcessBypassCommands()

    assert.equal(commands.apply[0].command, 'nft')
    assert.equal(commands.apply[1].args.join(' '), '-f -')
    assert.ok(commands.apply[1].stdin?.includes('socket cgroupv2'))
    assert.ok(
      commands.apply.some((command) => command.command === 'ip' && command.args[1] === 'add')
    )
    assert.ok(
      commands.cleanup.some((command) => command.command === 'ip' && command.args[1] === 'del')
    )
  })
})

function createMockExecutor(input: {
  availableCommands: string[]
  failNftApply?: boolean
}): NativeProcessBypassExecutor & {
  calls: Array<{ command: string; args: string[]; stdin?: string }>
} {
  const calls: Array<{ command: string; args: string[]; stdin?: string }> = []
  return {
    calls,
    async run(command, args, stdin) {
      calls.push({ command, args, stdin })
      if (command === 'sh' && args[1]?.startsWith('command -v ')) {
        const checked = args[1].replace('command -v ', '').trim()
        if (input.availableCommands.includes(checked))
          return { stdout: `/usr/bin/${checked}\n`, stderr: '' }
        throw new Error(`${checked} missing`)
      }
      if (command === 'nft' && args[0] === 'delete') {
        throw new Error('table does not exist')
      }
      if (command === 'nft' && input.failNftApply && args[0] === '-f') {
        throw new Error('nft syntax failed')
      }
      return { stdout: '', stderr: '' }
    }
  }
}
