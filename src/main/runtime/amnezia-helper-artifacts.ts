import { spawnSync } from 'child_process'
import { createHash } from 'crypto'
import { existsSync } from 'fs'
import { chmod, copyFile, mkdir, readFile, stat, writeFile } from 'fs/promises'
import * as path from 'path'
import {
  AmneziaHelperExecutableValidationResult,
  getProductionBackendBinaryName,
  validateProductionBackendExecutable
} from './amnezia-helper-backend-provider'

export type AmneziaHelperArtifactPlatform = 'win32' | 'linux' | 'darwin'
export type AmneziaHelperArtifactArch = 'x64' | 'arm64'
export type AmneziaHelperArtifactOperation = 'prepare' | 'validate'
export type AmneziaHelperArtifactStatus = 'passed' | 'failed' | 'skipped'

export interface AmneziaHelperArtifactTarget {
  platform: AmneziaHelperArtifactPlatform
  arch: AmneziaHelperArtifactArch
}

export interface AmneziaHelperArtifactSelfCheckResult {
  status: AmneziaHelperArtifactStatus
  command: string
  args: string[]
  exitCode?: number | null
  signal?: NodeJS.Signals | null
  stdout?: string
  stderr?: string
  message?: string
}

export interface AmneziaHelperArtifactRecord {
  platform: AmneziaHelperArtifactPlatform
  arch: AmneziaHelperArtifactArch
  sourcePath?: string
  stagedPath: string
  manifestPath?: string
  checksumSha256?: string
  sizeBytes?: number
  validation: AmneziaHelperExecutableValidationResult
  stagedValidation?: AmneziaHelperExecutableValidationResult
  selfCheck?: AmneziaHelperArtifactSelfCheckResult
}

export interface AmneziaHelperArtifactFailure {
  platform: AmneziaHelperArtifactPlatform
  arch: AmneziaHelperArtifactArch
  code: string
  message: string
  path?: string
}

export interface AmneziaHelperArtifactManifest {
  schemaVersion: 1
  generatedAt: number
  sourceRoot?: string
  stagingRoot: string
  artifacts: Array<{
    platform: AmneziaHelperArtifactPlatform
    arch: AmneziaHelperArtifactArch
    sourcePath?: string
    packagedPath: string
    checksumSha256: string
    sizeBytes: number
    helperManifest?: AmneziaHelperExecutableValidationResult['manifest']
  }>
}

export interface AmneziaHelperArtifactReport {
  schemaVersion: 1
  operation: AmneziaHelperArtifactOperation
  generatedAt: number
  sourceRoot?: string
  stagingRoot: string
  manifestPath: string
  requiredTargets: AmneziaHelperArtifactTarget[]
  artifacts: AmneziaHelperArtifactRecord[]
  failures: AmneziaHelperArtifactFailure[]
  summary: {
    status: 'passed' | 'failed'
    prepared: number
    validated: number
    failed: number
    message: string
  }
}

export interface PrepareAmneziaHelperArtifactsOptions {
  sourceRoot?: string
  stagingRoot?: string
  manifestPath?: string
  targets?: AmneziaHelperArtifactTarget[]
  selfCheck?: boolean
  forceSelfCheck?: boolean
  selfCheckTimeoutMs?: number
  now?: () => number
}

export interface ValidateAmneziaHelperArtifactsOptions {
  stagingRoot?: string
  manifestPath?: string
  targets?: AmneziaHelperArtifactTarget[]
  now?: () => number
}

const supportedPlatforms: AmneziaHelperArtifactPlatform[] = ['win32', 'linux', 'darwin']
const supportedArchitectures: AmneziaHelperArtifactArch[] = ['x64', 'arm64']
const defaultSourceRoot = 'helper-artifacts'
const defaultStagingRoot = path.join('extra', 'files')
const defaultManifestName = 'manifest.json'

export function allAmneziaHelperArtifactTargets(): AmneziaHelperArtifactTarget[] {
  return supportedPlatforms.flatMap((platform) =>
    supportedArchitectures.map((arch) => ({ platform, arch }))
  )
}

