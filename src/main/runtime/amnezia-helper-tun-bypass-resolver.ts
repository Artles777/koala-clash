import { lookup as dnsLookup } from 'dns/promises'
import net from 'net'
import { AmneziaHelperRuntimeConfig } from '../../core/profiles/amnezia-helper-runtime-config'
import {
  AmneziaHelperTunBypassResolution,
  createAmneziaHelperTunBypassFailed,
  createAmneziaHelperTunBypassNotRequired,
  createAmneziaHelperTunBypassResolved,
  normalizeEndpointHost
} from '../../core/routing/amnezia-helper-tun-bypass'

export interface AmneziaHelperTunBypassResolveInput {
  runtimeConfig: AmneziaHelperRuntimeConfig
  tunEnabled: boolean
  now?: () => number
  lookup?: AmneziaHelperDnsLookup
}

export type AmneziaHelperDnsLookup = (
  host: string
) => Promise<Array<{ address: string; family: number }>>

export async function resolveAmneziaHelperTunBypass(
  input: AmneziaHelperTunBypassResolveInput
): Promise<AmneziaHelperTunBypassResolution> {
  const now = input.now ?? Date.now
  if (!input.tunEnabled) {
    return createAmneziaHelperTunBypassNotRequired('tun disabled', now)
  }

  const endpointHost = normalizeEndpointHost(input.runtimeConfig.remote.host)
  const endpointPort = input.runtimeConfig.remote.port
  if (!endpointHost) {
    return createAmneziaHelperTunBypassFailed({
      endpointPort,
      error: 'Amnezia helper upstream endpoint host is missing',
      now
    })
  }

  if (net.isIP(endpointHost)) {
    return createAmneziaHelperTunBypassResolved({
      endpointHost,
      endpointPort,
      ips: [endpointHost],
      now
    })
  }

  try {
    const lookup = input.lookup ?? defaultLookup
    const addresses = await lookup(endpointHost)
    return createAmneziaHelperTunBypassResolved({
      endpointHost,
      endpointPort,
      ips: addresses.map((entry) => entry.address),
      now
    })
  } catch (error) {
    return createAmneziaHelperTunBypassFailed({
      endpointHost,
      endpointPort,
      error: error instanceof Error ? error.message : String(error),
      warning: `failed to resolve Amnezia helper upstream endpoint: ${endpointHost}`,
      now
    })
  }
}

async function defaultLookup(host: string): Promise<Array<{ address: string; family: number }>> {
  return dnsLookup(host, { all: true })
}
