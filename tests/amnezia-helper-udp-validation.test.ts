import * as assert from 'node:assert/strict'
import net from 'node:net'
import { afterEach, describe, it } from 'node:test'
import { validateAmneziaHelperUdpCapability } from '../src/main/runtime/amnezia-helper-udp-validation'

let servers: net.Server[] = []

describe('Amnezia helper UDP validation', () => {
  afterEach(async () => {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve())
          })
      )
    )
    servers = []
  })

  it('marks UDP as supported when SOCKS5 UDP ASSOCIATE succeeds', async () => {
    const port = await startSocksServer(0x00)
    const result = await validateAmneziaHelperUdpCapability({
      profileId: 'profile-1',
      endpoint: { host: '127.0.0.1', port, protocol: 'socks5' },
      timeoutMs: 500,
      now: () => 1710000000000
    })

    assert.equal(result.udpSupport, 'supported')
    assert.equal(result.udpValidated, true)
    assert.equal(result.udpReasonCode, 'udp_associate_validated')
  })

  it('marks UDP as unsupported when SOCKS5 UDP ASSOCIATE is rejected', async () => {
    const port = await startSocksServer(0x07)
    const result = await validateAmneziaHelperUdpCapability({
      profileId: 'profile-1',
      endpoint: { host: '127.0.0.1', port, protocol: 'socks5' },
      timeoutMs: 500,
      now: () => 1710000000000
    })

    assert.equal(result.udpSupport, 'unsupported')
    assert.equal(result.udpValidated, false)
    assert.equal(result.udpReasonCode, 'udp_associate_rejected')
  })
})

async function startSocksServer(udpReplyCode: number): Promise<number> {
  const server = net.createServer((socket) => {
    let step: 'greeting' | 'udp' = 'greeting'
    socket.on('data', () => {
      if (step === 'greeting') {
        step = 'udp'
        socket.write(Buffer.from([0x05, 0x00]))
        return
      }
      socket.write(
        Buffer.from([
          0x05,
          udpReplyCode,
          0x00,
          0x01,
          0x7f,
          0x00,
          0x00,
          0x01,
          0x00,
          0x00
        ])
      )
    })
  })
  servers.push(server)

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('SOCKS test server did not listen')
  return address.port
}
