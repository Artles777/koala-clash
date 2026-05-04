import { writeFile } from 'node:fs/promises'
import {
  AmneziaHelperVerificationReport,
  RunAmneziaHelperVerificationOptions,
  runAmneziaHelperVerification
} from '../src/main/runtime/amnezia-helper-verification'
import { AmneziaHelperBackendMode } from '../src/core/profiles/amnezia-helper-runtime-config'
import { createAmneziaHelperRule } from '../src/core/routing/amnezia-helper-rules'

interface SmokeCliOptions extends RunAmneziaHelperVerificationOptions {
  compact?: boolean
  reportPath?: string
  help?: boolean
}

async function main(): Promise<void> {
  const options = parseSmokeArgs(process.argv.slice(2))
  if (options.help) {
    console.log(helpText)
    return
  }

  const report = await runAmneziaHelperVerification(options)
  const json = stringifyReport(report, options.compact)

  if (options.reportPath) {
    await writeFile(options.reportPath, `${json}\n`, 'utf-8')
  }

  console.log(json)
  process.exitCode = report.summary.status === 'passed' ? 0 : 1
}

export function parseSmokeArgs(argv: string[]): SmokeCliOptions {
  const options: SmokeCliOptions = {
    backendMode: parseBackendMode(process.env.KOALA_AMNEZIA_HELPER_BACKEND_MODE),
    backendPath: process.env.KOALA_AMNEZIA_HELPER_BACKEND_PATH,
    resourcesFilesDir: process.env.KOALA_AMNEZIA_HELPER_RESOURCES_FILES_DIR,
    buildId: process.env.KOALA_BUILD_ID,
    appVersion: process.env.KOALA_APP_VERSION
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true
        break
      case '--resolve-only':
        options.resolveOnly = true
        break
      case '--spawn-self-check':
      case '--self-check':
        options.spawnSelfCheck = true
        break
      case '--stability':
        options.runStability = true
        break
      case '--stability-cycles':
        options.runStability = true
        options.stabilityCycles = readNumber(readValue(argv, ++index, arg), arg)
        break
      case '--soak-duration-ms':
        options.runStability = true
        options.stabilitySoakDurationMs = readNumber(readValue(argv, ++index, arg), arg)
        break
      case '--soak-interval-ms':
        options.runStability = true
        options.stabilitySoakIntervalMs = readNumber(readValue(argv, ++index, arg), arg)
        break
      case '--compact':
        options.compact = true
        break
      case '--backend-mode':
        options.backendMode = requireBackendMode(readValue(argv, ++index, arg))
        break
      case '--build-id':
        options.buildId = readValue(argv, ++index, arg)
        break
      case '--app-version':
        options.appVersion = readValue(argv, ++index, arg)
        break
      case '--scenario':
        options.scenario = requireScenario(readValue(argv, ++index, arg))
        break
      case '--runtime-scenario':
        options.runtimeScenario = requireRuntimeScenario(readValue(argv, ++index, arg))
        options.tunEnabled = options.runtimeScenario === 'tun'
        break
      case '--tun':
      case '--tun-scenario':
        options.runtimeScenario = 'tun'
        options.tunEnabled = true
        break
      case '--helper-rule':
        options.helperRules = [
          ...(options.helperRules ?? []),
          parseHelperRule(readValue(argv, ++index, arg), options.helperRules?.length ?? 0)
        ]
        break
      case '--dns-enhanced-mode':
        options.dnsEnhancedMode = readValue(argv, ++index, arg)
        break
      case '--dns-hijack':
        options.dnsHijackEnabled = true
        break
      case '--no-dns-hijack':
        options.dnsHijackEnabled = false
        break
      case '--dns-enabled':
        options.dnsEnabled = true
        break
      case '--dns-disabled':
        options.dnsEnabled = false
        break
      case '--backend-path':
      case '--helper-path':
        options.backendPath = readValue(argv, ++index, arg)
        break
      case '--resources-files-dir':
        options.resourcesFilesDir = readValue(argv, ++index, arg)
        break
      case '--packaged-app-path':
        options.packagedAppPath = readValue(argv, ++index, arg)
        break
      case '--runtime-dir':
        options.runtimeDir = readValue(argv, ++index, arg)
        break
      case '--fixture-profile':
        options.fixtureProfilePath = readValue(argv, ++index, arg)
        break
      case '--report-path':
        options.reportPath = readValue(argv, ++index, arg)
        break
      case '--self-check-timeout-ms':
        options.selfCheckTimeoutMs = readNumber(readValue(argv, ++index, arg), arg)
        break
      case '--readiness-timeout-ms':
        options.readinessTimeoutMs = readNumber(readValue(argv, ++index, arg), arg)
        break
      case '--connectivity-timeout-ms':
        options.connectivityTimeoutMs = readNumber(readValue(argv, ++index, arg), arg)
        break
      case '--connectivity-host':
        options.connectivityTarget = {
          ...options.connectivityTarget,
          host: readValue(argv, ++index, arg)
        }
        break
      case '--connectivity-port':
        options.connectivityTarget = {
          ...options.connectivityTarget,
          port: readNumber(readValue(argv, ++index, arg), arg)
        }
        break
      case '--connectivity-path':
        options.connectivityTarget = {
          ...options.connectivityTarget,
          path: readValue(argv, ++index, arg)
        }
        break
      default:
        throw new Error(`Unknown Amnezia helper smoke option: ${arg}`)
    }
  }

  return options
}

