export interface ParsedWireGuardConfig {
  interface: Record<string, string>
  peer: Record<string, string>
}

export interface ParsedEndpoint {
  host: string
  port?: number
}

export function parseWireGuardConfig(input: string): ParsedWireGuardConfig | null {
  const result: ParsedWireGuardConfig = {
    interface: {},
    peer: {}
  }
  let section: 'interface' | 'peer' | undefined

  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || line.startsWith(';')) continue

    const sectionMatch = line.match(/^\[(.+)]$/)
    if (sectionMatch) {
      const sectionName = sectionMatch[1].trim().toLowerCase()
      section = sectionName === 'interface' || sectionName === 'peer' ? sectionName : undefined
      continue
    }

    if (!section) continue

    const separatorIndex = line.indexOf('=')
    if (separatorIndex === -1) continue

    const key = line.slice(0, separatorIndex).trim()
    const value = line.slice(separatorIndex + 1).trim()
    if (key && value) {
      result[section][key] = value
    }
  }

  if (Object.keys(result.interface).length === 0 || Object.keys(result.peer).length === 0) {
    return null
  }

  return result
}

export function parseEndpoint(input: string | undefined): ParsedEndpoint | undefined {
  if (!input) return undefined

  const endpoint = input.trim()
  if (!endpoint) return undefined

  if (endpoint.startsWith('[')) {
    const closeIndex = endpoint.indexOf(']')
    if (closeIndex > 1) {
      const host = endpoint.slice(1, closeIndex)
      const portText = endpoint.slice(closeIndex + 1).replace(/^:/, '')
      const port = parsePort(portText)
      return { host, ...(port ? { port } : {}) }
    }
  }

  const lastColon = endpoint.lastIndexOf(':')
  if (lastColon > -1) {
    const host = endpoint.slice(0, lastColon)
    const port = parsePort(endpoint.slice(lastColon + 1))
    if (host) {
      return { host, ...(port ? { port } : {}) }
    }
  }

  return { host: endpoint }
}

export function splitCsv(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean)
  }
  if (typeof value !== 'string') return []

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function parseOptionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || !value.trim()) return undefined

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parsePort(value: string): number | undefined {
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) return undefined
  return port
}
