import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import * as path from 'node:path'
import {
  AmneziaHelperArtifactTarget,
  allAmneziaHelperArtifactTargets,
  normalizeAmneziaHelperArtifactTarget
} from '../src/main/runtime/amnezia-helper-artifacts'
import {
  AmneziaHelperCompatibilityMatrix,
  aggregateAmneziaHelperSmokeReports,
  loadAmneziaHelperSmokeReport
} from '../src/main/runtime/amnezia-helper-matrix'
import {
  AmneziaHelperPlatformValidationSummary,
  createAmneziaHelperPlatformValidationPlan,
  createAmneziaHelperPlatformValidationIssuePackage,
  createAmneziaHelperPlatformValidationSummary
} from '../src/main/runtime/amnezia-helper-platform-validation'

type PlatformValidationCommand = 'plan' | 'summarize' | 'package'

interface PlatformValidationCliOptions {
  command: PlatformValidationCommand
  targets: AmneziaHelperArtifactTarget[]
  reportsDir?: string
  reportPaths: string[]
  matrixPath?: string
  summaryPath?: string
  outputPath?: string
  compact?: boolean
  help?: boolean
  includeTun: boolean
  includeStability: boolean
  packagedAppPath?: string
  fixtureProfilePath?: string
  buildId?: string
  appVersion?: string
  helperRules: string[]
  dnsEnhancedMode?: string
  dnsHijack?: boolean
  stabilityCycles?: number
  soakDurationMs?: number
  soakIntervalMs?: number
  packageManagerCommand?: string
  evidenceDir?: string
  runId?: string
}

async function main(): Promise<void> {
  const options = parsePlatformValidationArgs(process.argv.slice(2))
  if (options.help) {
    console.log(helpText)
    return
  }

  if (options.command === 'plan') {
    const plan = createAmneziaHelperPlatformValidationPlan({
      targets: options.targets.length > 0 ? options.targets : allAmneziaHelperArtifactTargets(),
      includeTun: options.includeTun,
      includeStability: options.includeStability,
      reportsDir: options.reportsDir,
      packagedAppPath: options.packagedAppPath,
      fixtureProfilePath: options.fixtureProfilePath,
      buildId: options.buildId,
      appVersion: options.appVersion,
      helperRules: options.helperRules,
      dnsEnhancedMode: options.dnsEnhancedMode,
      dnsHijack: options.dnsHijack,
      stabilityCycles: options.stabilityCycles,
      soakDurationMs: options.soakDurationMs,
      soakIntervalMs: options.soakIntervalMs,
      packageManagerCommand: options.packageManagerCommand,
      evidenceDir: options.evidenceDir,
      runId: options.runId
    })
    await emitJson(plan, options)
    return
  }

  if (options.command === 'package') {
    const summary = await loadSummaryForIssuePackage(options)
    const issuePackage = createAmneziaHelperPlatformValidationIssuePackage({
      summary,
      sourceSummaryPath: options.summaryPath,
      sourceMatrixPath: options.matrixPath,
      reportsDir: options.reportsDir,
      runId: options.runId
    })
    await emitJson(issuePackage, options)
    return
  }

  const matrix = await loadMatrixForSummary(options)
  const summary = createAmneziaHelperPlatformValidationSummary({
    matrix,
    requireTun: options.includeTun,
    requireStability: options.includeStability
  })
  await emitJson(summary, options)
  process.exitCode = summary.releaseReadiness === 'blocked' ? 1 : 0
}

export function parsePlatformValidationArgs(argv: string[]): PlatformValidationCliOptions {
  const options: PlatformValidationCliOptions = {
    command: 'plan',
    targets: [],
    reportPaths: [],
    includeTun: true,
    includeStability: true,
    helperRules: []
  }

  let index = 0
  if (argv[0] === 'plan' || argv[0] === 'summarize' || argv[0] === 'package') {
    options.command = argv[0]
    index = 1
  }

  for (; index < argv.length; index += 1) {
    const arg = argv[index]
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true
        break
      case '--target':
        options.targets.push(...normalizeAmneziaHelperArtifactTarget(readValue(argv, ++index, arg)))
        break
      case '--all':
        options.targets.push(...allAmneziaHelperArtifactTargets())
        break
      case '--reports-dir':
        options.reportsDir = readValue(argv, ++index, arg)
        break
      case '--report':
        options.reportPaths.push(readValue(argv, ++index, arg))
        break
      case '--matrix':
        options.matrixPath = readValue(argv, ++index, arg)
        break
      case '--summary':
        options.summaryPath = readValue(argv, ++index, arg)
        break
      case '--output':
      case '--output-path':
        options.outputPath = readValue(argv, ++index, arg)
        break
      case '--compact':
        options.compact = true
        break
      case '--packaged-app-path':
        options.packagedAppPath = readValue(argv, ++index, arg)
        break
      case '--fixture-profile':
        options.fixtureProfilePath = readValue(argv, ++index, arg)
        break
      case '--build-id':
        options.buildId = readValue(argv, ++index, arg)
        break
      case '--app-version':
        options.appVersion = readValue(argv, ++index, arg)
        break
      case '--helper-rule':
        options.helperRules.push(readValue(argv, ++index, arg))
        break
      case '--dns-enhanced-mode':
        options.dnsEnhancedMode = readValue(argv, ++index, arg)
        break
      case '--dns-hijack':
        options.dnsHijack = true
        break
      case '--no-dns-hijack':
        options.dnsHijack = false
        break
      case '--no-tun':
        options.includeTun = false
        break
      case '--no-stability':
        options.includeStability = false
        break
      case '--stability-cycles':
        options.stabilityCycles = readNumber(readValue(argv, ++index, arg), arg)
        break
      case '--soak-duration-ms':
        options.soakDurationMs = readNumber(readValue(argv, ++index, arg), arg)
        break
      case '--soak-interval-ms':
        options.soakIntervalMs = readNumber(readValue(argv, ++index, arg), arg)
        break
      case '--package-manager':
        options.packageManagerCommand = readValue(argv, ++index, arg)
        break
      case '--evidence-dir':
        options.evidenceDir = readValue(argv, ++index, arg)
        break
      case '--run-id':
        options.runId = readValue(argv, ++index, arg)
        break
      default:
        if (arg.startsWith('--')) {
          throw new Error(`Unknown Amnezia helper platform validation option: ${arg}`)
        }
        options.reportPaths.push(arg)
    }
  }

  options.targets = dedupeTargets(options.targets)
  return options
}