export function normalizeAmneziaHelperArtifactTarget(
  value: string,
  fallbackArch?: string
): AmneziaHelperArtifactTarget[] {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('Empty Amnezia helper artifact target')
  if (trimmed === 'all') return allAmneziaHelperArtifactTargets()

  const [platformValue, archValue] = trimmed.split(/[:/-]/)
  const platform = requireArtifactPlatform(platformValue)
  const arch = requireArtifactArch(archValue || fallbackArch || process.arch)
  return [{ platform, arch }]
}

export function getAmneziaHelperArtifactSourcePath(options: {
  sourceRoot: string
  target: AmneziaHelperArtifactTarget
  exists?: (filePath: string) => boolean
}): string {
  const exists = options.exists ?? existsSync
  const binaryName = getProductionBackendBinaryName(options.target.platform)
  const candidates = [
    path.join(
      options.sourceRoot,
      'amnezia-helper',
      options.target.platform,
      options.target.arch,
      binaryName
    ),
    path.join(options.sourceRoot, options.target.platform, options.target.arch, binaryName),
    path.join(
      options.sourceRoot,
      'amnezia-helper',
      `${options.target.platform}-${options.target.arch}`,
      binaryName
    ),
    path.join(options.sourceRoot, `${options.target.platform}-${options.target.arch}`, binaryName)
  ]

  return candidates.find((candidate) => exists(candidate)) ?? candidates[0]
}

export function getAmneziaHelperArtifactStagedPath(options: {
  stagingRoot: string
  target: AmneziaHelperArtifactTarget
}): string {
  return path.join(
    options.stagingRoot,
    'amnezia-helper',
    options.target.platform,
    options.target.arch,
    getProductionBackendBinaryName(options.target.platform)
  )
}

export async function prepareAmneziaHelperArtifacts(
  options: PrepareAmneziaHelperArtifactsOptions = {}
): Promise<AmneziaHelperArtifactReport> {
  const now = options.now ?? Date.now
  const sourceRoot = path.resolve(options.sourceRoot ?? defaultSourceRoot)
  const stagingRoot = path.resolve(options.stagingRoot ?? defaultStagingRoot)
  const manifestPath = path.resolve(
    options.manifestPath ?? path.join(stagingRoot, 'amnezia-helper', defaultManifestName)
  )
  const targets = options.targets ?? [
    {
      platform: requireArtifactPlatform(process.platform),
      arch: requireArtifactArch(process.arch)
    }
  ]
  const report = createArtifactReport({
    operation: 'prepare',
    generatedAt: now(),
    sourceRoot,
    stagingRoot,
    manifestPath,
    targets
  })

  for (const target of targets) {
    const sourcePath = getAmneziaHelperArtifactSourcePath({ sourceRoot, target })
    const stagedPath = getAmneziaHelperArtifactStagedPath({ stagingRoot, target })
    const validation = validateProductionBackendExecutable({
      executablePath: sourcePath,
      platform: target.platform,
      arch: target.arch
    })
    const record: AmneziaHelperArtifactRecord = {
      platform: target.platform,
      arch: target.arch,
      sourcePath,
      stagedPath,
      validation
    }

    if (!validation.ok) {
      pushValidationFailures(report, target, validation)
      report.artifacts.push(record)
      continue
    }

    await mkdir(path.dirname(stagedPath), { recursive: true })
    await copyFile(sourcePath, stagedPath)
    await copyManifestIfPresent(sourcePath, stagedPath)
    if (target.platform !== 'win32') {
      await chmod(stagedPath, 0o755)
    }

    record.stagedValidation = validateProductionBackendExecutable({
      executablePath: stagedPath,
      platform: target.platform,
      arch: target.arch
    })
    if (!record.stagedValidation.ok) {
      pushValidationFailures(report, target, record.stagedValidation)
      report.artifacts.push(record)
      continue
    }

    const stats = await stat(stagedPath)
    record.sizeBytes = stats.size
    record.checksumSha256 = await checksumFile(stagedPath)
    record.manifestPath = existsSync(`${stagedPath}.json`) ? `${stagedPath}.json` : undefined
    if (options.selfCheck) {
      record.selfCheck = runArtifactSelfCheck({
        target,
        stagedPath,
        force: options.forceSelfCheck,
        timeoutMs: options.selfCheckTimeoutMs
      })
      if (record.selfCheck.status === 'failed') {
        report.failures.push({
          platform: target.platform,
          arch: target.arch,
          code: 'self_check_failed',
          message:
            record.selfCheck.stderr || record.selfCheck.message || 'Helper self-check failed',
          path: stagedPath
        })
      }
    }

    report.artifacts.push(record)
  }

  await writeArtifactManifest(report)
  return finalizeArtifactReport(report)
}

