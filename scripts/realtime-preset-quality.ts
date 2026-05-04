import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import * as path from 'node:path'
import {
  aggregateRealtimePresetEvidenceReports,
  createRealtimePresetEvidenceReport,
  type RealtimePresetEvidenceReport,
  type RealtimePresetEvidenceScope,
  type RealtimePresetRuntimeScenario
} from '../src/core/routing/realtime-preset-quality'
import { readRealtimePresetValidationStore } from '../src/features/realtime-preset-validation/store'

interface RealtimePresetQualityCliOptions {
  command: 'report' | 'matrix'
  storePath?: string
  reportPaths: string[]
  reportsDir?: string
  outputPath?: string
  platform?: string
  arch?: string
  buildId?: string
  appVersion?: string
  runId?: string
  evidenceScope: RealtimePresetEvidenceScope
  requiredPresetIds: string[]
  requiredPlatforms: string[]
  requiredRuntimeScenarios: RealtimePresetRuntimeScenario[]
  compact?: boolean
  help?: boolean
}

async function main(): Promise<void> {
  const options = parseRealtimePresetQualityArgs(process.argv.slice(2))
  if (options.help) {
    console.log(helpText)
    return
  }

  if (options.command === 'report') {
    if (!options.storePath) throw new Error('Missing --store for realtime preset report')
    const store = await readRealtimePresetValidationStore(options.storePath)
    const report = createRealtimePresetEvidenceReport({
      evidence: store.entries,
      platform: options.platform,
      arch: options.arch,
      buildId: options.buildId,
      appVersion: options.appVersion,
      runId: options.runId,
      evidenceScope: options.evidenceScope,
      reportPath: options.outputPath
    })
    await emitJson(report, options.outputPath, options.compact)
    return
  }

  const reportPaths = [
    ...options.reportPaths,
    ...(options.reportsDir ? await listJsonReports(options.reportsDir) : [])
  ]
  if (reportPaths.length === 0) {
    throw new Error('No realtime preset evidence reports were provided')
  }
  const reports = await Promise.all(reportPaths.map(loadRealtimePresetEvidenceReport))
  const matrix = aggregateRealtimePresetEvidenceReports({
    reports,
    requiredPresetIds: options.requiredPresetIds.length > 0 ? options.requiredPresetIds : undefined,
    requiredPlatforms: options.requiredPlatforms.length > 0 ? options.requiredPlatforms : undefined,
    requiredRuntimeScenarios:
      options.requiredRuntimeScenarios.length > 0 ? options.requiredRuntimeScenarios : undefined
  })
  await emitJson(matrix, options.outputPath, options.compact)
}

export function parseRealtimePresetQualityArgs(argv: string[]): RealtimePresetQualityCliOptions {
  const options: RealtimePresetQualityCliOptions = {
    command: 'matrix',
    reportPaths: [],
    evidenceScope: 'local',
    requiredPresetIds: [],
    requiredPlatforms: [],
    requiredRuntimeScenarios: []
  }

  const first = argv[0]
  let startIndex = 0
  if (first === 'report' || first === 'matrix') {
    options.command = first
    startIndex = 1
  }

  for (let index = startIndex; index < argv.length; index += 1) {
    const arg = argv[index]
    switch (arg) {
      case '--':
        break
      case '--help':
      case '-h':
        options.help = true
        break
      case '--store':
        options.storePath = readValue(argv, ++index, arg)
        break
      case '--report':
        options.reportPaths.push(readValue(argv, ++index, arg))
        break
      case '--reports-dir':
        options.reportsDir = readValue(argv, ++index, arg)
        break
      case '--output':
      case '--output-path':
        options.outputPath = readValue(argv, ++index, arg)
        break
      case '--platform':
        options.platform = readValue(argv, ++index, arg)
        break
      case '--arch':
        options.arch = readValue(argv, ++index, arg)
        break
      case '--build-id':
        options.buildId = readValue(argv, ++index, arg)
        break
      case '--app-version':
        options.appVersion = readValue(argv, ++index, arg)
        break
      case '--run-id':
        options.runId = readValue(argv, ++index, arg)
        break
      case '--packaged':
        options.evidenceScope = 'packaged'
        break
      case '--local':
        options.evidenceScope = 'local'
        break
      case '--preset':
        options.requiredPresetIds.push(readValue(argv, ++index, arg))
        break
      case '--required-platform':
        options.requiredPlatforms.push(readValue(argv, ++index, arg))
        break
      case '--runtime-scenario':
        options.requiredRuntimeScenarios.push(
          normalizeRuntimeScenario(readValue(argv, ++index, arg))
        )
        break
      case '--require-proxy-tun':
        options.requiredRuntimeScenarios.push('proxy', 'tun')
        break
      case '--compact':
        options.compact = true
        break
      default:
        if (arg.startsWith('--')) {
          throw new Error(`Unknown realtime preset quality option: ${arg}`)
        }
        options.reportPaths.push(arg)
    }
  }

  options.requiredPresetIds = dedupeStrings(options.requiredPresetIds)
  options.requiredPlatforms = dedupeStrings(options.requiredPlatforms)
  options.requiredRuntimeScenarios = Array.from(new Set(options.requiredRuntimeScenarios))
  return options
}