function stringifyReport(report: AmneziaHelperVerificationReport, compact?: boolean): string {
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

function parseBackendMode(value: string | undefined): AmneziaHelperBackendMode {
  if (value === 'production' || value === 'proxy-prototype' || value === 'stub') return value
  return 'production'
}

function requireBackendMode(value: string): AmneziaHelperBackendMode {
  if (value === 'production' || value === 'proxy-prototype' || value === 'stub') return value
  throw new Error(`Unsupported backend mode: ${value}`)
}

function requireScenario(value: string): RunAmneziaHelperVerificationOptions['scenario'] {
  if (
    value === 'packaged' ||
    value === 'override' ||
    value === 'prototype' ||
    value === 'stub' ||
    value === 'resources'
  ) {
    return value
  }
  throw new Error(`Unsupported smoke scenario: ${value}`)
}

function requireRuntimeScenario(
  value: string
): RunAmneziaHelperVerificationOptions['runtimeScenario'] {
  if (value === 'proxy' || value === 'tun') return value
  throw new Error(`Unsupported runtime scenario: ${value}`)
}

function parseHelperRule(value: string, index: number): ReturnType<typeof createAmneziaHelperRule> {
  const [type, ...rest] = value.split(',')
  const ruleValue = rest.join(',').trim()
  if (
    type !== 'DOMAIN' &&
    type !== 'DOMAIN-SUFFIX' &&
    type !== 'DOMAIN-KEYWORD' &&
    type !== 'IP-CIDR'
  ) {
    throw new Error(`Unsupported helper rule type: ${type}`)
  }

  return createAmneziaHelperRule({
    id: `smoke-helper-rule-${index + 1}`,
    type,
    value: ruleValue,
    now: Date.now()
  })
}

const helpText = `Koala Clash Amnezia helper packaged smoke verification

Usage:
  pnpm amnezia-helper:smoke [options]

Options:
  --backend-mode production|proxy-prototype|stub
  --build-id <id>                   Build id included in the JSON report
  --app-version <version>           App version included in the JSON report
  --scenario <name>                 packaged|override|prototype|stub|resources
  --runtime-scenario proxy|tun       Select proxy or TUN validation mode
  --tun                              Run the TUN-enabled validation scenario
  --helper-rule <TYPE,value>         Add helper rule for runtime injection validation
  --dns-enhanced-mode <mode>         TUN DNS mode for rule reliability diagnostics
  --dns-hijack                       Mark TUN DNS hijack as enabled for diagnostics
  --no-dns-hijack                    Mark TUN DNS hijack as disabled for diagnostics
  --dns-enabled                      Mark Mihomo DNS as enabled for diagnostics
  --dns-disabled                     Mark Mihomo DNS as disabled for diagnostics
  --backend-path <path>              Override production helper executable path
  --resources-files-dir <path>       Use a specific resources/files directory
  --packaged-app-path <path>         Derive resources/files from a packaged app path
  --fixture-profile <path>           Load a normalized profile JSON fixture
  --runtime-dir <path>               Keep runtime temp files under a known directory
  --resolve-only                     Stop after backend resolution and executable validation
  --spawn-self-check                 Run helper self-check before startup
  --stability                        Run lifecycle/reload/recovery/soak validation after smoke
  --stability-cycles <n>             Repeated start/stop iterations for stability validation
  --soak-duration-ms <ms>            Duration for periodic helper connectivity checks
  --soak-interval-ms <ms>            Interval between soak connectivity checks
  --connectivity-host <host>         Upstream host for SOCKS5 validation
  --connectivity-port <port>         Upstream port for SOCKS5 validation
  --connectivity-path <path>         HTTP path for upstream validation
  --readiness-timeout-ms <ms>
  --connectivity-timeout-ms <ms>
  --self-check-timeout-ms <ms>
  --report-path <path>               Also write JSON report to a file
  --compact                          Emit compact JSON
`

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
})