export async function validatePreparedAmneziaHelperArtifacts(
  options: ValidateAmneziaHelperArtifactsOptions = {}
): Promise<AmneziaHelperArtifactReport> {
  const now = options.now ?? Date.now
  const stagingRoot = path.resolve(options.stagingRoot ?? defaultStagingRoot)
  const manifestPath = path.resolve(
    options.manifestPath ?? path.join(stagingRoot, 'amnezia-helper', defaultManifestName)
  )
  const targets = options.targets ?? [
    {
      platform: requireArtifactPlatform(process.platform),
      arch: requireArtifactArch(process.arch)
    }
  ]
  const report = createArtifactReport({
    operation: 'validate',
    generatedAt: now(),
    stagingRoot,
    manifestPath,
    targets
  })
  const manifest = await readArtifactManifestIfPresent(manifestPath)

  for (const target of targets) {
    const stagedPath = getAmneziaHelperArtifactStagedPath({ stagingRoot, target })
    const validation = validateProductionBackendExecutable({
      executablePath: stagedPath,
      platform: target.platform,
      arch: target.arch
    })
    const record: AmneziaHelperArtifactRecord = {
      platform: target.platform,
      arch: target.arch,
      stagedPath,
      validation
    }

    if (!validation.ok) {
      pushValidationFailures(report, target, validation)
      report.artifacts.push(record)
      continue
    }

    const stats = await stat(stagedPath)
    const checksumSha256 = await checksumFile(stagedPath)
    record.sizeBytes = stats.size
    record.checksumSha256 = checksumSha256
    record.manifestPath = existsSync(`${stagedPath}.json`) ? `${stagedPath}.json` : undefined

    const manifestArtifact = manifest?.artifacts.find(
      (artifact) => artifact.platform === target.platform && artifact.arch === target.arch
    )
    if (!manifestArtifact) {
      report.failures.push({
        platform: target.platform,
        arch: target.arch,
        code: 'manifest_entry_missing',
        message: `Prepared helper manifest is missing ${target.platform}/${target.arch}`,
        path: manifestPath
      })
    } else if (manifestArtifact.checksumSha256 !== checksumSha256) {
      report.failures.push({
        platform: target.platform,
        arch: target.arch,
        code: 'checksum_mismatch',
        message: `Prepared helper checksum mismatch for ${target.platform}/${target.arch}`,
        path: stagedPath
      })
    }

    report.artifacts.push(record)
  }

  if (!manifest) {
    report.failures.push({
      platform: targets[0]?.platform ?? 'linux',
      arch: targets[0]?.arch ?? 'x64',
      code: 'manifest_missing',
      message: `Prepared helper manifest is missing: ${manifestPath}`,
      path: manifestPath
    })
  }

  return finalizeArtifactReport(report)
}

export function createAmneziaHelperArtifactManifest(
  report: AmneziaHelperArtifactReport
): AmneziaHelperArtifactManifest {
  return {
    schemaVersion: 1,
    generatedAt: report.generatedAt,
    sourceRoot: report.sourceRoot,
    stagingRoot: report.stagingRoot,
    artifacts: report.artifacts
      .filter((artifact) => artifact.checksumSha256 && artifact.sizeBytes !== undefined)
      .map((artifact) => ({
        platform: artifact.platform,
        arch: artifact.arch,
        sourcePath: artifact.sourcePath,
        packagedPath: artifact.stagedPath,
        checksumSha256: artifact.checksumSha256 ?? '',
        sizeBytes: artifact.sizeBytes ?? 0,
        helperManifest:
          artifact.stagedValidation?.manifest ?? artifact.validation.manifest ?? undefined
      }))
  }
}

