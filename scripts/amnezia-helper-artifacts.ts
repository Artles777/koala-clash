import { writeFile } from 'node:fs/promises'
import { buildAmneziaHelperArtifacts } from './amnezia-helper-build'
import {
  AmneziaHelperArtifactReport,
  AmneziaHelperArtifactTarget,
  allAmneziaHelperArtifactTargets,
  normalizeAmneziaHelperArtifactTarget,
  prepareAmneziaHelperArtifacts,
  validatePreparedAmneziaHelperArtifacts
} from '../src/main/runtime/amnezia-helper-artifacts'

interface ArtifactCliOptions {
  command: 'prepare' | 'validate'
  sourceRoot?: string
  stagingRoot?: string
  manifestPath?: string
  reportPath?: string
  targets: AmneziaHelperArtifactTarget[]
  selfCheck?: boolean
  forceSelfCheck?: boolean
  selfCheckTimeoutMs?: number
  compact?: boolean
  help?: boolean
  build?: boolean
  skipBuild?: boolean
  sourceRootExplicit?: boolean
  buildSourceDir?: string
  buildReportPath?: string
}

async function main(): Promise<void> {
  const options = parseArtifactArgs(process.argv.slice(2))
  if (options.help) {
    console.log(helpText)
    return
  }

  if (options.command === 'prepare' && shouldBuildBeforePrepare(options)) {
    const buildReport = await buildAmneziaHelperArtifacts({
      sourceDir: options.buildSourceDir,
      outputRoot: options.sourceRoot,
      targets: options.targets
    })
    if (options.buildReportPath) {
      await writeFile(
        options.buildReportPath,
        `${JSON.stringify(buildReport, null, options.compact ? 0 : 2)}\n`,
        'utf-8'
      )
    }
    if (buildReport.summary.status !== 'passed') {
      throw new Error(buildReport.summary.message)
    }
  }

  const report =
    options.command === 'prepare'
      ? await prepareAmneziaHelperArtifacts({
          sourceRoot: options.sourceRoot,
          stagingRoot: options.stagingRoot,
          manifestPath: options.manifestPath,
          targets: options.targets,
          selfCheck: options.selfCheck,
          forceSelfCheck: options.forceSelfCheck,
          selfCheckTimeoutMs: options.selfCheckTimeoutMs
        })
      : await validatePreparedAmneziaHelperArtifacts({
          stagingRoot: options.stagingRoot,
          manifestPath: options.manifestPath,
          targets: options.targets
        })

  const json = stringifyReport(report, options.compact)
  if (options.reportPath) {
    await writeFile(options.reportPath, `${json}\n`, 'utf-8')
  }

  console.log(json)
  process.exitCode = report.summary.status === 'passed' ? 0 : 1
}

export function parseArtifactArgs(argv: string[]): ArtifactCliOptions {
  const command = argv[0] === 'validate' || argv[0] === 'prepare' ? argv[0] : 'prepare'
  const startIndex = command === argv[0] ? 1 : 0
  const targetSpecs: string[] = []
  const targets: AmneziaHelperArtifactTarget[] = []
  const options: ArtifactCliOptions = {
    command,
    sourceRoot: process.env.KOALA_AMNEZIA_HELPER_ARTIFACTS_DIR,
    stagingRoot: process.env.KOALA_AMNEZIA_HELPER_STAGING_DIR,
    targets,
    sourceRootExplicit: Boolean(process.env.KOALA_AMNEZIA_HELPER_ARTIFACTS_DIR)
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
      case '--source-root':
        options.sourceRoot = readValue(argv, ++index, arg)
        options.sourceRootExplicit = true
        break
      case '--staging-root':
        options.stagingRoot = readValue(argv, ++index, arg)
        break
      case '--manifest-path':
        options.manifestPath = readValue(argv, ++index, arg)
        break
      case '--report-path':
        options.reportPath = readValue(argv, ++index, arg)
        break
      case '--build':
        options.build = true
        break
      case '--skip-build':
        options.skipBuild = true
        break
      case '--build-source-dir':
        options.buildSourceDir = readValue(argv, ++index, arg)
        break
      case '--build-report-path':
        options.buildReportPath = readValue(argv, ++index, arg)
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
      case '--self-check':
        options.selfCheck = true
        break
      case '--force-self-check':
        options.selfCheck = true
        options.forceSelfCheck = true
        break
      case '--self-check-timeout-ms':
        options.selfCheckTimeoutMs = readNumber(readValue(argv, ++index, arg), arg)
        break
      case '--compact':
        options.compact = true
        break
      default:
        throw new Error(`Unknown Amnezia helper artifact option: ${arg}`)
    }
  }

  for (const targetSpec of targetSpecs) {
    targets.push(...normalizeAmneziaHelperArtifactTarget(targetSpec, archOverride))
  }

  if (targets.length === 0) {
    targets.push(...normalizeAmneziaHelperArtifactTarget(process.platform, archOverride))
  }
  if (options.build && options.skipBuild) {
    throw new Error('Use either --build or --skip-build, not both')
  }

  options.targets = dedupeTargets(targets)
  return options
}

function shouldBuildBeforePrepare(options: ArtifactCliOptions): boolean {
  if (options.skipBuild) return false
  if (options.build) return true
  return !options.sourceRootExplicit
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

function stringifyReport(report: AmneziaHelperArtifactReport, compact?: boolean): string {
  return JSON.stringify(report, null, compact ? 0 : 2)
}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index]
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`)
  }
  return value
}

function readNumber(value: string, flag: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid numeric value for ${flag}: ${value}`)
  }
  return parsed
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

const helpText = `Koala Clash Amnezia helper artifact preparation

Usage:
  pnpm amnezia-helper:prepare -- [options]
  pnpm amnezia-helper:validate -- [options]

Default flow:
  prepare builds the helper from native/amnezia-helper into helper-artifacts,
  then validates and stages it for electron-builder.

Generated source artifact layout:
  helper-artifacts/amnezia-helper/<platform>/<arch>/amnezia-helper(.exe)
  helper-artifacts/amnezia-helper/<platform>/<arch>/amnezia-helper(.exe).json

Prepared package layout:
  extra/files/amnezia-helper/<platform>/<arch>/amnezia-helper(.exe)
  extra/files/amnezia-helper/manifest.json

Options:
  prepare|validate                 Command, defaults to prepare
  --source-root <path>              Source artifact root, defaults to helper-artifacts
                                   Accepts root, dist/, build/, or amnezia-helper/ layouts
                                   Explicit source roots skip automatic build unless --build is set
  --build                          Force helper source build before prepare
  --skip-build                     Stage existing artifacts without building helper source
  --build-source-dir <path>         Helper Go module, defaults to native/amnezia-helper
  --build-report-path <path>        Write helper build report JSON before prepare report
  --staging-root <path>             Staging root, defaults to extra/files
  --target <platform[-arch]>        Target to require; repeatable
  --arch <x64|arm64>                Arch for platform-only --target values
  --all                            Require all desktop targets
  --self-check                     Run helper version check when runnable on current host
  --force-self-check               Run version check even for cross targets
  --self-check-timeout-ms <ms>
  --manifest-path <path>
  --report-path <path>
  --compact

Environment:
  KOALA_AMNEZIA_HELPER_SOURCE_DIR
  KOALA_AMNEZIA_HELPER_ARTIFACTS_DIR
  KOALA_AMNEZIA_HELPER_STAGING_DIR
  KOALA_AMNEZIA_HELPER_TARGET_ARCH
`

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
})