async function loadMatrixForSummary(
  options: PlatformValidationCliOptions
): Promise<AmneziaHelperCompatibilityMatrix> {
  if (options.matrixPath) {
    return JSON.parse(
      await readFile(options.matrixPath, 'utf-8')
    ) as AmneziaHelperCompatibilityMatrix
  }

  const reportPaths = [
    ...options.reportPaths,
    ...(options.reportsDir ? await listJsonReports(options.reportsDir) : [])
  ]
  if (reportPaths.length === 0) {
    throw new Error('No matrix or Amnezia helper smoke reports were provided')
  }

  const reports = await Promise.all(
    reportPaths.map((filePath) => loadAmneziaHelperSmokeReport(filePath))
  )
  return aggregateAmneziaHelperSmokeReports({
    reports,
    requiredTargets:
      options.targets.length > 0 ? options.targets : allAmneziaHelperArtifactTargets(),
    requiredRuntimeScenarios: options.includeTun ? ['proxy', 'tun'] : ['proxy']
  })
}

async function loadSummaryForIssuePackage(
  options: PlatformValidationCliOptions
): Promise<AmneziaHelperPlatformValidationSummary> {
  if (options.summaryPath) {
    return JSON.parse(
      await readFile(options.summaryPath, 'utf-8')
    ) as AmneziaHelperPlatformValidationSummary
  }

  const matrix = await loadMatrixForSummary(options)
  return createAmneziaHelperPlatformValidationSummary({
    matrix,
    requireTun: options.includeTun,
    requireStability: options.includeStability
  })
}

async function emitJson(value: unknown, options: PlatformValidationCliOptions): Promise<void> {
  const json = JSON.stringify(value, null, options.compact ? 0 : 2)
  if (options.outputPath) {
    await writeFile(options.outputPath, `${json}\n`, 'utf-8')
  }
  console.log(json)
}

async function listJsonReports(directory: string): Promise<string[]> {
  const entries = await readdir(directory)
  const paths: string[] = []
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue
    const filePath = path.join(directory, entry)
    if ((await stat(filePath)).isFile()) paths.push(filePath)
  }
  return paths.sort()
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

function dedupeTargets(targets: AmneziaHelperArtifactTarget[]): AmneziaHelperArtifactTarget[] {
  const seen = new Set<string>()
  return targets.filter((target) => {
    const key = `${target.platform}/${target.arch}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const helpText = `Koala Clash Amnezia helper real platform validation

Usage:
  pnpm amnezia-helper:platform-validation -- plan [options]
  pnpm amnezia-helper:platform-validation -- summarize --matrix <matrix.json> [options]
  pnpm amnezia-helper:platform-validation -- summarize --reports-dir <smoke-reports> [options]
  pnpm amnezia-helper:platform-validation -- package --summary <summary.json> [options]

Plan options:
  --target <platform[-arch]>        Limit generated commands to a target; repeatable
  --all                            Generate commands for the full desktop matrix
  --reports-dir <path>             Report directory, defaults to smoke-reports
  --evidence-dir <path>             Root directory for run-scoped evidence output
  --run-id <id>                     Stable run id for report/matrix/summary paths
  --packaged-app-path <path>        Packaged app path placeholder/value
  --fixture-profile <path>          Private normalized profile fixture placeholder/value
  --build-id <id>
  --app-version <version>
  --helper-rule <TYPE,value>        Include TUN helper rule diagnostics; repeatable
  --dns-enhanced-mode <mode>        Defaults to fake-ip
  --dns-hijack | --no-dns-hijack
  --no-tun                         Do not require/generate TUN smoke
  --no-stability                   Do not require/generate stability smoke
  --stability-cycles <count>
  --soak-duration-ms <ms>
  --soak-interval-ms <ms>
  --package-manager <command>       Defaults to pnpm

Summary options:
  --matrix <path>                   Read an existing compatibility matrix
  --reports-dir <path>              Aggregate smoke reports first
  --report <path>                   Add one smoke report; repeatable
  --target <platform[-arch]>        Required target when aggregating reports
  --all                            Require all desktop targets when aggregating reports
  --no-tun                         Do not require TUN rows
  --no-stability                   Do not block on missing stability reports
  --output <path>                   Write JSON output
  --compact                         Emit compact JSON

Issue package options:
  --summary <path>                  Read a platform validation summary
  --matrix <path>                   Or derive the summary from a matrix
  --reports-dir <path>              Or derive matrix/summary from smoke reports
  --run-id <id>                     Include a release run id in the evidence package
  --output <path>                   Write issue package JSON

Exit code:
  plan always exits 0 when commands are generated
  summarize exits 1 when the platform validation summary is blocked
  package exits 0 after writing the issue package
`

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
})
