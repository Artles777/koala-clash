import { constants, existsSync, accessSync, statSync, readFileSync } from 'fs'
import * as path from 'path'
import {
  AmneziaHelperBackendMode,
  AmneziaHelperRuntimeConfig
} from '../../core/profiles/amnezia-helper-runtime-config'
import {
  AmneziaProductionBackendConfig,
  createAmneziaProductionBackendConfig
} from '../../core/profiles/amnezia-helper-production-config'

export type AmneziaHelperBackendKind = 'production' | 'prototype' | 'stub' | 'unavailable'
export type AmneziaHelperBackendConfig = AmneziaHelperRuntimeConfig | AmneziaProductionBackendConfig
export type AmneziaHelperBackendDiagnosticKind =
  | 'config_accepted'
  | 'local_proxy_ready'
  | 'startup_failed'
  | 'unsupported_config'
  | 'backend_unavailable'
  | 'backend_permission_denied'
  | 'backend_spawn_failure'
  | 'backend_not_executable'
  | 'unsupported_platform'
  | 'unsupported_arch'
  | 'backend_arch_mismatch'

export interface AmneziaHelperBackendDiagnostic {
  kind: AmneziaHelperBackendDiagnosticKind
  message: string
}

export type AmneziaHelperExecutableValidationCode =
  | 'ok'
  | 'missing'
  | 'not_file'
  | 'permission_denied'
  | 'unsupported_platform'
  | 'unsupported_arch'
  | 'arch_mismatch'

export interface AmneziaHelperExecutableValidationIssue {
  code: Exclude<AmneziaHelperExecutableValidationCode, 'ok'>
  message: string
  path?: string
  expectedPlatform?: string
  expectedArch?: string
  actualPlatform?: string
  actualArch?: string
}

export interface AmneziaHelperExecutableValidationResult {
  ok: boolean
  path: string
  platform: string
  arch: string
  issues: AmneziaHelperExecutableValidationIssue[]
  diagnostics: string[]
  manifest?: AmneziaHelperBackendManifest
}

export interface AmneziaHelperBackendManifest {
  name?: string
  version?: string
  platform?: string
  arch?: string
  binary?: string
}

export interface AmneziaHelperBackendLaunchContext {
  configPath: string
  sessionId: string
  profileId: string
}

export interface ResolvedAmneziaHelperBackend {
  mode: AmneziaHelperBackendMode
  kind: AmneziaHelperBackendKind
  command: string
  executablePath: string
  runAsNode: boolean
  available: boolean
  diagnostics: string[]
  validation?: AmneziaHelperExecutableValidationResult
  getBackendLaunchArgs: (context: AmneziaHelperBackendLaunchContext) => string[]
  getBackendSelfCheckArgs: () => string[]
  generateBackendConfig: (config: AmneziaHelperRuntimeConfig) => AmneziaHelperBackendConfig
}

export interface ResolveHelperBackendOptions {
  mode: AmneziaHelperBackendMode
  command?: string
  proxyBackendPath: string
  helperStubPath: string
  productionBackendPath?: string
  resourcesFilesDir?: string
  platform?: NodeJS.Platform | string
  arch?: string
  exists?: (filePath: string) => boolean
  validateExecutable?: (
    input: ValidateProductionBackendExecutableInput
  ) => AmneziaHelperExecutableValidationResult
}

export interface ResolveProductionBackendPathOptions {
  explicitPath?: string
  resourcesFilesDir?: string
  platform?: NodeJS.Platform | string
  arch?: string
  exists?: (filePath: string) => boolean
}

export interface ResolvedProductionBackendPath {
  path: string
  found: boolean
  explicit: boolean
  candidates: string[]
}

export interface ValidateProductionBackendExecutableInput {
  executablePath: string
  platform?: NodeJS.Platform | string
  arch?: string
  exists?: (filePath: string) => boolean
  stat?: (filePath: string) => { isFile: () => boolean; mode?: number }
  access?: (filePath: string, mode?: number) => void
  readFile?: (filePath: string, encoding: BufferEncoding) => string
}

