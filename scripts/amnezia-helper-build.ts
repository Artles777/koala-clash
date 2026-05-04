import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import * as path from 'node:path'
import { pathToFileURL } from 'node:url'
import { getProductionBackendBinaryName } from '../src/main/runtime/amnezia-helper-backend-provider'
import {
  AmneziaHelperArtifactArch,
  AmneziaHelperArtifactPlatform,
  AmneziaHelperArtifactTarget,
  allAmneziaHelperArtifactTargets,
  normalizeAmneziaHelperArtifactTarget
} from '../src/main/runtime/amnezia-helper-artifacts'

export interface AmneziaHelperBuildOptions {
  sourceDir?: string
  outputRoot?: string
  targets?: AmneziaHelperArtifactTarget[]
  packagePath?: string
  version?: string
  cgoEnabled?: string
  compact?: boolean
}

export interface AmneziaHelperBuildArtifact {
  platform: AmneziaHelperArtifactPlatform
  arch: AmneziaHelperArtifactArch
  sourceDir: string
  outputPath: string
  manifestPath: string
  ok: boolean
  stdout?: string
  stderr?: string
}

export interface AmneziaHelperBuildFailure {
  platform: AmneziaHelperArtifactPlatform
  arch: AmneziaHelperArtifactArch
  code: 'source_missing' | 'go_build_failed'
  message: string
  path?: string
}

export interface AmneziaHelperBuildReport {
  schemaVersion: 1
  operation: 'build'
  sourceDir: string
  outputRoot: string
  packagePath: string
  generatedAt: number
  targets: AmneziaHelperArtifactTarget[]
  artifacts: AmneziaHelperBuildArtifact[]
  failures: AmneziaHelperBuildFailure[]
  summary: {
    status: 'passed' | 'failed'
    built: number
    failed: number
    message: string
  }
}

interface BuildCliOptions extends AmneziaHelperBuildOptions {
  command: 'build'
  help?: boolean
}

const defaultSourceDir = path.join('native', 'amnezia-helper')
const defaultOutputRoot = 'helper-artifacts'
const defaultPackagePath = './cmd/amnezia-helper'

export async function buildAmneziaHelperArtifacts(
  options: AmneziaHelperBuildOptions = {}
): Promise<AmneziaHelperBuildReport> {
  const sourceDir = path.resolve(
    options.sourceDir ?? process.env.KOALA_AMNEZIA_HELPER_SOURCE_DIR ?? defaultSourceDir
  )
  const outputRoot = path.resolve(
    options.outputRoot ?? process.env.KOALA_AMNEZIA_HELPER_ARTIFACTS_DIR ?? defaultOutputRoot
  )
  const packagePath = options.packagePath ?? defaultPackagePath
  const targets = options.targets ?? [
    ...normalizeAmneziaHelperArtifactTarget(process.platform, inferArchFromEnv())
  ]
  const version = options.version ?? (await readHelperVersion(sourceDir))
  const report: AmneziaHelperBuildReport = {
    schemaVersion: 1,
    operation: 'build',
    sourceDir,
    outputRoot,
    packagePath,
    generatedAt: Date.now(),
    targets: targets.map((target) => ({ ...target })),
    artifacts: [],
    failures: [],
    summary: {
      status: 'failed',
      built: 0,
      failed: 0,
      message: 'build report has not been finalized'
    }
  }

  if (!existsSync(path.join(sourceDir, 'go.mod'))) {
    for (const target of targets) {
      report.failures.push({
        platform: target.platform,
        arch: target.arch,
        code: 'source_missing',
        message: `Amnezia helper Go module is missing: ${path.join(sourceDir, 'go.mod')}`,
        path: sourceDir
      })
    }
    return finalizeBuildReport(report)
  }

  for (const target of targets) {
    const binaryName = getProductionBackendBinaryName(target.platform)
    const outputPath = path.join(
      outputRoot,
      'amnezia-helper',
      target.platform,
      target.arch,
      binaryName
    )
    const manifestPath = `${outputPath}.json`
    await mkdir(path.dirname(outputPath), { recursive: true })

    const result = spawnSync('go', ['build', '-trimpath', '-o', outputPath, packagePath], {
      cwd: sourceDir,
      encoding: 'utf-8',
      env: {
        ...process.env,
        CGO_ENABLED: options.cgoEnabled ?? process.env.CGO_ENABLED ?? '0',
        GOARCH: toGoArch(target.arch),
        GOOS: toGoOS(target.platform)
      }
    })
    const artifact: AmneziaHelperBuildArtifact = {
      platform: target.platform,
      arch: target.arch,
      sourceDir,
      outputPath,
      manifestPath,
      ok: result.status === 0 && !result.error,
      stdout: trimOutput(result.stdout ?? ''),
      stderr: trimOutput(result.stderr ?? result.error?.message ?? '')
    }

    if (!artifact.ok) {
      report.failures.push({
        platform: target.platform,
        arch: target.arch,
        code: 'go_build_failed',
        message:
          artifact.stderr ||
          artifact.stdout ||
          `go build failed for ${target.platform}/${target.arch}`,
        path: outputPath
      })
      report.artifacts.push(artifact)
      continue
    }

    if (target.platform !== 'win32') {
      await chmod(outputPath, 0o755)
    }
    await writeFile(
      manifestPath,
      `${JSON.stringify(
        {
          name: 'amnezia-helper',
          version,
          platform: target.platform,
          arch: target.arch,
          binary: binaryName
        },
        null,
        2
      )}\n`,
      'utf-8'
    )
    report.artifacts.push(artifact)
  }

  return finalizeBuildReport(report)
}

