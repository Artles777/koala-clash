import { lookup } from 'node:dns/promises'
import {
  DirectTunBypassConfig,
  DirectTunBypassLookupResult,
  DirectTunBypassResolution,
  DirectExcludeMode,
  resolveDirectTunBypass
} from '../../core/routing/direct-tun-bypass'

const defaultLookupTimeoutMs = 2500

export async function resolveRuntimeDirectTunBypass<T extends DirectTunBypassConfig>(input: {
  config: T
  enabled: boolean
  mode?: DirectExcludeMode
  lookupTimeoutMs?: number
}): Promise<DirectTunBypassResolution> {
  const lookupTimeoutMs = input.lookupTimeoutMs ?? defaultLookupTimeoutMs
  return resolveDirectTunBypass({
    config: input.config,
    enabled: input.enabled,
    mode: input.mode,
    lookup: (hostname) => lookupWithTimeout(hostname, lookupTimeoutMs)
  })
}

async function lookupWithTimeout(
  hostname: string,
  timeoutMs: number
): Promise<DirectTunBypassLookupResult[]> {
  let timeout: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      lookup(hostname, { all: true, verbatim: true }),
      new Promise<DirectTunBypassLookupResult[]>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`DNS lookup timed out after ${timeoutMs}ms`))
        }, timeoutMs)
      })
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}
