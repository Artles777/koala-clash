import net from 'net'
import { AmneziaHelperLocalEndpoint } from '../../core/profiles/amnezia-helper-runtime-config'

export type AmneziaHelperConnectivityStatus = 'unknown' | 'checking' | 'verified' | 'failed'
export type AmneziaHelperValidationStage =
  | 'not_started'
  | 'tcp_connect'
  | 'socks5_handshake'
  | 'upstream_request'

export type AmneziaHelperDiagnosticCategory =
  | 'backend_unavailable'
  | 'backend_permission_denied'
  | 'backend_not_executable'
  | 'backend_spawn_failure'
  | 'unsupported_platform'
  | 'unsupported_arch'
  | 'backend_arch_mismatch'
  | 'config_generation_failure'
  | 'tun_bypass_resolution_failure'
  | 'startup_timeout'
  | 'endpoint_unreachable'
  | 'proxy_handshake_failure'
  | 'upstream_request_failure'
  | 'validation_timeout'

export interface AmneziaHelperRuntimeDiagnostic {
  category: AmneziaHelperDiagnosticCategory
  stage: string
  message: string
  at: number
  details?: Record<string, string | number | boolean>
}

export interface AmneziaHelperConnectivityStageResult {
  stage: AmneziaHelperValidationStage
  status: 'passed' | 'failed' | 'skipped'
  durationMs?: number
  message?: string
}

export interface AmneziaHelperConnectivityResult {
  profileId: string
  status: Exclude<AmneziaHelperConnectivityStatus, 'checking'>
  validationStage: AmneziaHelperValidationStage
  checkedAt: number
  durationMs: number
  latencyMs?: number
  endpoint: AmneziaHelperLocalEndpoint
  stages: AmneziaHelperConnectivityStageResult[]
  diagnostic?: AmneziaHelperRuntimeDiagnostic
}

export interface AmneziaHelperConnectivityTarget {
  host: string
  port: number
  path: string
}

export interface ValidateAmneziaHelperConnectivityInput {
  profileId: string
  endpoint: AmneziaHelperLocalEndpoint
  timeoutMs?: number
  target?: Partial<AmneziaHelperConnectivityTarget>
  now?: () => number
}

class ConnectivityValidationError extends Error {
  readonly category: AmneziaHelperDiagnosticCategory

  constructor(category: AmneziaHelperDiagnosticCategory, message: string) {
    super(message)
    this.name = 'ConnectivityValidationError'
    this.category = category
  }
}

const defaultTimeoutMs = 5000
const defaultTarget: AmneziaHelperConnectivityTarget = {
  host: 'example.com',
  port: 80,
  path: '/'
}
const socketReadBuffers = new WeakMap<net.Socket, Buffer>()

export async function runAmneziaHelperConnectivityValidation(
  input: ValidateAmneziaHelperConnectivityInput
): Promise<AmneziaHelperConnectivityResult> {
  const now = input.now ?? Date.now
  const timeoutMs = input.timeoutMs ?? defaultTimeoutMs
  const checkedAt = now()
  const stages: AmneziaHelperConnectivityStageResult[] = []
  const target: AmneziaHelperConnectivityTarget = {
    ...defaultTarget,
    ...input.target
  }

  let latencyMs: number | undefined
  const runStage = async (
    stage: AmneziaHelperValidationStage,
    action: () => Promise<void>
  ): Promise<void> => {
    const startedAt = now()
    try {
      await action()
      const durationMs = now() - startedAt
      if (stage === 'tcp_connect') latencyMs = durationMs
      stages.push({
        stage,
        status: 'passed',
        durationMs
      })
    } catch (error) {
      const durationMs = now() - startedAt
      stages.push({
        stage,
        status: 'failed',
        durationMs,
        message: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }

  try {
    await runStage('tcp_connect', async () => {
      const socket = await connectToEndpoint(input.endpoint, timeoutMs)
      socket.end()
    })

    await runStage('socks5_handshake', async () => {
      const socket = await connectToEndpoint(input.endpoint, timeoutMs)
      try {
        await performSocks5Greeting(socket, timeoutMs)
      } finally {
        socket.end()
      }
    })

    await runStage('upstream_request', async () => {
      const socket = await connectToEndpoint(input.endpoint, timeoutMs)
      try {
        await performSocks5Greeting(socket, timeoutMs)
        await performSocks5Connect(socket, target, timeoutMs)
        await performHttpRequest(socket, target, timeoutMs)
      } finally {
        socket.end()
      }
    })

    return {
      profileId: input.profileId,
      status: 'verified',
      validationStage: 'upstream_request',
      checkedAt,
      durationMs: now() - checkedAt,
      latencyMs,
      endpoint: { ...input.endpoint },
      stages
    }
  } catch (error) {
    const validationError =
      error instanceof ConnectivityValidationError
        ? error
        : new ConnectivityValidationError(
            'upstream_request_failure',
            error instanceof Error ? error.message : String(error)
          )
    const failedStage = stages.find((stage) => stage.status === 'failed')?.stage ?? 'not_started'

    return {
      profileId: input.profileId,
      status: 'failed',
      validationStage: failedStage,
      checkedAt,
      durationMs: now() - checkedAt,
      latencyMs,
      endpoint: { ...input.endpoint },
      stages,
      diagnostic: createAmneziaHelperDiagnostic(
        validationError.category,
        failedStage,
        validationError.message,
        now()
      )
    }
  }
}

export function createAmneziaHelperDiagnostic(
  category: AmneziaHelperDiagnosticCategory,
  stage: string,
  message: string,
  at: number,
  details?: Record<string, string | number | boolean>
): AmneziaHelperRuntimeDiagnostic {
  return {
    category,
    stage,
    message,
    at,
    details
  }
}

async function connectToEndpoint(
  endpoint: AmneziaHelperLocalEndpoint,
  timeoutMs: number
): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({
      host: endpoint.host,
      port: endpoint.port
    })
    const cleanup = (): void => {
      socket.removeListener('connect', onConnect)
      socket.removeListener('timeout', onTimeout)
      socket.removeListener('error', onError)
    }
    const onConnect = (): void => {
      cleanup()
      resolve(socket)
    }
    const onTimeout = (): void => {
      cleanup()
      socket.destroy()
      reject(
        new ConnectivityValidationError(
          'validation_timeout',
          `Timed out connecting to local proxy ${endpoint.host}:${endpoint.port}`
        )
      )
    }
    const onError = (error: Error): void => {
      cleanup()
      socket.destroy()
      reject(
        new ConnectivityValidationError(
          'endpoint_unreachable',
          `Local proxy endpoint is unreachable: ${error.message}`
        )
      )
    }

    socket.setTimeout(timeoutMs)
    socket.once('connect', onConnect)
    socket.once('timeout', onTimeout)
    socket.once('error', onError)
  })
}

