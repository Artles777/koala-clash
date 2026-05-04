#!/usr/bin/env node

const fs = require('node:fs')
const net = require('node:net')

function readArg(name) {
  const index = process.argv.indexOf(name)
  if (index === -1) return undefined
  return process.argv[index + 1]
}

function log(message) {
  process.stdout.write(`[amnezia-helper-proxy-backend] ${message}\n`)
}

function fail(message, code = 2) {
  process.stderr.write(`[amnezia-helper-proxy-backend] ${message}\n`)
  process.exit(code)
}

const configPath = readArg('--config')
const profileId = readArg('--profile-id') || 'unknown-profile'
const sessionId = readArg('--session-id') || 'unknown-session'

if (process.argv.includes('--self-check')) {
  log('SELF_CHECK_OK proxy prototype backend is executable')
  process.exit(0)
}

if (!configPath) fail('missing --config')

let config
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
} catch (error) {
  fail(`config read failed: ${error}`, 3)
}

const listenHost = config.localProxy?.host || '127.0.0.1'
const listenPort = Number(config.localProxy?.port)
if (!Number.isInteger(listenPort) || listenPort <= 0) {
  fail(`invalid local proxy port: ${config.localProxy?.port}`, 4)
}

const readyDelayMs = Number(process.env.KOALA_AMNEZIA_HELPER_BACKEND_READY_DELAY_MS || 0)
const crashAfterMs = Number(process.env.KOALA_AMNEZIA_HELPER_BACKEND_CRASH_AFTER_MS || 0)
let server
let stopped = false

function stop(signal) {
  if (stopped) return
  stopped = true
  log(`stop requested signal=${signal}`)
  if (!server) {
    process.exit(0)
    return
  }
  server.close(() => process.exit(0))
}

process.on('SIGINT', () => stop('SIGINT'))
process.on('SIGTERM', () => stop('SIGTERM'))

if (crashAfterMs > 0) {
  setTimeout(() => {
    process.stderr.write('[amnezia-helper-proxy-backend] simulated crash\n')
    process.exit(42)
  }, crashAfterMs)
}

setTimeout(() => {
  server = net.createServer((socket) => {
    socket.once('data', (data) => {
      const request = data.toString('utf-8')
      if (request.startsWith('GET /health')) {
        const body = JSON.stringify({
          ok: true,
          profileId,
          sessionId,
          mode: config.execution?.mode,
          backendMode: config.execution?.backendMode
        })
        socket.end(
          [
            'HTTP/1.1 200 OK',
            'Content-Type: application/json',
            `Content-Length: ${Buffer.byteLength(body)}`,
            'Connection: close',
            '',
            body
          ].join('\r\n')
        )
        return
      }

      const body =
        'Koala Clash Amnezia proxy prototype is listening but tunnel forwarding is not implemented yet.'
      socket.end(
        [
          'HTTP/1.1 501 Not Implemented',
          'Content-Type: text/plain',
          `Content-Length: ${Buffer.byteLength(body)}`,
          'Connection: close',
          '',
          body
        ].join('\r\n')
      )
    })

    socket.setTimeout(1000, () => socket.end())
  })

  server.on('error', (error) => {
    process.stderr.write(`[amnezia-helper-proxy-backend] listen failed: ${error}\n`)
    process.exit(5)
  })

  server.listen(listenPort, listenHost, () => {
    log(
      `READY profile=${profileId} session=${sessionId} localProxy=${listenHost}:${listenPort} remote=${config.remote?.host}:${config.remote?.port}`
    )
  })
}, readyDelayMs)