const supportedDesktopPlatforms = new Set(['win32', 'linux', 'darwin'])
const supportedDesktopArchitectures = new Set(['x64', 'arm64'])

export function resolveHelperBackend(
  options: ResolveHelperBackendOptions
): ResolvedAmneziaHelperBackend {
  const command = options.command ?? process.execPath
  const exists = options.exists ?? existsSync

  if (options.mode === 'production') {
    const resolvedPath = resolveProductionBackendPath({
      explicitPath: options.productionBackendPath,
      resourcesFilesDir: options.resourcesFilesDir,
      platform: options.platform,
      arch: options.arch,
      exists
    })
    const validation = (options.validateExecutable ?? validateProductionBackendExecutable)({
      executablePath: resolvedPath.path,
      platform: options.platform,
      arch: options.arch,
      exists
    })

    return {
      mode: 'production',
      kind: validation.ok ? 'production' : 'unavailable',
      command: resolvedPath.path,
      executablePath: resolvedPath.path,
      runAsNode: false,
      available: validation.ok,
      validation,
      diagnostics: validation.ok
        ? [
            `production backend resolved: ${resolvedPath.path}`,
            ...validation.diagnostics,
            resolvedPath.explicit
              ? 'production backend path source: KOALA_AMNEZIA_HELPER_BACKEND_PATH'
              : 'production backend path source: bundled resources'
          ]
        : [
            `production backend unavailable: ${resolvedPath.path || 'no candidate path'}`,
            ...validation.diagnostics,
            `checked paths: ${resolvedPath.candidates.join(', ') || 'none'}`,
            'set KOALA_AMNEZIA_HELPER_BACKEND_PATH or use KOALA_AMNEZIA_HELPER_BACKEND_MODE=proxy-prototype for explicit prototype fallback'
          ],
      getBackendLaunchArgs: ({ configPath, sessionId, profileId }) => [
        'run',
        '--config',
        configPath,
        '--session-id',
        sessionId,
        '--profile-id',
        profileId,
        '--mode',
        'proxy'
      ],
      getBackendSelfCheckArgs: () => ['self-check'],
      generateBackendConfig: createAmneziaProductionBackendConfig
    }
  }

  if (options.mode === 'stub') {
    return {
      mode: 'stub',
      kind: 'stub',
      command,
      executablePath: options.helperStubPath,
      runAsNode: true,
      available: exists(options.helperStubPath),
      diagnostics: ['stub backend selected; no tunnel or local proxy forwarding is performed'],
      getBackendLaunchArgs: ({ configPath, sessionId, profileId }) => [
        options.helperStubPath,
        '--config',
        configPath,
        '--session-id',
        sessionId,
        '--profile-id',
        profileId
      ],
      getBackendSelfCheckArgs: () => [options.helperStubPath, '--self-check'],
      generateBackendConfig: (config) => config
    }
  }

  return {
    mode: 'proxy-prototype',
    kind: 'prototype',
    command,
    executablePath: options.proxyBackendPath,
    runAsNode: true,
    available: exists(options.proxyBackendPath),
    diagnostics: [
      'proxy prototype backend selected; local proxy readiness is real but Amnezia transport forwarding is not implemented'
    ],
    getBackendLaunchArgs: ({ configPath, sessionId, profileId }) => [
      options.proxyBackendPath,
      '--config',
      configPath,
      '--session-id',
      sessionId,
      '--profile-id',
      profileId
    ],
    getBackendSelfCheckArgs: () => [options.proxyBackendPath, '--self-check'],
    generateBackendConfig: (config) => config
  }
}

export function generateBackendConfig(
  backend: ResolvedAmneziaHelperBackend,
  config: AmneziaHelperRuntimeConfig
): AmneziaHelperBackendConfig {
  return backend.generateBackendConfig(config)
}

export function getBackendExecutablePath(backend: ResolvedAmneziaHelperBackend): string {
  return backend.executablePath
}

export function getBackendLaunchArgs(
  backend: ResolvedAmneziaHelperBackend,
  context: AmneziaHelperBackendLaunchContext
): string[] {
  return backend.getBackendLaunchArgs(context)
}