async function performSocks5Greeting(socket: net.Socket, timeoutMs: number): Promise<void> {
  await writeSocket(socket, Buffer.from([0x05, 0x01, 0x00]))
  const reply = await readBytes(socket, 2, timeoutMs, 'socks5_handshake')
  if (reply[0] !== 0x05 || reply[1] !== 0x00) {
    throw new ConnectivityValidationError(
      'proxy_handshake_failure',
      `SOCKS5 greeting failed with reply ${reply.toString('hex')}`
    )
  }
}

async function performSocks5Connect(
  socket: net.Socket,
  target: AmneziaHelperConnectivityTarget,
  timeoutMs: number
): Promise<void> {
  const host = Buffer.from(target.host, 'utf-8')
  if (host.length > 255) {
    throw new ConnectivityValidationError(
      'upstream_request_failure',
      `Connectivity target host is too long: ${target.host}`
    )
  }

  const port = Buffer.alloc(2)
  port.writeUInt16BE(target.port)
  await writeSocket(
    socket,
    Buffer.concat([Buffer.from([0x05, 0x01, 0x00, 0x03, host.length]), host, port])
  )

  const header = await readBytes(socket, 4, timeoutMs, 'upstream_request')
  if (header[0] !== 0x05) {
    throw new ConnectivityValidationError(
      'proxy_handshake_failure',
      `SOCKS5 connect returned an invalid version: ${header.toString('hex')}`
    )
  }
  if (header[1] !== 0x00) {
    throw new ConnectivityValidationError(
      'upstream_request_failure',
      `SOCKS5 upstream connect failed with code ${header[1]}`
    )
  }

  await drainSocks5Address(socket, header[3], timeoutMs)
}

async function performHttpRequest(
  socket: net.Socket,
  target: AmneziaHelperConnectivityTarget,
  timeoutMs: number
): Promise<void> {
  await writeSocket(
    socket,
    [
      `GET ${target.path} HTTP/1.1`,
      `Host: ${target.host}`,
      'User-Agent: Koala-Clash-Amnezia-Connectivity-Validator',
      'Connection: close',
      '',
      ''
    ].join('\r\n')
  )

  const responseHead = await readUntil(socket, '\r\n', 1024, timeoutMs, 'upstream_request')
  if (!responseHead.startsWith('HTTP/')) {
    throw new ConnectivityValidationError(
      'upstream_request_failure',
      `Upstream response is not HTTP: ${responseHead.slice(0, 64)}`
    )
  }
}

async function drainSocks5Address(
  socket: net.Socket,
  atyp: number,
  timeoutMs: number
): Promise<void> {
  if (atyp === 0x01) {
    await readBytes(socket, 4 + 2, timeoutMs, 'upstream_request')
    return
  }
  if (atyp === 0x04) {
    await readBytes(socket, 16 + 2, timeoutMs, 'upstream_request')
    return
  }
  if (atyp === 0x03) {
    const length = await readBytes(socket, 1, timeoutMs, 'upstream_request')
    await readBytes(socket, length[0] + 2, timeoutMs, 'upstream_request')
    return
  }

  throw new ConnectivityValidationError(
    'proxy_handshake_failure',
    `SOCKS5 connect returned an unsupported address type: ${atyp}`
  )
}

