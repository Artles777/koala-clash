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

export interface WindowsNativeProcessBypassPrerequisites {
  platform: string
  status: LinuxNativeProcessBypassPrerequisiteStatus
  wfpServiceAvailable: boolean
  controllerAvailable: boolean
  controllerCommand: string
  hasRequiredPrivileges: boolean
  dataPlaneImplemented: boolean
  issues: LinuxNativeProcessBypassIssue[]
}

export interface MacosNativeProcessBypassPrerequisites {
  platform: string
  status: LinuxNativeProcessBypassPrerequisiteStatus
  controllerAvailable: boolean
  controllerCommand: string
  entitlementsPresent: boolean
  extensionInstalled: boolean
  userApprovalRequired: boolean
  dataPlaneActive: boolean
  fallbackOnly: boolean
  reasonCode?: LinuxNativeProcessBypassIssueCode
  diagnostics: string[]
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
  reconcileIntervalMs?: number
  now?: () => number
  windowsControllerCommand?: string
  windowsSessionId?: string
  windowsController?: WindowsNativeProcessBypassController
  macosControllerCommand?: string
  macosSessionId?: string
  macosController?: MacosNativeProcessBypassController
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

export interface WindowsNativeProcessBypassControllerInput {
  sessionId: string
  processNames: string[]
  serviceName: string
}

export interface WindowsNativeProcessBypassControllerResult {
  ok: boolean
  dataPlaneActive: boolean
  appliedProcessNames?: string[]
  diagnostics?: string[]
  reasonCode?: LinuxNativeProcessBypassIssueCode
  message?: string
}

export interface WindowsNativeProcessBypassController {
  apply(
    input: WindowsNativeProcessBypassControllerInput
  ): Promise<WindowsNativeProcessBypassControllerResult>
  cleanup(
    input: WindowsNativeProcessBypassControllerInput
  ): Promise<WindowsNativeProcessBypassControllerResult>
}

export interface MacosNativeProcessBypassControllerInput {
  sessionId: string
  processNames: string[]
}

export interface MacosNativeProcessBypassControllerResult {
  ok: boolean
  available: boolean
  entitlementsPresent: boolean
  extensionInstalled: boolean
  userApprovalRequired: boolean
  dataPlaneActive: boolean
  fallbackOnly: boolean
  activeSessionId?: string
  appliedProcessNames?: string[]
  diagnostics?: string[]
  reasonCode?: LinuxNativeProcessBypassIssueCode
  message?: string
  provider?: string
  providerBundleIdentifier?: string
}

export interface MacosNativeProcessBypassController {
  status(): Promise<MacosNativeProcessBypassControllerResult>
  apply(
    input: MacosNativeProcessBypassControllerInput
  ): Promise<MacosNativeProcessBypassControllerResult>
  cleanup(
    input: MacosNativeProcessBypassControllerInput
  ): Promise<MacosNativeProcessBypassControllerResult>
}

interface AppliedNativeProcessBypassState {
  processNames: string[]
  boundPids: number[]
  trackedPids: number[]
  appliedAt: number
  newlyBoundPidCount: number
  deadPidCleanupCount: number
  lastReconcileAt?: number
  reconcileErrors: string[]
  paths: LinuxNativeProcessBypassPaths
}

interface AppliedWindowsNativeProcessBypassState {
  sessionId: string
  processNames: string[]
  appliedAt: number
  controllerCommand: string
}

interface AppliedMacosNativeProcessBypassState {
  sessionId: string
  processNames: string[]
  appliedAt: number
  controllerCommand: string
}

const linuxMechanism: NativeProcessBypassMechanism = 'linux-cgroup-fwmark'
const windowsMechanism: NativeProcessBypassMechanism = 'windows-wfp-service'
const macosMechanism: NativeProcessBypassMechanism = 'macos-transparent-proxy-system-extension'
const windowsServiceName = 'KoalaProcessBypass'
const windowsControllerCommand = 'koala-process-bypassctl.exe'
const macosControllerCommand = 'koala-macos-process-bypassctl'
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
let windowsAppliedState: AppliedWindowsNativeProcessBypassState | undefined
let macosAppliedState: AppliedMacosNativeProcessBypassState | undefined
let reconcileTimer: ReturnType<typeof setInterval> | undefined

export function canUseNativeProcessBypass(
  options: NativeProcessBypassOptions = {}
): NativeProcessBypassCapability {
  const enabled = options.enabled ?? false
  const platform = options.platform ?? process.platform
  const activeProcesses = options.activeProcesses ?? []

  if (platform === 'darwin') {
    return createCapability({
      enabled,
      platform,
      supportedOnPlatform: false,
      active: false,
      status: 'unsupported',
      mechanism: macosMechanism,
      platformMode: 'macos_fallback_only',
      nativeDataPlaneActive: false,
      fallbackOnly: true,
      fallbackReason: 'macos_native_process_bypass_unsupported',
      diagnosticsReason: 'macos_native_process_bypass_unsupported',
      diagnostics: [
        'macOS native PROCESS-NAME bypass is control-plane only until a signed Network/System Extension reports an active data plane.',
        'macOS uses address-based DIRECT excludes and learned process-to-IP bypass fallback only.'
      ],
      macosControllerAvailable: false,
      macosEntitlementsPresent: false,
      macosExtensionInstalled: false,
      macosUserApprovalRequired: true,
      macosReasonCode: 'macos_data_plane_pending',
      macosProvider: 'NETransparentProxyProvider',
      macosProviderBundleIdentifier: 'com.koalaclash.processbypass.transparent-proxy',
      activeProcesses: []
    })
  }

  if (platform === 'win32') {
    const common = {
      platform,
      supportedOnPlatform: true,
      active: false,
      mechanism: windowsMechanism,
      platformMode: 'windows_wfp_service' as const,
      nativeDataPlaneActive: false,
      requiresPrivileges: true,
      requiresService: true,
      activeProcesses
    }
    if (!enabled) {
      return createCapability({
        ...common,
        enabled: false,
        status: 'disabled',
        diagnosticsReason: 'feature_disabled',
        diagnostics: [
          'Windows WFP native process bypass is available through a privileged service/controller contract, but the feature is disabled.'
        ]
      })
    }

    return createCapability({
      ...common,
      enabled: true,
      status: 'available',
      diagnosticsReason: 'windows_wfp_service_pending_apply',
      diagnostics: [
        'Windows native process bypass uses the KoalaProcessBypass WFP service and koala-process-bypassctl controller.',
        'The data plane becomes active only after the controller confirms that process-aware WFP policy was applied.'
      ]
    })
  }

  if (platform !== 'linux') {
    return createCapability({
      enabled,
      platform,
      supportedOnPlatform: false,
      active: false,
      status: 'unsupported',
      platformMode: 'unsupported',
      nativeDataPlaneActive: false,
      fallbackOnly: true,
      fallbackReason: 'platform_unsupported',
      diagnosticsReason: 'platform_unsupported',
      diagnostics: [
        'Native process bypass is not supported on this platform. Learned bypass remains the fallback where available.'
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
      platformMode: 'linux_native',
      nativeDataPlaneActive: false,
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
    platformMode: 'linux_native',
    nativeDataPlaneActive: false,
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

export async function detectWindowsNativeProcessBypassPrerequisites(
  options: NativeProcessBypassOptions = {}
): Promise<WindowsNativeProcessBypassPrerequisites> {
  const platform = options.platform ?? process.platform
  const executor = options.executor ?? defaultExecutor
  const controllerCommand = options.windowsControllerCommand ?? windowsControllerCommand
  const issues: LinuxNativeProcessBypassIssue[] = []

  if (platform !== 'win32') {
    return {
      platform,
      status: 'not_windows',
      wfpServiceAvailable: false,
      controllerAvailable: false,
      controllerCommand,
      hasRequiredPrivileges: false,
      dataPlaneImplemented: false,
      issues: [
        {
          code: 'not_windows',
          message: 'Windows native process bypass scaffold is Windows-only.'
        }
      ]
    }
  }

  const hasRequiredPrivileges = await windowsAdministratorAvailable(executor)
  const wfpServiceAvailable = await windowsWfpServiceAvailable(executor)
  const controllerAvailable =
    options.windowsController !== undefined ||
    (await windowsControllerAvailable(executor, controllerCommand))
  const dataPlaneImplemented = controllerAvailable

  if (!hasRequiredPrivileges) {
    issues.push({
      code: 'windows_admin_required',
      message: 'Windows native process bypass requires an elevated service.'
    })
  }
  if (!wfpServiceAvailable) {
    issues.push({
      code: 'windows_wfp_service_missing',
      message: `Windows WFP bypass service ${windowsServiceName} is not installed.`
    })
  }
  if (!controllerAvailable) {
    issues.push({
      code: 'windows_controller_missing',
      message: `Windows WFP bypass controller ${controllerCommand} is not available.`
    })
  }

  const status: LinuxNativeProcessBypassPrerequisiteStatus = !wfpServiceAvailable
    ? 'windows_service_missing'
    : !hasRequiredPrivileges
      ? 'insufficient_privileges'
      : !controllerAvailable
        ? 'missing_prerequisites'
        : 'supported'

  return {
    platform,
    status,
    wfpServiceAvailable,
    controllerAvailable,
    controllerCommand,
    hasRequiredPrivileges,
    dataPlaneImplemented,
    issues
  }
}

export async function detectMacosNativeProcessBypassPrerequisites(
  options: NativeProcessBypassOptions = {}
): Promise<MacosNativeProcessBypassPrerequisites> {
  const platform = options.platform ?? process.platform
  const executor = options.executor ?? defaultExecutor
  const controllerCommand = options.macosControllerCommand ?? macosControllerCommand
  const issues: LinuxNativeProcessBypassIssue[] = []

  if (platform !== 'darwin') {
    return {
      platform,
      status: 'not_macos',
      controllerAvailable: false,
      controllerCommand,
      entitlementsPresent: false,
      extensionInstalled: false,
      userApprovalRequired: false,
      dataPlaneActive: false,
      fallbackOnly: true,
      diagnostics: [],
      issues: [
        {
          code: 'not_macos',
          message: 'macOS native process bypass scaffold is macOS-only.'
        }
      ]
    }
  }

  const controllerAvailable =
    options.macosController !== undefined ||
    (await macosControllerAvailable(executor, controllerCommand))
  if (!controllerAvailable) {
    issues.push({
      code: 'macos_controller_missing',
      message: `macOS process bypass controller ${controllerCommand} is not available.`
    })
    return {
      platform,
      status: 'macos_controller_missing',
      controllerAvailable: false,
      controllerCommand,
      entitlementsPresent: false,
      extensionInstalled: false,
      userApprovalRequired: true,
      dataPlaneActive: false,
      fallbackOnly: true,
      reasonCode: 'macos_controller_missing',
      diagnostics: [],
      issues
    }
  }

  try {
    const controller =
      options.macosController ??
      createMacosNativeProcessBypassController({
        executor,
        command: controllerCommand
      })
    const status = await controller.status()
    if (!status.entitlementsPresent) {
      issues.push({
        code: 'macos_entitlements_missing',
        message: 'macOS process bypass Network/System Extension entitlements are not present.'
      })
    }
    if (!status.extensionInstalled) {
      issues.push({
        code: 'macos_extension_not_installed',
        message: 'macOS process bypass System Extension is not installed.'
      })
    }
    if (status.userApprovalRequired) {
      issues.push({
        code: 'macos_user_approval_required',
        message: 'macOS process bypass System Extension requires user approval.'
      })
    }

    const statusCode: LinuxNativeProcessBypassPrerequisiteStatus =
      status.dataPlaneActive && !status.fallbackOnly
        ? 'supported'
        : status.userApprovalRequired
          ? 'macos_user_approval_required'
          : status.extensionInstalled && status.entitlementsPresent
            ? 'implementation_pending'
            : 'missing_prerequisites'

    return {
      platform,
      status: statusCode,
      controllerAvailable: true,
      controllerCommand,
      entitlementsPresent: status.entitlementsPresent,
      extensionInstalled: status.extensionInstalled,
      userApprovalRequired: status.userApprovalRequired,
      dataPlaneActive: status.dataPlaneActive,
      fallbackOnly: status.fallbackOnly,
      reasonCode: status.reasonCode,
      diagnostics: status.diagnostics ?? [],
      issues
    }
  } catch (error) {
    const issue = createIssue('macos_apply_failed', `macOS controller status failed: ${error}`)
    return {
      platform,
      status: 'missing_prerequisites',
      controllerAvailable: true,
      controllerCommand,
      entitlementsPresent: false,
      extensionInstalled: false,
      userApprovalRequired: true,
      dataPlaneActive: false,
      fallbackOnly: true,
      reasonCode: issue.code,
      diagnostics: [`${issue.code}: ${issue.message}`],
      issues: [issue]
    }
  }
}

export async function startNativeProcessBypass(
  options: NativeProcessBypassOptions = {}
): Promise<NativeProcessBypassCapability> {
  const base = canUseNativeProcessBypass(options)
  if (base.platform === 'darwin' && base.enabled) {
    await cleanupLinuxNativeProcessBypass(options)
    await cleanupWindowsNativeProcessBypass(options)
    await cleanupMacosNativeProcessBypass(options)
    const processNames = normalizeProcessNames(
      options.processNames ?? options.activeProcesses ?? []
    )
    const prerequisites = await detectMacosNativeProcessBypassPrerequisites(options)
    const prerequisiteDiagnostics = prerequisites.issues.map(
      (issue) => `${issue.code}: ${issue.message}`
    )
    const prerequisiteFields = {
      prerequisiteStatus: prerequisites.status,
      prerequisiteIssues: prerequisites.issues,
      mechanism: macosMechanism,
      platformMode: prerequisites.controllerAvailable
        ? ('macos_transparent_proxy' as const)
        : ('macos_fallback_only' as const),
      nativeDataPlaneActive: prerequisites.dataPlaneActive,
      fallbackOnly: prerequisites.fallbackOnly,
      fallbackReason:
        prerequisites.reasonCode ??
        (prerequisites.controllerAvailable
          ? 'macos_data_plane_pending'
          : 'macos_controller_missing'),
      macosControllerAvailable: prerequisites.controllerAvailable,
      macosEntitlementsPresent: prerequisites.entitlementsPresent,
      macosExtensionInstalled: prerequisites.extensionInstalled,
      macosUserApprovalRequired: prerequisites.userApprovalRequired,
      macosReasonCode:
        prerequisites.reasonCode ??
        (prerequisites.controllerAvailable
          ? 'macos_data_plane_pending'
          : 'macos_controller_missing'),
      macosProvider: 'NETransparentProxyProvider',
      macosProviderBundleIdentifier: 'com.koalaclash.processbypass.transparent-proxy'
    }

    if (processNames.length === 0) {
      currentStatus = createCapability({
        ...base,
        ...prerequisiteFields,
        active: false,
        status: prerequisites.controllerAvailable ? 'available' : 'unsupported',
        diagnosticsReason: 'no_process_names',
        diagnostics: [
          ...base.diagnostics,
          ...prerequisites.diagnostics,
          ...prerequisiteDiagnostics,
          'No PROCESS-NAME DIRECT rules are eligible for macOS native bypass.'
        ]
      })
      return cloneCapability(currentStatus)
    }

    if (!prerequisites.controllerAvailable) {
      currentStatus = createCapability({
        ...base,
        ...prerequisiteFields,
        active: false,
        status: 'unsupported',
        diagnosticsReason: 'macos_controller_missing',
        diagnostics: [...base.diagnostics, ...prerequisiteDiagnostics]
      })
      return cloneCapability(currentStatus)
    }

    try {
      const controller =
        options.macosController ??
        createMacosNativeProcessBypassController({
          executor: options.executor ?? defaultExecutor,
          command: prerequisites.controllerCommand
        })
      const sessionId = options.macosSessionId ?? createNativeProcessBypassSessionId()
      const result = await controller.apply({
        sessionId,
        processNames
      })
      const appliedProcessNames = normalizeProcessNames(
        result.appliedProcessNames && result.appliedProcessNames.length > 0
          ? result.appliedProcessNames
          : processNames
      )
      const active =
        result.ok === true &&
        result.available === true &&
        result.dataPlaneActive === true &&
        result.fallbackOnly === false &&
        appliedProcessNames.length > 0
      const diagnostics = [
        ...base.diagnostics,
        ...prerequisites.diagnostics,
        ...prerequisiteDiagnostics,
        ...(result.diagnostics ?? []),
        ...(result.message ? [result.message] : [])
      ]

      if (!active) {
        currentStatus = createCapability({
          ...base,
          ...prerequisiteFields,
          active: false,
          status:
            result.userApprovalRequired || !result.extensionInstalled || !result.entitlementsPresent
              ? 'blocked'
              : 'available',
          diagnosticsReason:
            result.reasonCode ??
            (result.fallbackOnly ? 'macos_data_plane_pending' : 'macos_apply_failed'),
          diagnostics,
          nativeDataPlaneActive: false,
          fallbackOnly: true,
          fallbackReason:
            result.reasonCode ??
            (result.fallbackOnly ? 'macos_data_plane_pending' : 'macos_apply_failed'),
          macosControllerAvailable: true,
          macosEntitlementsPresent: result.entitlementsPresent,
          macosExtensionInstalled: result.extensionInstalled,
          macosUserApprovalRequired: result.userApprovalRequired,
          macosReasonCode: result.reasonCode,
          macosProvider: result.provider ?? prerequisiteFields.macosProvider,
          macosProviderBundleIdentifier:
            result.providerBundleIdentifier ?? prerequisiteFields.macosProviderBundleIdentifier,
          macosSessionId: sessionId,
          macosAppliedProcessCount: 0
        })
        return cloneCapability(currentStatus)
      }

      const appliedAt = options.now?.() ?? Date.now()
      macosAppliedState = {
        sessionId,
        processNames: appliedProcessNames,
        appliedAt,
        controllerCommand: prerequisites.controllerCommand
      }
      currentStatus = createCapability({
        ...base,
        ...prerequisiteFields,
        supportedOnPlatform: true,
        active: true,
        status: 'active',
        diagnosticsReason: 'macos_data_plane_active',
        diagnostics: [
          `macOS native process bypass applied for ${appliedProcessNames.length} process name(s).`,
          ...diagnostics
        ],
        nativeDataPlaneActive: true,
        fallbackOnly: false,
        fallbackReason: undefined,
        activeProcesses: appliedProcessNames,
        appliedAt,
        macosControllerAvailable: true,
        macosEntitlementsPresent: result.entitlementsPresent,
        macosExtensionInstalled: result.extensionInstalled,
        macosUserApprovalRequired: result.userApprovalRequired,
        macosReasonCode: result.reasonCode ?? 'macos_data_plane_active',
        macosProvider: result.provider ?? prerequisiteFields.macosProvider,
        macosProviderBundleIdentifier:
          result.providerBundleIdentifier ?? prerequisiteFields.macosProviderBundleIdentifier,
        macosSessionId: sessionId,
        macosAppliedProcessCount: appliedProcessNames.length
      })
      return cloneCapability(currentStatus)
    } catch (error) {
      const issue = createIssue('macos_apply_failed', String(error))
      currentStatus = createCapability({
        ...base,
        ...prerequisiteFields,
        active: false,
        status: 'blocked',
        diagnosticsReason: issue.code,
        diagnostics: [
          ...base.diagnostics,
          ...prerequisites.diagnostics,
          ...prerequisiteDiagnostics,
          `${issue.code}: ${issue.message}`
        ],
        nativeDataPlaneActive: false,
        fallbackOnly: true,
        fallbackReason: issue.code
      })
      return cloneCapability(currentStatus)
    }
  }

  if (base.platform === 'win32' && base.enabled) {
    await cleanupLinuxNativeProcessBypass(options)
    await cleanupWindowsNativeProcessBypass(options)
    const processNames = normalizeProcessNames(
      options.processNames ?? options.activeProcesses ?? []
    )
    if (processNames.length === 0) {
      currentStatus = createCapability({
        ...base,
        active: false,
        status: 'available',
        diagnosticsReason: 'no_process_names',
        diagnostics: [
          ...base.diagnostics,
          'No PROCESS-NAME DIRECT rules are eligible for Windows native bypass.'
        ]
      })
      return cloneCapability(currentStatus)
    }

    const prerequisites = await detectWindowsNativeProcessBypassPrerequisites(options)
    const blocked = prerequisites.status !== 'supported'
    const prerequisiteDiagnostics = prerequisites.issues.map(
      (issue) => `${issue.code}: ${issue.message}`
    )
    const prerequisiteFields = {
      prerequisiteStatus: prerequisites.status,
      prerequisiteIssues: prerequisites.issues,
      windowsServiceAvailable: prerequisites.wfpServiceAvailable,
      windowsControllerAvailable: prerequisites.controllerAvailable
    }
    if (blocked) {
      currentStatus = createCapability({
        ...base,
        ...prerequisiteFields,
        active: false,
        status: 'blocked',
        diagnosticsReason: prerequisites.status,
        diagnostics: [...base.diagnostics, ...prerequisiteDiagnostics]
      })
      return cloneCapability(currentStatus)
    }

    try {
      const controller =
        options.windowsController ??
        createWindowsNativeProcessBypassController({
          executor: options.executor ?? defaultExecutor,
          command: prerequisites.controllerCommand
        })
      const sessionId = options.windowsSessionId ?? createNativeProcessBypassSessionId()
      const result = await controller.apply({
        sessionId,
        processNames,
        serviceName: windowsServiceName
      })
      const appliedProcessNames = normalizeProcessNames(
        result.appliedProcessNames && result.appliedProcessNames.length > 0
          ? result.appliedProcessNames
          : processNames
      )
      if (!result.ok || !result.dataPlaneActive || appliedProcessNames.length === 0) {
        const issue = createIssue(
          result.reasonCode ?? 'windows_data_plane_inactive',
          result.message ??
            'Windows WFP controller did not report an active process-aware data plane.'
        )
        currentStatus = createCapability({
          ...base,
          ...prerequisiteFields,
          active: false,
          status: 'blocked',
          diagnosticsReason: issue.code,
          diagnostics: [
            ...base.diagnostics,
            ...prerequisiteDiagnostics,
            ...(result.diagnostics ?? []),
            `${issue.code}: ${issue.message}`
          ],
          nativeDataPlaneActive: false,
          windowsSessionId: sessionId,
          windowsAppliedProcessCount: 0
        })
        return cloneCapability(currentStatus)
      }

      const appliedAt = options.now?.() ?? Date.now()
      windowsAppliedState = {
        sessionId,
        processNames: appliedProcessNames,
        appliedAt,
        controllerCommand: prerequisites.controllerCommand
      }
      currentStatus = createCapability({
        ...base,
        ...prerequisiteFields,
        active: true,
        status: 'active',
        diagnosticsReason: 'windows_native_process_bypass_applied',
        diagnostics: [
          `Windows native process bypass applied for ${appliedProcessNames.length} process name(s).`,
          `WFP service ${windowsServiceName} reported an active data plane.`,
          ...(result.diagnostics ?? [])
        ],
        nativeDataPlaneActive: true,
        activeProcesses: appliedProcessNames,
        appliedAt,
        windowsSessionId: sessionId,
        windowsAppliedProcessCount: appliedProcessNames.length
      })
      return cloneCapability(currentStatus)
    } catch (error) {
      const issue = createIssue('windows_apply_failed', String(error))
      currentStatus = createCapability({
        ...base,
        ...prerequisiteFields,
        active: false,
        status: 'blocked',
        diagnosticsReason: issue.code,
        diagnostics: [
          ...base.diagnostics,
          ...prerequisiteDiagnostics,
          `${issue.code}: ${issue.message}`
        ],
        nativeDataPlaneActive: false
      })
      return cloneCapability(currentStatus)
    }
  }

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
    const appliedAt = options.now?.() ?? Date.now()
    appliedState = {
      processNames,
      boundPids: pids,
      trackedPids: pids,
      appliedAt,
      newlyBoundPidCount: 0,
      deadPidCleanupCount: 0,
      reconcileErrors: [],
      paths
    }
    startLinuxNativeProcessReconcileLoop(options)
    currentStatus = createCapability({
      ...base,
      active: true,
      status: 'active',
      diagnosticsReason: 'native_process_bypass_applied',
      diagnostics: [
        `Native process bypass applied for ${processNames.length} process name(s).`,
        `Bound ${pids.length} process id(s) to cgroup ${cgroupName}.`,
        'New matching processes are picked up by a lightweight reconcile loop.'
      ],
      activeProcesses: processNames,
      boundPids: pids,
      trackedPids: pids,
      newlyBoundPidCount: 0,
      deadPidCleanupCount: 0,
      reconcileActive: isReconcileLoopActive(),
      reconcileErrors: [],
      appliedAt,
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
  const previousPlatform = previous?.platform ?? options.platform ?? process.platform
  const cleanup =
    previousPlatform === 'win32'
      ? await cleanupWindowsNativeProcessBypass({
          ...options,
          activeProcesses: previous?.activeProcesses
        })
      : previousPlatform === 'darwin'
        ? await cleanupMacosNativeProcessBypass({
            ...options,
            activeProcesses: previous?.activeProcesses
          })
        : await cleanupLinuxNativeProcessBypass({
            ...options,
            activeProcesses: previous?.activeProcesses
          })
  currentStatus = canUseNativeProcessBypass({
    enabled: previous?.enabled ?? options.enabled ?? false,
    platform: previousPlatform
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

export async function reconcileNativeProcessBypass(
  options: NativeProcessBypassOptions = {}
): Promise<NativeProcessBypassCapability> {
  if (!appliedState || !currentStatus?.active || currentStatus.platform !== 'linux') {
    return getNativeProcessBypassStatus(options)
  }

  const paths = { ...appliedState.paths, ...options.paths }
  const currentPids = await findLinuxProcessPidsByExactName(appliedState.processNames, paths)
  const currentPidSet = new Set(currentPids)
  const trackedPidSet = new Set(appliedState.trackedPids)
  const newPids = currentPids.filter((pid) => !trackedPidSet.has(pid))
  const aliveTrackedPids = appliedState.trackedPids.filter((pid) => currentPidSet.has(pid))
  const deadPidCount = appliedState.trackedPids.length - aliveTrackedPids.length
  const errors: string[] = []

  for (const pid of newPids) {
    try {
      await bindPidToBypassCgroup(pid, paths)
      aliveTrackedPids.push(pid)
    } catch (error) {
      errors.push(`process_reconcile_failed: could not bind pid ${pid}: ${error}`)
    }
  }

  appliedState.trackedPids = [...new Set(aliveTrackedPids)].sort((a, b) => a - b)
  appliedState.boundPids = [...appliedState.trackedPids]
  appliedState.newlyBoundPidCount += newPids.length - errors.length
  appliedState.deadPidCleanupCount += deadPidCount
  appliedState.lastReconcileAt = options.now?.() ?? Date.now()
  if (errors.length > 0) {
    appliedState.reconcileErrors = [...appliedState.reconcileErrors, ...errors].slice(-10)
  }

  const active = appliedState.trackedPids.length > 0
  currentStatus = createCapability({
    ...currentStatus,
    active,
    status: active ? 'active' : 'blocked',
    diagnosticsReason:
      errors.length > 0 ? 'process_reconcile_failed' : 'native_process_bypass_active',
    diagnostics: [
      ...currentStatus.diagnostics,
      ...(newPids.length > 0
        ? [`Reconcile bound ${newPids.length - errors.length} new process id(s).`]
        : []),
      ...(deadPidCount > 0 ? [`Reconcile removed ${deadPidCount} stale process id(s).`] : []),
      ...errors
    ],
    boundPids: appliedState.boundPids,
    trackedPids: appliedState.trackedPids,
    newlyBoundPidCount: appliedState.newlyBoundPidCount,
    deadPidCleanupCount: appliedState.deadPidCleanupCount,
    lastReconcileAt: appliedState.lastReconcileAt,
    reconcileActive: isReconcileLoopActive(),
    reconcileErrors: appliedState.reconcileErrors
  })
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
      'create an app-owned cgroup for exact-name matching processes',
      'install nftables route-hook rules that set a fwmark for cgroup traffic',
      'install a high-priority policy rule for the fwmark via the main routing table',
      'move exact PROCESS-NAME matching PIDs into the bypass cgroup',
      'periodically reconcile /proc and bind newly started matching PIDs'
    ],
    cleanupSteps: [
      'move bound PIDs back to the root cgroup where possible',
      'remove the fwmark policy routing rule',
      'delete the nftables table created by Koala',
      'stop process reconciliation',
      'remove the app-owned cgroup when empty'
    ]
  }
}

export function getWindowsNativeProcessBypassPlan(): NativeProcessBypassCommandPlan {
  return {
    mechanism: windowsMechanism,
    requiredCapabilities: [
      'administrator/elevated context',
      `${windowsServiceName} WFP service`,
      `${windowsControllerCommand} controller`,
      'Windows Filtering Platform'
    ],
    setupSteps: [
      'detect Windows platform and elevated service prerequisites',
      `resolve the ${windowsServiceName} WFP service`,
      `resolve the ${windowsControllerCommand} controller`,
      'ask the controller to apply process-aware WFP policy for exact PROCESS-NAME rules',
      'treat native bypass as active only when the controller reports dataPlaneActive'
    ],
    cleanupSteps: [
      'ask the controller to remove service-owned WFP policy for the active runtime session',
      'fall back to learned process-to-IP bypass when the service/controller is unavailable'
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
      await bindPidToBypassCgroup(pid, paths)
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
  stopLinuxNativeProcessReconcileLoop()
  const paths = { ...defaultPaths, ...options.paths }
  const executor = options.executor ?? defaultExecutor
  const diagnostics: string[] = []
  const issues: LinuxNativeProcessBypassIssue[] = []
  let ok = true

  const pids = options.pids ?? appliedState?.trackedPids ?? appliedState?.boundPids ?? []
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

async function cleanupWindowsNativeProcessBypass(
  options: NativeProcessBypassOptions
): Promise<{ ok: boolean; diagnostics: string[]; issues: LinuxNativeProcessBypassIssue[] }> {
  const platform = options.platform ?? process.platform
  if (platform !== 'win32' || !windowsAppliedState) {
    windowsAppliedState = undefined
    return { ok: true, diagnostics: [], issues: [] }
  }

  const state = windowsAppliedState
  const controller =
    options.windowsController ??
    createWindowsNativeProcessBypassController({
      executor: options.executor ?? defaultExecutor,
      command: options.windowsControllerCommand ?? state.controllerCommand
    })

  try {
    const result = await controller.cleanup({
      sessionId: state.sessionId,
      processNames: state.processNames,
      serviceName: windowsServiceName
    })
    if (!result.ok) {
      const issue = createIssue(
        result.reasonCode ?? 'windows_cleanup_failed',
        result.message ?? 'Windows WFP controller cleanup failed.'
      )
      return {
        ok: false,
        diagnostics: [...(result.diagnostics ?? []), `${issue.code}: ${issue.message}`],
        issues: [issue]
      }
    }
    windowsAppliedState = undefined
    return { ok: true, diagnostics: result.diagnostics ?? [], issues: [] }
  } catch (error) {
    const issue = createIssue('windows_cleanup_failed', String(error))
    return { ok: false, diagnostics: [`${issue.code}: ${issue.message}`], issues: [issue] }
  }
}

async function cleanupMacosNativeProcessBypass(
  options: NativeProcessBypassOptions
): Promise<{ ok: boolean; diagnostics: string[]; issues: LinuxNativeProcessBypassIssue[] }> {
  const platform = options.platform ?? process.platform
  if (platform !== 'darwin' || !macosAppliedState) {
    macosAppliedState = undefined
    return { ok: true, diagnostics: [], issues: [] }
  }

  const state = macosAppliedState
  const controller =
    options.macosController ??
    createMacosNativeProcessBypassController({
      executor: options.executor ?? defaultExecutor,
      command: options.macosControllerCommand ?? state.controllerCommand
    })

  try {
    const result = await controller.cleanup({
      sessionId: state.sessionId,
      processNames: state.processNames
    })
    if (!result.ok) {
      const issue = createIssue(
        result.reasonCode ?? 'macos_cleanup_failed',
        result.message ?? 'macOS process bypass controller cleanup failed.'
      )
      return {
        ok: false,
        diagnostics: [...(result.diagnostics ?? []), `${issue.code}: ${issue.message}`],
        issues: [issue]
      }
    }
    macosAppliedState = undefined
    return { ok: true, diagnostics: result.diagnostics ?? [], issues: [] }
  } catch (error) {
    const issue = createIssue('macos_cleanup_failed', String(error))
    return { ok: false, diagnostics: [`${issue.code}: ${issue.message}`], issues: [issue] }
  }
}

async function bindPidToBypassCgroup(
  pid: number,
  paths: LinuxNativeProcessBypassPaths
): Promise<void> {
  await fs.writeFile(path.join(paths.cgroupRoot, cgroupName, 'cgroup.procs'), `${pid}`)
}

function startLinuxNativeProcessReconcileLoop(options: NativeProcessBypassOptions): void {
  stopLinuxNativeProcessReconcileLoop()
  const intervalMs = Math.max(options.reconcileIntervalMs ?? 5_000, 1_000)
  reconcileTimer = setInterval(() => {
    void reconcileNativeProcessBypass(options).catch((error) => {
      if (!appliedState || !currentStatus) return
      const message = `process_reconcile_failed: ${error}`
      appliedState.reconcileErrors = [...appliedState.reconcileErrors, message].slice(-10)
      currentStatus = createCapability({
        ...currentStatus,
        diagnosticsReason: 'process_reconcile_failed',
        diagnostics: [...currentStatus.diagnostics, message],
        reconcileActive: isReconcileLoopActive(),
        reconcileErrors: appliedState.reconcileErrors
      })
    })
  }, intervalMs)
  reconcileTimer.unref?.()
}

function stopLinuxNativeProcessReconcileLoop(): void {
  if (!reconcileTimer) return
  clearInterval(reconcileTimer)
  reconcileTimer = undefined
}

function isReconcileLoopActive(): boolean {
  return Boolean(reconcileTimer)
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

async function windowsControllerAvailable(
  executor: NativeProcessBypassExecutor,
  command: string
): Promise<boolean> {
  try {
    await executor.run('where.exe', [command])
    return true
  } catch {
    return false
  }
}

async function macosControllerAvailable(
  executor: NativeProcessBypassExecutor,
  command: string
): Promise<boolean> {
  try {
    await executor.run('sh', ['-c', `command -v ${shellQuote(command)}`])
    return true
  } catch {
    return false
  }
}

async function windowsAdministratorAvailable(
  executor: NativeProcessBypassExecutor
): Promise<boolean> {
  try {
    await executor.run('net.exe', ['session'])
    return true
  } catch {
    return false
  }
}

async function windowsWfpServiceAvailable(executor: NativeProcessBypassExecutor): Promise<boolean> {
  const script = [
    `$service = Get-Service -Name '${windowsServiceName}' -ErrorAction SilentlyContinue`,
    'if ($null -eq $service) { exit 1 }',
    'exit 0'
  ].join('; ')

  try {
    await executor.run('powershell.exe', ['-NoProfile', '-Command', script])
    return true
  } catch {
    return false
  }
}

function createMacosNativeProcessBypassController(input: {
  executor: NativeProcessBypassExecutor
  command: string
}): MacosNativeProcessBypassController {
  return {
    async status() {
      const result = await input.executor.run(input.command, ['status', '--json'])
      return parseMacosControllerResult(result.stdout, 'macos_apply_failed')
    },
    async apply(request) {
      const args = buildMacosControllerArgs('apply', request)
      const result = await input.executor.run(input.command, args)
      return parseMacosControllerResult(result.stdout, 'macos_apply_failed')
    },
    async cleanup(request) {
      const args = buildMacosControllerArgs('cleanup', request)
      const result = await input.executor.run(input.command, args)
      return parseMacosControllerResult(result.stdout, 'macos_cleanup_failed')
    }
  }
}

function buildMacosControllerArgs(
  action: 'apply' | 'cleanup',
  input: MacosNativeProcessBypassControllerInput
): string[] {
  const args = [action, '--session', input.sessionId, '--json']
  for (const processName of normalizeProcessNames(input.processNames)) {
    args.push('--process-name', processName)
  }
  return args
}

function parseMacosControllerResult(
  stdout: string,
  fallbackReasonCode: LinuxNativeProcessBypassIssueCode
): MacosNativeProcessBypassControllerResult {
  const parsed = parseControllerJsonLine(stdout, fallbackReasonCode, 'macOS process bypass')
  const reasonCode =
    typeof parsed.reasonCode === 'string'
      ? toNativeBypassIssueCode(parsed.reasonCode, fallbackReasonCode)
      : undefined
  return {
    ok: parsed.ok === true,
    available: parsed.available === true,
    entitlementsPresent: parsed.entitlementsPresent === true,
    extensionInstalled: parsed.extensionInstalled === true,
    userApprovalRequired: parsed.userApprovalRequired === true,
    dataPlaneActive: parsed.dataPlaneActive === true || parsed.active === true,
    fallbackOnly: parsed.fallbackOnly !== false,
    activeSessionId:
      typeof parsed.activeSessionId === 'string' ? parsed.activeSessionId : undefined,
    appliedProcessNames: Array.isArray(parsed.appliedProcessNames)
      ? parsed.appliedProcessNames.filter((name): name is string => typeof name === 'string')
      : undefined,
    diagnostics: Array.isArray(parsed.diagnostics)
      ? parsed.diagnostics.filter(
          (diagnostic): diagnostic is string => typeof diagnostic === 'string'
        )
      : undefined,
    reasonCode,
    message: typeof parsed.message === 'string' ? parsed.message : undefined,
    provider: typeof parsed.provider === 'string' ? parsed.provider : undefined,
    providerBundleIdentifier:
      typeof parsed.providerBundleIdentifier === 'string'
        ? parsed.providerBundleIdentifier
        : undefined
  }
}

function createWindowsNativeProcessBypassController(input: {
  executor: NativeProcessBypassExecutor
  command: string
}): WindowsNativeProcessBypassController {
  return {
    async apply(request) {
      const args = buildWindowsControllerArgs('apply', request)
      const result = await input.executor.run(input.command, args)
      return parseWindowsControllerResult(result.stdout, 'windows_apply_failed')
    },
    async cleanup(request) {
      const args = buildWindowsControllerArgs('cleanup', request)
      const result = await input.executor.run(input.command, args)
      return parseWindowsControllerResult(result.stdout, 'windows_cleanup_failed')
    }
  }
}

function buildWindowsControllerArgs(
  action: 'apply' | 'cleanup',
  input: WindowsNativeProcessBypassControllerInput
): string[] {
  const args = [action, '--session', input.sessionId, '--service', input.serviceName, '--json']
  for (const processName of normalizeProcessNames(input.processNames)) {
    args.push('--process-name', processName)
  }
  return args
}

function parseWindowsControllerResult(
  stdout: string,
  fallbackReasonCode: LinuxNativeProcessBypassIssueCode
): WindowsNativeProcessBypassControllerResult {
  const parsed = parseControllerJsonLine(stdout, fallbackReasonCode, 'Windows WFP')
  const reasonCode =
    typeof parsed.reasonCode === 'string'
      ? toNativeBypassIssueCode(parsed.reasonCode, fallbackReasonCode)
      : undefined
  return {
    ok: parsed.ok === true,
    dataPlaneActive: parsed.dataPlaneActive === true || parsed.active === true,
    appliedProcessNames: Array.isArray(parsed.appliedProcessNames)
      ? parsed.appliedProcessNames.filter((name): name is string => typeof name === 'string')
      : undefined,
    diagnostics: Array.isArray(parsed.diagnostics)
      ? parsed.diagnostics.filter(
          (diagnostic): diagnostic is string => typeof diagnostic === 'string'
        )
      : undefined,
    reasonCode,
    message: typeof parsed.message === 'string' ? parsed.message : undefined
  }
}

function parseControllerJsonLine(
  stdout: string,
  fallbackReasonCode: LinuxNativeProcessBypassIssueCode,
  controllerLabel: string
): Record<string, unknown> {
  const line = stdout
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith('{') && entry.endsWith('}'))
    .reverse()[0]
  if (!line) {
    throw createNativeBypassError(
      fallbackReasonCode,
      `${controllerLabel} controller did not return a JSON result.`
    )
  }

  return JSON.parse(line) as Record<string, unknown>
}

function createNativeProcessBypassSessionId(): string {
  return `koala-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
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
        | 'platformMode'
        | 'nativeDataPlaneActive'
        | 'fallbackOnly'
        | 'fallbackReason'
        | 'prerequisiteStatus'
        | 'prerequisiteIssues'
        | 'boundPids'
        | 'trackedPids'
        | 'newlyBoundPidCount'
        | 'deadPidCleanupCount'
        | 'lastReconcileAt'
        | 'reconcileActive'
        | 'reconcileErrors'
        | 'appliedAt'
        | 'windowsServiceAvailable'
        | 'windowsControllerAvailable'
        | 'windowsSessionId'
        | 'windowsAppliedProcessCount'
        | 'macosControllerAvailable'
        | 'macosEntitlementsPresent'
        | 'macosExtensionInstalled'
        | 'macosUserApprovalRequired'
        | 'macosReasonCode'
        | 'macosProvider'
        | 'macosProviderBundleIdentifier'
        | 'macosSessionId'
        | 'macosAppliedProcessCount'
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
    boundPids: input.boundPids ? [...input.boundPids] : undefined,
    trackedPids: input.trackedPids ? [...input.trackedPids] : undefined,
    reconcileErrors: input.reconcileErrors ? [...input.reconcileErrors] : undefined
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

function toNativeBypassIssueCode(
  code: string,
  fallback: LinuxNativeProcessBypassIssueCode
): LinuxNativeProcessBypassIssueCode {
  switch (code) {
    case 'not_linux':
    case 'not_windows':
    case 'not_macos':
    case 'cgroup_v2_missing':
    case 'nft_missing':
    case 'ip_missing':
    case 'insufficient_privileges':
    case 'cgroup_not_writable':
    case 'windows_wfp_service_missing':
    case 'windows_controller_missing':
    case 'windows_admin_required':
    case 'windows_data_plane_pending':
    case 'windows_data_plane_inactive':
    case 'windows_apply_failed':
    case 'windows_cleanup_failed':
    case 'macos_controller_missing':
    case 'macos_entitlements_missing':
    case 'macos_extension_not_installed':
    case 'macos_user_approval_required':
    case 'macos_data_plane_pending':
    case 'macos_data_plane_active':
    case 'macos_apply_failed':
    case 'macos_cleanup_failed':
    case 'macos_cleanup_complete':
    case 'macos_native_bypass_unsupported':
    case 'no_process_names':
    case 'no_matching_processes':
    case 'cgroup_creation_failed':
    case 'nft_apply_failed':
    case 'policy_route_apply_failed':
    case 'process_binding_failed':
    case 'process_reconcile_failed':
    case 'cleanup_failed':
      return code
    default:
      return fallback
  }
}

function cloneCapability(capability: NativeProcessBypassCapability): NativeProcessBypassCapability {
  return {
    ...capability,
    diagnostics: [...capability.diagnostics],
    activeProcesses: [...capability.activeProcesses],
    prerequisiteIssues: capability.prerequisiteIssues?.map((issue) => ({ ...issue })),
    boundPids: capability.boundPids ? [...capability.boundPids] : undefined,
    trackedPids: capability.trackedPids ? [...capability.trackedPids] : undefined,
    reconcileErrors: capability.reconcileErrors ? [...capability.reconcileErrors] : undefined
  }
}