export function getBackendSelfCheckArgs(backend: ResolvedAmneziaHelperBackend): string[] {
  return backend.getBackendSelfCheckArgs()
}

export function resolveProductionBackendPath(
  options: ResolveProductionBackendPathOptions
): ResolvedProductionBackendPath {
  const exists = options.exists ?? existsSync
  const explicitPath = options.explicitPath?.trim()
  const candidates = explicitPath
    ? [explicitPath]
    : getProductionBackendPathCandidates({
        resourcesFilesDir: options.resourcesFilesDir,
        platform: options.platform,
        arch: options.arch
      })
  const found = candidates.find((candidate) => exists(candidate))

  return {
    path: found ?? candidates[0] ?? '',
    found: Boolean(found),
    explicit: Boolean(explicitPath),
    candidates
  }
}

export function getProductionBackendPathCandidates(options: {
  resourcesFilesDir?: string
  platform?: NodeJS.Platform | string
  arch?: string
}): string[] {
  const resourcesFilesDir = options.resourcesFilesDir
  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  const binaryName = getProductionBackendBinaryName(platform)

  if (!resourcesFilesDir) return [binaryName]

  return [
    path.join(resourcesFilesDir, 'amnezia-helper', platform, arch, binaryName),
    path.join(resourcesFilesDir, 'amnezia-helper', `${platform}-${arch}`, binaryName),
    path.join(resourcesFilesDir, 'amnezia-helper', platform, binaryName),
    path.join(resourcesFilesDir, binaryName)
  ]
}

export function getProductionBackendBinaryName(platform: NodeJS.Platform | string): string {
  return platform === 'win32' ? 'amnezia-helper.exe' : 'amnezia-helper'
}

export function validateProductionBackendExecutable(
  input: ValidateProductionBackendExecutableInput
): AmneziaHelperExecutableValidationResult {
  const platform = input.platform ?? process.platform
  const arch = input.arch ?? process.arch
  const exists = input.exists ?? existsSync
  const stat = input.stat ?? statSync
  const access = input.access ?? accessSync
  const readFile = input.readFile ?? readFileSync
  const issues: AmneziaHelperExecutableValidationIssue[] = []
  const executablePath = input.executablePath

  if (!supportedDesktopPlatforms.has(platform)) {
    issues.push({
      code: 'unsupported_platform',
      message: `Unsupported Amnezia helper platform: ${platform}`,
      expectedPlatform: Array.from(supportedDesktopPlatforms).join(','),
      actualPlatform: platform
    })
  }

  if (!supportedDesktopArchitectures.has(arch)) {
    issues.push({
      code: 'unsupported_arch',
      message: `Unsupported Amnezia helper architecture: ${arch}`,
      expectedArch: Array.from(supportedDesktopArchitectures).join(','),
      actualArch: arch
    })
  }

  if (!executablePath || !exists(executablePath)) {
    issues.push({
      code: 'missing',
      message: `Amnezia helper executable is missing: ${executablePath || 'not configured'}`,
      path: executablePath
    })
  } else {
    try {
      const stats = stat(executablePath)
      if (!stats.isFile()) {
        issues.push({
          code: 'not_file',
          message: `Amnezia helper path is not a file: ${executablePath}`,
          path: executablePath
        })
      }
    } catch (error) {
      issues.push({
        code: 'missing',
        message: `Amnezia helper executable cannot be inspected: ${error instanceof Error ? error.message : String(error)}`,
        path: executablePath
      })
    }

    try {
      access(executablePath, platform === 'win32' ? constants.R_OK : constants.X_OK)
    } catch {
      issues.push({
        code: 'permission_denied',
        message:
          platform === 'win32'
            ? `Amnezia helper executable is not readable: ${executablePath}`
            : `Amnezia helper executable bit is not set: ${executablePath}`,
        path: executablePath
      })
    }
  }

  const manifest = readProductionBackendManifest(executablePath, readFile)
  if (manifest?.platform && manifest.platform !== platform) {
    issues.push({
      code: 'arch_mismatch',
      message: `Amnezia helper manifest platform mismatch: expected ${platform}, got ${manifest.platform}`,
      path: executablePath,
      expectedPlatform: platform,
      actualPlatform: manifest.platform
    })
  }
  if (manifest?.arch && manifest.arch !== arch) {
    issues.push({
      code: 'arch_mismatch',
      message: `Amnezia helper manifest architecture mismatch: expected ${arch}, got ${manifest.arch}`,
      path: executablePath,
      expectedArch: arch,
      actualArch: manifest.arch
    })
  }

  const diagnostics =
    issues.length > 0
      ? issues.map((issue) => `${issue.code}: ${issue.message}`)
      : [
          `production helper executable validated for ${platform}/${arch}: ${executablePath}`,
          manifest
            ? `production helper manifest: ${manifest.name ?? 'amnezia-helper'} ${manifest.version ?? 'unknown'}`
            : 'production helper manifest not found; binary architecture could not be verified from metadata'
        ]

  return {
    ok: issues.length === 0,
    path: executablePath,
    platform,
    arch,
    issues,
    diagnostics,
    manifest
  }
}