async function writeSocket(socket: net.Socket, data: Buffer | string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    socket.write(data, (error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

async function readBytes(
  socket: net.Socket,
  byteLength: number,
  timeoutMs: number,
  stage: AmneziaHelperValidationStage
): Promise<Buffer> {
  const buffered = socketReadBuffers.get(socket)
  if (buffered && buffered.length >= byteLength) {
    const result = buffered.subarray(0, byteLength)
    setBufferedSocketData(socket, buffered.subarray(byteLength))
    return result
  }

  const chunks: Buffer[] = buffered ? [buffered] : []
  let total = buffered?.length ?? 0
  socketReadBuffers.delete(socket)

  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      clearTimeout(timer)
      socket.removeListener('data', onData)
      socket.removeListener('error', onError)
      socket.removeListener('end', onEnd)
      socket.removeListener('close', onEnd)
    }
    const complete = (): void => {
      cleanup()
      const buffer = Buffer.concat(chunks, total)
      const result = buffer.subarray(0, byteLength)
      const rest = buffer.subarray(byteLength)
      setBufferedSocketData(socket, rest)
      resolve(result)
    }
    const onData = (chunk: Buffer): void => {
      chunks.push(chunk)
      total += chunk.length
      if (total >= byteLength) complete()
    }
    const onError = (error: Error): void => {
      cleanup()
      reject(error)
    }
    const onEnd = (): void => {
      cleanup()
      reject(
        new ConnectivityValidationError(
          stage === 'socks5_handshake' ? 'proxy_handshake_failure' : 'upstream_request_failure',
          `Connection closed during ${stage}`
        )
      )
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new ConnectivityValidationError('validation_timeout', `Timed out during ${stage}`))
    }, timeoutMs)

    socket.on('data', onData)
    socket.once('error', onError)
    socket.once('end', onEnd)
    socket.once('close', onEnd)
  })
}

async function readUntil(
  socket: net.Socket,
  delimiter: string,
  maxBytes: number,
  timeoutMs: number,
  stage: AmneziaHelperValidationStage
): Promise<string> {
  const buffered = socketReadBuffers.get(socket)
  if (buffered) {
    const delimiterIndex = buffered.indexOf(delimiter)
    if (delimiterIndex >= 0) {
      const end = delimiterIndex + delimiter.length
      const result = buffered.subarray(0, end).toString('utf-8')
      setBufferedSocketData(socket, buffered.subarray(end))
      return result
    }
    if (buffered.length > maxBytes) {
      throw new ConnectivityValidationError(
        'upstream_request_failure',
        `Response exceeded ${maxBytes} bytes before ${delimiter}`
      )
    }
  }

  const chunks: Buffer[] = buffered ? [buffered] : []
  let total = buffered?.length ?? 0
  socketReadBuffers.delete(socket)

  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      clearTimeout(timer)
      socket.removeListener('data', onData)
      socket.removeListener('error', onError)
      socket.removeListener('end', onEnd)
      socket.removeListener('close', onEnd)
    }
    const finish = (buffer: Buffer, delimiterIndex: number): void => {
      cleanup()
      const end = delimiterIndex + delimiter.length
      const result = buffer.subarray(0, end).toString('utf-8')
      const rest = buffer.subarray(end)
      setBufferedSocketData(socket, rest)
      resolve(result)
    }
    const onData = (chunk: Buffer): void => {
      chunks.push(chunk)
      total += chunk.length
      const buffer = Buffer.concat(chunks, total)
      const delimiterIndex = buffer.indexOf(delimiter)
      if (delimiterIndex >= 0) {
        finish(buffer, delimiterIndex)
        return
      }
      if (total > maxBytes) {
        cleanup()
        reject(
          new ConnectivityValidationError(
            'upstream_request_failure',
            `Response exceeded ${maxBytes} bytes before ${delimiter}`
          )
        )
      }
    }
    const onError = (error: Error): void => {
      cleanup()
      reject(error)
    }
    const onEnd = (): void => {
      cleanup()
      reject(
        new ConnectivityValidationError(
          'upstream_request_failure',
          `Connection closed during ${stage}`
        )
      )
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new ConnectivityValidationError('validation_timeout', `Timed out during ${stage}`))
    }, timeoutMs)

    socket.on('data', onData)
    socket.once('error', onError)
    socket.once('end', onEnd)
    socket.once('close', onEnd)
  })
}

function setBufferedSocketData(socket: net.Socket, data: Buffer): void {
  if (data.length > 0) socketReadBuffers.set(socket, data)
  else socketReadBuffers.delete(socket)
}
