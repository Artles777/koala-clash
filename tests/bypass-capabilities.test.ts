import * as assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
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
  detectMacosNativeProcessBypassPrerequisites,
  detectWindowsNativeProcessBypassPrerequisites,
  getLinuxNativeProcessBypassPlan,
  getNativeProcessBypassStatus,
  getWindowsNativeProcessBypassPlan,
  reconcileNativeProcessBypass,
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
  resolvedRules: [
    {
      rule: 'IP-CIDR,149.154.160.0/20,DIRECT',
      ruleType: 'IP-CIDR',
      value: '149.154.160.0/20',
      routeExcludeAddresses: ['149.154.160.0/20'],
      coverage: 'exact_route_exclude'
    }
  ],
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

  it('does not treat unrelated IP-CIDR rules as covered by another route exclusion', () => {
    const report = evaluateBypassCapabilities({
      config: {
        tun: { enable: true },
        rules: ['IP-CIDR,149.154.160.0/20,DIRECT', 'IP-CIDR,203.0.113.0/24,DIRECT']
      },
      platform: 'darwin',
      nativeProcessBypass: nativeCapability(),
      directTunBypass: directResolved,
      now: () => 1
    })

    assert.equal(report.rules[0].effectiveBypassMode, 'true_bypass')
    assert.equal(report.rules[1].effectiveBypassMode, 'direct_only')
    assert.equal(report.summary.trueBypassRuleCount, 1)
    assert.equal(report.summary.directOnlyRuleCount, 1)
  })

  it('reports domain route exclusions as partial because they are DNS-derived', () => {
    const domainResolved: DirectTunBypassResolution = {
      ...directResolved,
      status: 'resolved',
      directRuleCount: 1,
      excludableRuleCount: 1,
      supportedRuleCount: 1,
      resolvedAddressCount: 1,
      routeExcludeAddresses: ['149.154.167.99/32'],
      resolvedRules: [
        {
          rule: 'DOMAIN,telegram.org,DIRECT',
          ruleType: 'DOMAIN',
          value: 'telegram.org',
          routeExcludeAddresses: ['149.154.167.99/32'],
          coverage: 'resolved_ip_route_exclude'
        }
      ]
    }
    const report = evaluateBypassCapabilities({
      config: {
        tun: { enable: true },
        rules: ['DOMAIN,telegram.org,DIRECT']
      },
      platform: 'darwin',
      nativeProcessBypass: nativeCapability(),
      directTunBypass: domainResolved,
      now: () => 1
    })

    assert.equal(report.rules[0].effectiveBypassMode, 'partial_bypass')
    assert.equal(report.rules[0].diagnosticsReason, 'domain_route_excluded_by_ip')
    assert.equal(report.summary.partialBypassRuleCount, 1)
    assert.equal(report.summary.trueBypassRuleCount, 0)
    assert.ok(report.warnings.some((warning) => warning.includes('DNS-derived IP exclusions')))
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

  it('allows a future active Windows native adapter to take precedence over learned bypass', () => {
    const report = evaluateBypassCapabilities({
      config: {
        tun: { enable: true },
        rules: ['PROCESS-NAME,Telegram,DIRECT']
      },
      platform: 'win32',
      nativeProcessBypass: nativeCapability({
        enabled: true,
        platform: 'win32',
        supportedOnPlatform: true,
        active: true,
        status: 'active',
        mechanism: 'windows-wfp-service',
        platformMode: 'windows_wfp_service',
        nativeDataPlaneActive: true,
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
    assert.equal(capability.platformMode, 'macos_fallback_only')
    assert.equal(capability.fallbackOnly, true)
  })

  it('reports Windows native bypass as scaffolded but not active', () => {
    const capability = canUseNativeProcessBypass({ enabled: true, platform: 'win32' })

    assert.equal(capability.supportedOnPlatform, true)
    assert.equal(capability.status, 'available')
    assert.equal(capability.active, false)
    assert.equal(capability.mechanism, 'windows-wfp-service')
    assert.equal(capability.platformMode, 'windows_wfp_service')
    assert.equal(capability.nativeDataPlaneActive, false)
    assert.equal(capability.diagnosticsReason, 'windows_wfp_service_pending_apply')
  })

  it('detects macOS controller status without claiming true bypass', async () => {
    const executor = createMockExecutor({
      availableCommands: ['koala-macos-process-bypassctl']
    })
    const prerequisites = await detectMacosNativeProcessBypassPrerequisites({
      enabled: true,
      platform: 'darwin',
      executor
    })

    assert.equal(prerequisites.controllerAvailable, true)
    assert.equal(prerequisites.dataPlaneActive, false)
    assert.equal(prerequisites.fallbackOnly, true)
    assert.equal(prerequisites.status, 'macos_user_approval_required')
    assert.ok(prerequisites.issues.some((issue) => issue.code === 'macos_user_approval_required'))
  })

  it('keeps macOS native controller integration fallback-only without active data plane', async () => {
    const executor = createMockExecutor({
      availableCommands: ['koala-macos-process-bypassctl']
    })
    const capability = await startNativeProcessBypass({
      enabled: true,
      platform: 'darwin',
      processNames: ['Telegram'],
      executor,
      macosSessionId: 'mac-session'
    })

    assert.equal(capability.active, false)
    assert.equal(capability.nativeDataPlaneActive, false)
    assert.equal(capability.fallbackOnly, true)
    assert.equal(capability.platformMode, 'macos_transparent_proxy')
    assert.equal(capability.macosControllerAvailable, true)
    assert.equal(capability.macosUserApprovalRequired, true)
    assert.equal(capability.macosReasonCode, 'macos_data_plane_pending')
    assert.equal(capability.macosSessionId, 'mac-session')
    assert.ok(
      executor.calls.some(
        (call) => call.command === 'koala-macos-process-bypassctl' && call.args[0] === 'apply'
      )
    )

    const report = evaluateBypassCapabilities({
      config: {
        tun: { enable: true },
        rules: ['PROCESS-NAME,Telegram,DIRECT']
      },
      platform: 'darwin',
      nativeProcessBypass: capability,
      learnedProcessBypass: learnedResolution('learned_bypass'),
      now: () => 1
    })

    assert.equal(report.rules[0].effectiveBypassMode, 'learned_bypass')
    assert.equal(report.summary.trueBypassRuleCount, 0)
  })

  it('reports missing macOS controller as fallback-only support state', async () => {
    const executor = createMockExecutor({ availableCommands: [] })
    const capability = await startNativeProcessBypass({
      enabled: true,
      platform: 'darwin',
      processNames: ['Telegram'],
      executor
    })

    assert.equal(capability.active, false)
    assert.equal(capability.platformMode, 'macos_fallback_only')
    assert.equal(capability.macosControllerAvailable, false)
    assert.equal(capability.diagnosticsReason, 'macos_controller_missing')
  })

  it('detects missing Windows native bypass prerequisites without claiming true bypass', async () => {
    const executor = createMockExecutor({ availableCommands: [] })
    const prerequisites = await detectWindowsNativeProcessBypassPrerequisites({
      enabled: true,
      platform: 'win32',
      executor
    })

    assert.equal(prerequisites.status, 'windows_service_missing')
    assert.equal(prerequisites.dataPlaneImplemented, false)
    assert.equal(prerequisites.controllerAvailable, false)
    assert.ok(prerequisites.issues.some((issue) => issue.code === 'windows_admin_required'))
    assert.ok(prerequisites.issues.some((issue) => issue.code === 'windows_wfp_service_missing'))
    assert.ok(prerequisites.issues.some((issue) => issue.code === 'windows_controller_missing'))
  })

  it('keeps Windows native bypass blocked until the WFP service and controller exist', async () => {
    const executor = createMockExecutor({ availableCommands: ['windows-admin'] })
    const capability = await startNativeProcessBypass({
      enabled: true,
      platform: 'win32',
      processNames: ['Telegram'],
      executor
    })

    assert.equal(capability.status, 'blocked')
    assert.equal(capability.active, false)
    assert.equal(capability.mechanism, 'windows-wfp-service')
    assert.equal(capability.diagnosticsReason, 'windows_service_missing')
  })

  it('applies Windows native bypass only when the WFP controller reports an active data plane', async () => {
    const executor = createMockExecutor({
      availableCommands: ['windows-admin', 'windows-service', 'windows-controller'],
      windowsControllerActive: true
    })

    const capability = await startNativeProcessBypass({
      enabled: true,
      platform: 'win32',
      processNames: ['Telegram'],
      executor,
      windowsSessionId: 'test-session'
    })

    assert.equal(capability.status, 'active')
    assert.equal(capability.active, true)
    assert.equal(capability.nativeDataPlaneActive, true)
    assert.equal(capability.platformMode, 'windows_wfp_service')
    assert.equal(capability.windowsServiceAvailable, true)
    assert.equal(capability.windowsControllerAvailable, true)
    assert.equal(capability.windowsSessionId, 'test-session')
    assert.equal(capability.windowsAppliedProcessCount, 1)
    assert.deepEqual(capability.activeProcesses, ['Telegram'])
    assert.ok(
      executor.calls.some(
        (call) => call.command === 'koala-process-bypassctl.exe' && call.args[0] === 'apply'
      )
    )

    const stopped = await stopNativeProcessBypass({
      enabled: true,
      platform: 'win32',
      executor
    })

    assert.equal(stopped.active, false)
    assert.ok(
      executor.calls.some(
        (call) => call.command === 'koala-process-bypassctl.exe' && call.args[0] === 'cleanup'
      )
    )
  })

  it('does not claim Windows true bypass when controller apply reports inactive data plane', async () => {
    const executor = createMockExecutor({
      availableCommands: ['windows-admin', 'windows-service', 'windows-controller'],
      windowsControllerActive: false
    })

    const capability = await startNativeProcessBypass({
      enabled: true,
      platform: 'win32',
      processNames: ['Telegram'],
      executor
    })

    assert.equal(capability.status, 'blocked')
    assert.equal(capability.active, false)
    assert.equal(capability.nativeDataPlaneActive, false)
    assert.equal(capability.diagnosticsReason, 'windows_data_plane_inactive')
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
    assert.deepEqual(capability.trackedPids, [101])
    assert.equal(capability.reconcileActive, true)
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
    assert.equal(getNativeProcessBypassStatus({ enabled: true, platform: 'linux' }).active, false)
  })

  it('reconciles newly started exact-name matching Linux processes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'koala-native-bypass-'))
    const cgroupRoot = path.join(root, 'cgroup')
    const procRoot = path.join(root, 'proc')
    await mkdir(cgroupRoot)
    await writeFile(path.join(cgroupRoot, 'cgroup.controllers'), 'cpu io memory')
    await mkdir(path.join(procRoot, '101'), { recursive: true })
    await writeFile(path.join(procRoot, '101', 'comm'), 'Telegram\n')
    const executor = createMockExecutor({ availableCommands: ['ip', 'nft'] })

    await startNativeProcessBypass({
      enabled: true,
      platform: 'linux',
      processNames: ['Telegram'],
      executor,
      paths: { cgroupRoot, procRoot },
      getUid: () => 0,
      now: () => 10
    })

    await mkdir(path.join(procRoot, '103'), { recursive: true })
    await writeFile(path.join(procRoot, '103', 'comm'), 'Telegram\n')
    const afterNewProcess = await reconcileNativeProcessBypass({
      platform: 'linux',
      paths: { cgroupRoot, procRoot },
      now: () => 20
    })

    assert.deepEqual(afterNewProcess.trackedPids, [101, 103])
    assert.equal(afterNewProcess.newlyBoundPidCount, 1)
    assert.equal(afterNewProcess.lastReconcileAt, 20)
    assert.equal(afterNewProcess.reconcileActive, true)

    const afterDuplicateReconcile = await reconcileNativeProcessBypass({
      platform: 'linux',
      paths: { cgroupRoot, procRoot },
      now: () => 30
    })

    assert.deepEqual(afterDuplicateReconcile.trackedPids, [101, 103])
    assert.equal(afterDuplicateReconcile.newlyBoundPidCount, 1)

    await rm(path.join(procRoot, '101'), { recursive: true, force: true })
    const afterDeadProcess = await reconcileNativeProcessBypass({
      platform: 'linux',
      paths: { cgroupRoot, procRoot },
      now: () => 40
    })

    assert.deepEqual(afterDeadProcess.trackedPids, [103])
    assert.equal(afterDeadProcess.deadPidCleanupCount, 1)

    const stopped = await stopNativeProcessBypass({
      enabled: true,
      platform: 'linux',
      executor,
      paths: { cgroupRoot, procRoot }
    })

    assert.equal(stopped.active, false)
    assert.equal(stopped.reconcileActive, undefined)
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

  it('documents the Windows WFP service/controller apply contract', () => {
    const plan = getWindowsNativeProcessBypassPlan()

    assert.equal(plan.mechanism, 'windows-wfp-service')
    assert.ok(plan.requiredCapabilities.includes('Windows Filtering Platform'))
    assert.ok(plan.requiredCapabilities.includes('koala-process-bypassctl.exe controller'))
    assert.ok(plan.setupSteps.some((step) => step.includes('WFP')))
    assert.ok(plan.setupSteps.some((step) => step.includes('dataPlaneActive')))
    assert.ok(plan.cleanupSteps.some((step) => step.includes('controller')))
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
  windowsControllerActive?: boolean
  macosControllerActive?: boolean
}): NativeProcessBypassExecutor & {
  calls: Array<{ command: string; args: string[]; stdin?: string }>
} {
  const calls: Array<{ command: string; args: string[]; stdin?: string }> = []
  return {
    calls,
    async run(command, args, stdin) {
      calls.push({ command, args, stdin })
      if (command === 'sh' && args[1]?.startsWith('command -v ')) {
        const checked = args[1].replace('command -v ', '').trim().replace(/^'|'$/g, '')
        if (input.availableCommands.includes(checked))
          return { stdout: `/usr/bin/${checked}\n`, stderr: '' }
        throw new Error(`${checked} missing`)
      }
      if (command === 'net.exe' && args[0] === 'session') {
        if (input.availableCommands.includes('windows-admin')) return { stdout: '', stderr: '' }
        throw new Error('admin required')
      }
      if (command === 'powershell.exe') {
        if (input.availableCommands.includes('windows-service')) return { stdout: '', stderr: '' }
        throw new Error('service missing')
      }
      if (command === 'where.exe' && args[0] === 'koala-process-bypassctl.exe') {
        if (input.availableCommands.includes('windows-controller')) {
          return { stdout: 'C:\\Koala\\koala-process-bypassctl.exe\r\n', stderr: '' }
        }
        throw new Error('controller missing')
      }
      if (command === 'koala-process-bypassctl.exe') {
        if (args[0] === 'cleanup') {
          return {
            stdout: JSON.stringify({ ok: true, dataPlaneActive: false, diagnostics: ['cleaned'] }),
            stderr: ''
          }
        }
        if (args[0] === 'apply' && input.windowsControllerActive) {
          return {
            stdout: JSON.stringify({
              ok: true,
              dataPlaneActive: true,
              appliedProcessNames: ['Telegram'],
              diagnostics: ['applied']
            }),
            stderr: ''
          }
        }
        return {
          stdout: JSON.stringify({
            ok: false,
            dataPlaneActive: false,
            reasonCode: 'windows_data_plane_inactive',
            message: 'inactive'
          }),
          stderr: ''
        }
      }
      if (command === 'koala-macos-process-bypassctl') {
        if (args[0] === 'cleanup') {
          return {
            stdout: JSON.stringify({
              ok: true,
              available: true,
              entitlementsPresent: true,
              extensionInstalled: true,
              userApprovalRequired: false,
              dataPlaneActive: false,
              fallbackOnly: true,
              reasonCode: 'macos_cleanup_complete',
              diagnostics: ['cleaned']
            }),
            stderr: ''
          }
        }
        if (input.macosControllerActive) {
          return {
            stdout: JSON.stringify({
              ok: true,
              available: true,
              entitlementsPresent: true,
              extensionInstalled: true,
              userApprovalRequired: false,
              dataPlaneActive: true,
              fallbackOnly: false,
              appliedProcessNames: ['Telegram'],
              reasonCode: 'macos_data_plane_active',
              diagnostics: ['active']
            }),
            stderr: ''
          }
        }
        return {
          stdout: JSON.stringify({
            ok: false,
            available: false,
            entitlementsPresent: false,
            extensionInstalled: false,
            userApprovalRequired: true,
            dataPlaneActive: false,
            fallbackOnly: true,
            reasonCode: 'macos_data_plane_pending',
            message: 'pending',
            diagnostics: ['fallback only'],
            provider: 'NETransparentProxyProvider',
            providerBundleIdentifier: 'com.koalaclash.processbypass.transparent-proxy'
          }),
          stderr: ''
        }
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