function createArtifactReport(input: {
  operation: AmneziaHelperArtifactOperation
  generatedAt: number
  sourceRoot?: string
  stagingRoot: string
  manifestPath: string
  targets: AmneziaHelperArtifactTarget[]
}): AmneziaHelperArtifactReport {
  return {
    schemaVersion: 1,
    operation: input.operation,
    generatedAt: input.generatedAt,
    sourceRoot: input.sourceRoot,
    stagingRoot: input.stagingRoot,
    manifestPath: input.manifestPath,
    requiredTargets: input.targets.map((target) => ({ ...target })),
    artifacts: [],
    failures: [],
    summary: {
      status: 'failed',
      prepared: 0,
      validated: 0,
      failed: 0,
      message: 'artifact report has not been finalized'
    }
  }
}

async function writeArtifactManifest(report: AmneziaHelperArtifactReport): Promise<void> {
  const manifest = createAmneziaHelperArtifactManifest(report)
  await mkdir(path.dirname(report.manifestPath), { recursive: true })
  await writeFile(report.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')
}

async function readArtifactManifestIfPresent(
  manifestPath: string
): Promise<AmneziaHelperArtifactManifest | undefined> {
  try {
    return JSON.parse(await readFile(manifestPath, 'utf-8')) as AmneziaHelperArtifactManifest
  } catch {
    return undefined
  }
}

function finalizeArtifactReport(report: AmneziaHelperArtifactReport): AmneziaHelperArtifactReport {
  const successfulArtifacts = report.artifacts.filter(
    (artifact) => artifact.validation.ok && (artifact.stagedValidation?.ok ?? true)
  )
  report.summary = {
    status: report.failures.length === 0 ? 'passed' : 'failed',
    prepared: report.operation === 'prepare' ? successfulArtifacts.length : 0,
    validated: successfulArtifacts.length,
    failed: report.failures.length,
    message:
      report.failures.length === 0
        ? `${report.operation} completed for ${successfulArtifacts.length} Amnezia helper artifact(s)`
        : `${report.operation} failed for ${report.failures.length} Amnezia helper artifact issue(s)`
  }
  return report
}

function pushValidationFailures(
  report: AmneziaHelperArtifactReport,
  target: AmneziaHelperArtifactTarget,
  validation: AmneziaHelperExecutableValidationResult
): void {
  for (const issue of validation.issues) {
    report.failures.push({
      platform: target.platform,
      arch: target.arch,
      code: issue.code,
      message: issue.message,
      path: issue.path
    })
  }
}

function runArtifactSelfCheck(input: {
  target: AmneziaHelperArtifactTarget
  stagedPath: string
  force?: boolean
  timeoutMs?: number
}): AmneziaHelperArtifactSelfCheckResult {
  const args = ['self-check']
  const isRunnableOnCurrentHost =
    input.target.platform === process.platform && input.target.arch === process.arch
  if (!input.force && !isRunnableOnCurrentHost) {
    return {
      status: 'skipped',
      command: input.stagedPath,
      args,
      message: `self-check skipped for ${input.target.platform}/${input.target.arch} on ${process.platform}/${process.arch}`
    }
  }

  const result = spawnSync(input.stagedPath, args, {
    encoding: 'utf-8',
    timeout: input.timeoutMs ?? 5000
  })

  return {
    status: result.status === 0 ? 'passed' : 'failed',
    command: input.stagedPath,
    args,
    exitCode: result.status,
    signal: result.signal,
    stdout: trimOutput(result.stdout ?? ''),
    stderr: trimOutput(result.stderr ?? result.error?.message ?? '')
  }
}

async function copyManifestIfPresent(sourcePath: string, stagedPath: string): Promise<void> {
  const sourceManifestPath = `${sourcePath}.json`
  if (!existsSync(sourceManifestPath)) return
  await copyFile(sourceManifestPath, `${stagedPath}.json`)
}

async function checksumFile(filePath: string): Promise<string> {
  const content = await readFile(filePath)
  return createHash('sha256').update(content).digest('hex')
}

function requireArtifactPlatform(value: string): AmneziaHelperArtifactPlatform {
  if (value === 'win32' || value === 'linux' || value === 'darwin') return value
  throw new Error(`Unsupported Amnezia helper artifact platform: ${value}`)
}

function requireArtifactArch(value: string): AmneziaHelperArtifactArch {
  if (value === 'x64' || value === 'arm64') return value
  throw new Error(`Unsupported Amnezia helper artifact architecture: ${value}`)
}

function trimOutput(value: string): string {
  const maxLength = 8000
  return value.length > maxLength ? value.slice(value.length - maxLength) : value
}
