import net from 'net'
import { AmneziaHelperLocalEndpoint } from '../../core/profiles/amnezia-helper-runtime-config'
import {
  AmneziaHelperUdpCapability,
  createAmneziaHelperUdpCapability
} from '../../core/routing/amnezia-helper-udp-capability'

export interface ValidateAmneziaHelperUdpCapabilityInput {
  profileId: string
  endpoint: AmneziaHelperLocalEndpoint
  timeoutMs?: number
  now?: () => number
}

class UdpCapabilityValidationError extends Error {
  readonly reason: Parameters<typeof createAmneziaHelperUdpCapability>[2]

  constructor(reason: Parameters<typeof createAmneziaHelperUdpCapability>[2], message: string) {
    super(message)
    this.name = 'UdpCapabilityValidationError'
    this.reason = reason
  }
}

const defaultTimeoutMs = 3000
const socketReadBuffers = new WeakMap<net.Socket, Buffer>()

export async function validateAmneziaHelperUdpCapability(
  input: ValidateAmneziaHelperUdpCapabilityInput
): Promise<AmneziaHelperUdpCapability> {
  const now = input.now ?? Date.now
  const checkedAt = now()
  const timeoutMs = input.timeoutMs ?? defaultTimeoutMs

  if (!input.endpoint.host || !input.endpoint.port) {
    return createAmneziaHelperUdpCapability(
      'unknown',
      false,
      'proxy_endpoint_not_ready',
      checkedAt
    )
  }

  let socket: net.Socket | undefined
  try {
    socket = await connectToEndpoint(input.endpoint, timeoutMs)
    await performSocks5Greeting(socket, timeoutMs)
    await performSocks5UdpAssociate(socket, timeoutMs)
    return createAmneziaHelperUdpCapability(
      'supported',
      true,
      'udp_associate_validated',
      checkedAt
    )
  } catch (error) {
    if (error instanceof UdpCapabilityValidationError) {
      return createAmneziaHelperUdpCapability(
        error.reason === 'udp_associate_rejected' ? 'unsupported' : 'unknown',
        false,
        error.reason,
        checkedAt
      )
    }

    return createAmneziaHelperUdpCapability(
      'unknown',
      false,
      'udp_validation_failed',
      checkedAt
    )
  } finally {
    socket?.end()
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
      reject(new UdpCapabilityValidationError('udp_validation_timeout', 'UDP validation timed out'))
    }
    const onError = (error: Error): void => {
      cleanup()
      socket.destroy()
      reject(
        new UdpCapabilityValidationError(
          'udp_validation_failed',
          `UDP validation endpoint connect failed: ${error.message}`
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
  const reply = await readBytes(socket, 2, timeoutMs)
  if (reply[0] !== 0x05 || reply[1] !== 0x00) {
    throw new UdpCapabilityValidationError(
      'udp_validation_failed',
      `SOCKS5 greeting failed during UDP validation: ${reply.toString('hex')}`
    )
  }
}

async function performSocks5UdpAssociate(socket: net.Socket, timeoutMs: number): Promise<void> {
  await writeSocket(
    socket,
    Buffer.from([0x05, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
  )
  const header = await readBytes(socket, 4, timeoutMs)
  if (header[0] !== 0x05) {
    throw new UdpCapabilityValidationError(
      'udp_validation_failed',
      `SOCKS5 UDP ASSOCIATE returned invalid version: ${header.toString('hex')}`
    )
  }
  if (header[1] !== 0x00) {
    throw new UdpCapabilityValidationError(
      'udp_associate_rejected',
      `SOCKS5 UDP ASSOCIATE failed with code ${header[1]}`
    )
  }

  await drainSocks5Address(socket, header[3], timeoutMs)
}

async function drainSocks5Address(
  socket: net.Socket,
  atyp: number,
  timeoutMs: number
): Promise<void> {
  if (atyp === 0x01) {
    await readBytes(socket, 4 + 2, timeoutMs)
    return
  }
  if (atyp === 0x04) {
    await readBytes(socket, 16 + 2, timeoutMs)
    return
  }
  if (atyp === 0x03) {
    const length = await readBytes(socket, 1, timeoutMs)
    await readBytes(socket, length[0] + 2, timeoutMs)
    return
  }

  throw new UdpCapabilityValidationError(
    'udp_validation_failed',
    `SOCKS5 UDP ASSOCIATE returned unsupported address type: ${atyp}`
  )
}

async function writeSocket(socket: net.Socket, data: Buffer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    socket.write(data, (error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

async function readBytes(socket: net.Socket, byteLength: number, timeoutMs: number): Promise<Buffer> {
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
      setBufferedSocketData(socket, buffer.subarray(byteLength))
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
      reject(new UdpCapabilityValidationError('udp_validation_failed', 'Connection closed'))
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new UdpCapabilityValidationError('udp_validation_timeout', 'UDP validation timed out'))
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
