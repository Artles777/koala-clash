import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import net from 'node:net'
import {
  runAmneziaHelperConnectivityValidation,
  AmneziaHelperConnectivityResult
} from '../src/main/runtime/amnezia-helper-connectivity'

let cleanupTasks: Array<() => Promise<void>> = []

describe('Amnezia helper connectivity validation', () => {
  afterEach(async () => {
    const tasks = cleanupTasks
    cleanupTasks = []
    await Promise.all(tasks.map((task) => task()))
  })

  it('verifies TCP endpoint, SOCKS5 handshake, and upstream HTTP request', async () => {
    const proxy = await createFakeSocks5Proxy()
    const result = await validateAgainst(proxy.port)

    assert.equal(result.status, 'verified')
    assert.equal(result.validationStage, 'upstream_request')
    assert.deepEqual(
      result.stages.map((stage) => `${stage.stage}:${stage.status}`),
      ['tcp_connect:passed', 'socks5_handshake:passed', 'upstream_request:passed']
    )
    assert.equal(result.diagnostic, undefined)
  })

  it('classifies endpoint unreachable failures', async () => {
    const port = await allocateUnusedPort()
    const result = await validateAgainst(port, { timeoutMs: 100 })

    assertFailure(result, 'tcp_connect', 'endpoint_unreachable')
  })

  it('classifies SOCKS5 handshake failures separately from TCP readiness', async () => {
    const server = await createInvalidProxyServer()
    const result = await validateAgainst(server.port, { timeoutMs: 200 })

    assert.equal(result.stages[0].status, 'passed')
    assertFailure(result, 'socks5_handshake', 'proxy_handshake_failure')
  })

  it('classifies upstream request failures after a valid SOCKS5 greeting', async () => {
    const proxy = await createFakeSocks5Proxy({ rejectConnect: true })
    const result = await validateAgainst(proxy.port, { timeoutMs: 200 })

    assert.equal(result.stages[0].status, 'passed')
    assert.equal(result.stages[1].status, 'passed')
    assertFailure(result, 'upstream_request', 'upstream_request_failure')
  })

  it('classifies validation timeouts', async () => {
    const server = await createStallingServer()
    const result = await validateAgainst(server.port, { timeoutMs: 50 })

    assertFailure(result, 'socks5_handshake', 'validation_timeout')
  })
})

async function validateAgainst(
  port: number,
  options: { timeoutMs?: number } = {}
): Promise<AmneziaHelperConnectivityResult> {
  return runAmneziaHelperConnectivityValidation({
    profileId: 'amnezia-1',
    endpoint: {
      host: '127.0.0.1',
      port,
      protocol: 'socks5'
    },
    target: {
      host: 'example.test',
      port: 80,
      path: '/'
    },
    timeoutMs: options.timeoutMs ?? 500
  })
}

function assertFailure(
  result: AmneziaHelperConnectivityResult,
  stage: string,
  category: string
): void {
  assert.equal(result.status, 'failed')
  assert.equal(result.validationStage, stage)
  assert.equal(result.diagnostic?.category, category)
}

async function createFakeSocks5Proxy(
  options: { rejectConnect?: boolean } = {}
): Promise<{ port: number }> {
  const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0)
    let state: 'greeting' | 'connect' | 'http' = 'greeting'

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk])

      if (state === 'greeting' && buffer.length >= 3) {
        buffer = buffer.subarray(3)
        socket.write(Buffer.from([0x05, 0x00]))
        state = 'connect'
      }

      if (state === 'connect') {
        const requestLength = getSocks5ConnectRequestLength(buffer)
        if (!requestLength) return
        buffer = buffer.subarray(requestLength)
        socket.write(
          Buffer.from([0x05, options.rejectConnect ? 0x05 : 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0])
        )
        if (options.rejectConnect) {
          socket.end()
          return
        }
        state = 'http'
      }

      if (state === 'http' && buffer.includes('\r\n\r\n')) {
        socket.end('HTTP/1.1 204 No Content\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')
      }
    })
  })

  return listen(server)
}

async function createInvalidProxyServer(): Promise<{ port: number }> {
  const server = net.createServer((socket) => {
    socket.once('data', () => {
      socket.end('HTTP/1.1 501 Not Implemented\r\nContent-Length: 0\r\n\r\n')
    })
  })

  return listen(server)
}

async function createStallingServer(): Promise<{ port: number }> {
  const server = net.createServer(() => undefined)
  return listen(server)
}

async function listen(server: net.Server): Promise<{ port: number }> {
  const sockets = new Set<net.Socket>()
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
  })

  const port = await new Promise<number>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address && typeof address === 'object') resolve(address.port)
      else reject(new Error('Failed to start test server'))
    })
  })

  cleanupTasks.push(
    () =>
      new Promise<void>((resolve) => {
        sockets.forEach((socket) => socket.destroy())
        server.close(() => resolve())
      })
  )

  return { port }
}

async function allocateUnusedPort(): Promise<number> {
  const server = net.createServer()
  const { port } = await listen(server)
  await cleanupTasks.pop()?.()
  return port
}

function getSocks5ConnectRequestLength(buffer: Buffer): number | undefined {
  if (buffer.length < 5) return undefined
  const atyp = buffer[3]
  if (atyp === 0x01) return buffer.length >= 10 ? 10 : undefined
  if (atyp === 0x04) return buffer.length >= 22 ? 22 : undefined
  if (atyp !== 0x03) return undefined

  const hostLength = buffer[4]
  const requestLength = 5 + hostLength + 2
  return buffer.length >= requestLength ? requestLength : undefined
}
