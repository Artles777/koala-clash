import { VlessDraft, VlessSecurity, VlessTransportType } from './types'

export interface VlessProfileMetadata {
  host: string
  port: number
  transport: VlessTransportType
  security: VlessSecurity
  packetEncoding?: string
  flow?: string
  serverName?: string
}

export function createVlessProfileMetadata(draft: VlessDraft): VlessProfileMetadata {
  return {
    host: draft.server.host,
    port: draft.server.port,
    transport: draft.transport.type,
    security: draft.security,
    packetEncoding: draft.packetEncoding,
    flow: draft.flow,
    serverName: draft.reality?.serverName ?? draft.tls?.serverName
  }
}

export function formatVlessProfileSummary(metadata: VlessProfileMetadata): string {
  return `${metadata.host}:${metadata.port} · ${formatVlessMode(metadata)}`
}

export function formatVlessMode(metadata: Pick<VlessProfileMetadata, 'transport' | 'security'>): string {
  return `${metadata.transport}/${metadata.security}`
}