async function loadRealtimePresetEvidenceReport(
  filePath: string
): Promise<RealtimePresetEvidenceReport> {
  const parsed = JSON.parse(
    await readFile(filePath, 'utf-8')
  ) as Partial<RealtimePresetEvidenceReport>
  if (parsed.format !== 'koala-clash.realtime-preset-evidence' || !Array.isArray(parsed.rows)) {
    throw new Error(`Not a realtime preset evidence report: ${filePath}`)
  }
  return parsed as RealtimePresetEvidenceReport
}

async function listJsonReports(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const paths: string[] = []
  for (const entry of entries) {
    const filePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      paths.push(...(await listJsonReports(filePath)))
    } else if (entry.isFile() && entry.name.endsWith('.json') && (await stat(filePath)).isFile()) {
      paths.push(filePath)
    }
  }
  return paths.sort()
}

async function emitJson(value: unknown, outputPath?: string, compact?: boolean): Promise<void> {
  const json = JSON.stringify(value, null, compact ? 0 : 2)
  if (outputPath) {
    await writeFile(outputPath, `${json}\n`, 'utf-8')
  }
  console.log(json)
}

function normalizeRuntimeScenario(value: string): RealtimePresetRuntimeScenario {
  if (value === 'proxy' || value === 'tun' || value === 'unknown') return value
  throw new Error(`Unsupported runtime scenario: ${value}`)
}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index]
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`)
  }
  return value
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))
}

const helpText = `Koala Clash realtime preset quality reports

Usage:
  pnpm realtime-preset:quality -- report --store <validation-store.json> --packaged --platform darwin --arch arm64 --output preset-evidence.json
  pnpm realtime-preset:quality -- matrix --reports-dir release-evidence/realtime-presets/<run-id> --preset discord_voice_vpn --require-proxy-tun --output realtime-preset-quality-matrix.json

Commands:
  report   Convert a realtime preset validation store into an evidence report
  matrix   Aggregate one or more evidence reports into a preset quality matrix

Report options:
  --store <path>              Realtime preset validation store JSON
  --packaged                  Mark evidence as collected from a packaged build
  --local                     Mark evidence as local/dev evidence
  --platform <platform>       Platform override, for example darwin, win32, linux
  --arch <arch>               Architecture override
  --build-id <id>             Build id recorded into the report
  --app-version <version>     App version recorded into the report
  --run-id <id>               Release evidence run id

Matrix options:
  --report <path>             Add one evidence report; repeatable
  --reports-dir <path>        Add all nested .json evidence reports from a directory
  --preset <id>               Require a preset id in the matrix; repeatable
  --required-platform <name>  Require a platform in the matrix; repeatable
  --runtime-scenario <proxy|tun>
  --require-proxy-tun         Require both proxy and TUN rows

Common:
  --output <path>             Write JSON to a file
  --compact                   Emit compact JSON
`

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
})