export function parseBuildArgs(argv: string[]): BuildCliOptions {
  const startIndex = argv[0] === 'build' ? 1 : 0
  const targetSpecs: string[] = []
  const targets: AmneziaHelperArtifactTarget[] = []
  const options: BuildCliOptions = {
    command: 'build',
    sourceDir: process.env.KOALA_AMNEZIA_HELPER_SOURCE_DIR,
    outputRoot: process.env.KOALA_AMNEZIA_HELPER_ARTIFACTS_DIR,
    targets
  }
  let archOverride = inferArchFromEnv()

  for (let index = startIndex; index < argv.length; index += 1) {
    const arg = argv[index]
    switch (arg) {
      case '--':
        break
      case '--help':
      case '-h':
        options.help = true
        break
      case '--source-dir':
        options.sourceDir = readValue(argv, ++index, arg)
        break
      case '--output-root':
        options.outputRoot = readValue(argv, ++index, arg)
        break
      case '--target':
        targetSpecs.push(readValue(argv, ++index, arg))
        break
      case '--arch':
        archOverride = readValue(argv, ++index, arg)
        break
      case '--all':
        targets.push(...allAmneziaHelperArtifactTargets())
        break
      case '--package':
        options.packagePath = readValue(argv, ++index, arg)
        break
      case '--version':
        options.version = readValue(argv, ++index, arg)
        break
      case '--cgo-enabled':
        options.cgoEnabled = readValue(argv, ++index, arg)
        break
      case '--compact':
        options.compact = true
        break
      default:
        throw new Error(`Unknown Amnezia helper build option: ${arg}`)
    }
  }

  for (const targetSpec of targetSpecs) {
    targets.push(...normalizeAmneziaHelperArtifactTarget(targetSpec, archOverride))
  }

  if (targets.length === 0) {
    targets.push(...normalizeAmneziaHelperArtifactTarget(process.platform, archOverride))
  }

  options.targets = dedupeTargets(targets)
  return options
}

function finalizeBuildReport(report: AmneziaHelperBuildReport): AmneziaHelperBuildReport {
  const built = report.artifacts.filter((artifact) => artifact.ok).length
  report.summary = {
    status: report.failures.length === 0 ? 'passed' : 'failed',
    built,
    failed: report.failures.length,
    message:
      report.failures.length === 0
        ? `build completed for ${built} Amnezia helper artifact(s)`
        : `build failed for ${report.failures.length} Amnezia helper target(s)`
  }
  return report
}

async function readHelperVersion(sourceDir: string): Promise<string> {
  try {
    const mainGo = await readFile(path.join(sourceDir, 'cmd', 'amnezia-helper', 'main.go'), 'utf-8')
    return mainGo.match(/const\s+version\s*=\s*"([^"]+)"/)?.[1] ?? '0.0.0-dev'
  } catch {
    return '0.0.0-dev'
  }
}

function toGoOS(platform: AmneziaHelperArtifactPlatform): string {
  switch (platform) {
    case 'win32':
      return 'windows'
    case 'darwin':
      return 'darwin'
    case 'linux':
      return 'linux'
  }
}

function toGoArch(arch: AmneziaHelperArtifactArch): string {
  return arch === 'x64' ? 'amd64' : 'arm64'
}

function dedupeTargets(targets: AmneziaHelperArtifactTarget[]): AmneziaHelperArtifactTarget[] {
  const seen = new Set<string>()
  return targets.filter((target) => {
    const key = `${target.platform}/${target.arch}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index]
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`)
  }
  return value
}

function inferArchFromEnv(): string | undefined {
  if (process.env.KOALA_AMNEZIA_HELPER_TARGET_ARCH) {
    return process.env.KOALA_AMNEZIA_HELPER_TARGET_ARCH
  }
  if (process.env.npm_config_target_arch) return process.env.npm_config_target_arch
  if (process.env.npm_config_arch) return process.env.npm_config_arch
  if (process.env.npm_config_arm64 === 'true') return 'arm64'
  if (process.env.npm_config_x64 === 'true') return 'x64'
  return undefined
}

function trimOutput(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function stringifyReport(report: AmneziaHelperBuildReport, compact?: boolean): string {
  return JSON.stringify(report, null, compact ? 0 : 2)
}

const helpText = `Koala Clash Amnezia helper build

Usage:
  pnpm build:amnezia-helper -- [options]
  pnpm build:amnezia-helper:<platform> -- [options]

Generated artifact layout:
  helper-artifacts/amnezia-helper/<platform>/<arch>/amnezia-helper(.exe)
  helper-artifacts/amnezia-helper/<platform>/<arch>/amnezia-helper(.exe).json

Options:
  build                           Command, optional
  --source-dir <path>             Helper Go module, defaults to native/amnezia-helper
  --output-root <path>            Generated artifact root, defaults to helper-artifacts
  --target <platform[-arch]>      Target to build; repeatable
  --arch <x64|arm64>              Arch for platform-only --target values
  --all                           Build all desktop targets
  --package <go package>          Go package, defaults to ./cmd/amnezia-helper
  --version <version>             Manifest version override
  --cgo-enabled <0|1>             CGO_ENABLED value, defaults to 0
  --compact

Environment:
  KOALA_AMNEZIA_HELPER_SOURCE_DIR
  KOALA_AMNEZIA_HELPER_ARTIFACTS_DIR
  KOALA_AMNEZIA_HELPER_TARGET_ARCH
`

async function main(): Promise<void> {
  const options = parseBuildArgs(process.argv.slice(2))
  if (options.help) {
    console.log(helpText)
    return
  }

  const report = await buildAmneziaHelperArtifacts(options)
  console.log(stringifyReport(report, options.compact))
  process.exitCode = report.summary.status === 'passed' ? 0 : 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    process.exitCode = 1
  })
}
