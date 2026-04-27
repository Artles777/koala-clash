#!/usr/bin/env node

const fs = require('node:fs')

function readArg(name) {
  const index = process.argv.indexOf(name)
  if (index === -1) return undefined
  return process.argv[index + 1]
}

const configPath = readArg('--config')
const profileId = readArg('--profile-id') || 'unknown-profile'
const sessionId = readArg('--session-id') || 'unknown-session'

let timer

function log(message) {
  process.stdout.write(`[amnezia-helper-stub] ${message}\n`)
}

function stop(signal) {
  log(`stop requested signal=${signal}`)
  if (timer) clearInterval(timer)
  setTimeout(() => process.exit(0), 25)
}

process.on('SIGINT', () => stop('SIGINT'))
process.on('SIGTERM', () => stop('SIGTERM'))

if (process.argv.includes('--self-check')) {
  log('SELF_CHECK_OK stub backend is executable')
  process.exit(0)
}

if (!configPath) {
  process.stderr.write('[amnezia-helper-stub] missing --config\n')
  process.exit(2)
}

try {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  log(`started profile=${profileId} session=${sessionId} protocol=${config.protocol}`)
  log(`config=${configPath}`)
} catch (error) {
  process.stderr.write(`[amnezia-helper-stub] config read failed: ${error}\n`)
  process.exit(3)
}

const crashAfterMs = Number(process.env.KOALA_AMNEZIA_HELPER_STUB_CRASH_AFTER_MS || 0)
if (crashAfterMs > 0) {
  setTimeout(() => {
    process.stderr.write('[amnezia-helper-stub] simulated crash\n')
    process.exit(42)
  }, crashAfterMs)
}

let tick = 0
timer = setInterval(() => {
  tick += 1
  log(`heartbeat=${tick}`)
}, 500)
