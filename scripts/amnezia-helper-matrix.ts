import { readdir, stat, writeFile } from 'node:fs/promises'
import * as path from 'node:path'
import {
  AmneziaHelperArtifactTarget,
  allAmneziaHelperArtifactTargets,
  normalizeAmneziaHelperArtifactTarget
} from '../src/main/runtime/amnezia-helper-artifacts'
import {
  aggregateAmneziaHelperSmokeReports,
  loadAmneziaHelperSmokeReport
} from '../src/main/runtime/amnezia-helper-matrix'
import { AmneziaHelperVerificationRuntimeScenario } from '../src/main/runtime/amnezia-helper-verification'

interface MatrixCliOptions {
  reportPaths: string[]
  reportsDir?: string
  outputPath?: string
  requiredTargets: AmneziaHelperArtifactTarget[]
  requiredRuntimeScenarios: AmneziaHelperVerificationRuntimeScenario[]
  compact?: boolean
  help?: boolean
}

async function main(): Promise<void> {
  const options = parseMatrixArgs(process.argv.slice(2))
  if (options.help) {
    console.log(helpText)
    return
  }

  const reportPaths = [
    ...options.reportPaths,
    ...(options.reportsDir ? await listJsonReports(options.reportsDir) : [])
  ]
  if (reportPaths.length === 0) {
    throw new Error('No Amnezia helper smoke reports were provided')
  }

  const reports = await Promise.all(
    reportPaths.map((filePath) => loadAmneziaHelperSmokeReport(filePath))
  )
  const matrix = aggregateAmneziaHelperSmokeReports({
    reports,
    requiredTargets:
      options.requiredTargets.length > 0
        ? options.requiredTargets
        : allAmneziaHelperArtifactTargets(),
    requiredRuntimeScenarios:
      options.requiredRuntimeScenarios.length > 0 ? options.requiredRuntimeScenarios : undefined
  })
  const json = JSON.stringify(matrix, null, options.compact ? 0 : 2)

  if (options.outputPath) {
    await writeFile(options.outputPath, `${json}\n`, 'utf-8')
  }

  console.log(json)
  process.exitCode = matrix.summary.releaseStatus === 'blocked' ? 1 : 0
}

export function parseMatrixArgs(argv: string[]): MatrixCliOptions {
  const options: MatrixCliOptions = {
    reportPaths: [],
    requiredTargets: [],
    requiredRuntimeScenarios: []
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true
        break
      case '--report':
        options.reportPaths.push(readValue(argv, ++index, arg))
        break
      case '--reports-dir':
        options.reportsDir = readValue(argv, ++index, arg)
        break
      case '--target':
        options.requiredTargets.push(
          ...normalizeAmneziaHelperArtifactTarget(readValue(argv, ++index, arg))
        )
        break
      case '--all':
        options.requiredTargets.push(...allAmneziaHelperArtifactTargets())
        break
      case '--require-tun':
        options.requiredRuntimeScenarios.push('proxy', 'tun')
        break
      case '--runtime-scenario':
        options.requiredRuntimeScenarios.push(requireRuntimeScenario(readValue(argv, ++index, arg)))
        break
      case '--output':
      case '--output-path':
        options.outputPath = readValue(argv, ++index, arg)
        break
      case '--compact':
        options.compact = true
        break
      default:
        if (arg.startsWith('--')) {
          throw new Error(`Unknown Amnezia helper matrix option: ${arg}`)
        }
        options.reportPaths.push(arg)
    }
  }

  options.requiredTargets = dedupeTargets(options.requiredTargets)
  options.requiredRuntimeScenarios = dedupeRuntimeScenarios(options.requiredRuntimeScenarios)
  return options
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

function dedupeTargets(targets: AmneziaHelperArtifactTarget[]): AmneziaHelperArtifactTarget[] {
  const seen = new Set<string>()
  return targets.filter((target) => {
    const key = `${target.platform}/${target.arch}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function dedupeRuntimeScenarios(
  values: AmneziaHelperVerificationRuntimeScenario[]
): AmneziaHelperVerificationRuntimeScenario[] {
  return Array.from(new Set(values))
}

function requireRuntimeScenario(value: string): AmneziaHelperVerificationRuntimeScenario {
  if (value === 'proxy' || value === 'tun') return value
  throw new Error(`Unsupported runtime scenario: ${value}`)
}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index]
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`)
  }
  return value
}

const helpText = `Koala Clash Amnezia helper compatibility matrix

Usage:
  pnpm amnezia-helper:matrix -- --reports-dir smoke-reports --all
  pnpm amnezia-helper:matrix -- smoke-win64.json smoke-linux64.json --target win32-x64 --target linux-x64

Options:
  --report <path>       Add one smoke JSON report; repeatable
  --reports-dir <path>  Add all .json reports from a directory
  --target <platform[-arch]>
  --all                 Require the full desktop matrix
  --runtime-scenario <proxy|tun>
  --require-tun         Require both proxy and TUN reports for each target
  --output <path>       Write matrix JSON to a file
  --compact             Emit compact JSON

Exit code:
  0 for supported or warning matrices
  1 for blocked matrices
`

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
})