export function mapExecutableValidationIssueToDiagnosticKind(
  issue: AmneziaHelperExecutableValidationIssue | undefined
): AmneziaHelperBackendDiagnosticKind {
  switch (issue?.code) {
    case 'permission_denied':
      return 'backend_permission_denied'
    case 'not_file':
      return 'backend_not_executable'
    case 'unsupported_platform':
      return 'unsupported_platform'
    case 'unsupported_arch':
      return 'unsupported_arch'
    case 'arch_mismatch':
      return 'backend_arch_mismatch'
    case 'missing':
    default:
      return 'backend_unavailable'
  }
}

export function parseBackendReadiness(message: string): AmneziaHelperBackendDiagnostic | undefined {
  if (/\bREADY\b/i.test(message) || /local proxy .*ready/i.test(message)) {
    return {
      kind: 'local_proxy_ready',
      message
    }
  }

  return undefined
}

export function parseBackendDiagnostics(
  message: string
): AmneziaHelperBackendDiagnostic | undefined {
  if (/CONFIG_ACCEPTED|config accepted/i.test(message)) {
    return {
      kind: 'config_accepted',
      message
    }
  }

  const readiness = parseBackendReadiness(message)
  if (readiness) return readiness

  if (/unsupported config|unsupported_config/i.test(message)) {
    return {
      kind: 'unsupported_config',
      message
    }
  }

  if (/backend unavailable|not found|missing backend/i.test(message)) {
    return {
      kind: 'backend_unavailable',
      message
    }
  }

  if (/EACCES|permission denied|not executable/i.test(message)) {
    return {
      kind: 'backend_permission_denied',
      message
    }
  }

  if (/ENOENT|spawn failed|spawn error/i.test(message)) {
    return {
      kind: 'backend_spawn_failure',
      message
    }
  }

  if (/unsupported platform/i.test(message)) {
    return {
      kind: 'unsupported_platform',
      message
    }
  }

  if (/unsupported arch|unsupported architecture/i.test(message)) {
    return {
      kind: 'unsupported_arch',
      message
    }
  }

  if (/arch mismatch|architecture mismatch|platform mismatch/i.test(message)) {
    return {
      kind: 'backend_arch_mismatch',
      message
    }
  }

  if (/STARTUP_FAILED|startup failed|listen failed|\berror\b|failed/i.test(message)) {
    return {
      kind: 'startup_failed',
      message
    }
  }

  return undefined
}

function readProductionBackendManifest(
  executablePath: string,
  readFile: (filePath: string, encoding: BufferEncoding) => string
): AmneziaHelperBackendManifest | undefined {
  if (!executablePath) return undefined
  const manifestPath = `${executablePath}.json`
  try {
    const parsed = JSON.parse(readFile(manifestPath, 'utf-8')) as AmneziaHelperBackendManifest
    if (!parsed || typeof parsed !== 'object') return undefined
    return parsed
  } catch {
    return undefined
  }
}
