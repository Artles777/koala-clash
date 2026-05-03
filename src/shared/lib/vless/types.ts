export type VlessSecurity = 'none' | 'tls' | 'reality'
export type VlessTransportType = 'tcp' | 'ws' | 'grpc' | 'httpupgrade' | 'xhttp'
export type VlessEncryption = 'none'
export type VlessFlow = 'xtls-rprx-vision' | 'xtls-rprx-vision-udp443'
export type VlessPacketEncoding = 'packetaddr' | 'xudp'
export type VlessXhttpMode = 'auto' | 'stream-one' | 'stream-up' | 'packet-up'

export interface VlessServerDraft {
  host: string
  port: number
}

export interface VlessTlsDraft {
  serverName?: string
  alpn?: string[]
  fingerprint?: string
  insecure?: boolean
}

export interface VlessRealityDraft {
  serverName: string
  publicKey: string
  shortId?: string
  fingerprint?: string
  spiderX?: string
}

export type VlessTransportDraft =
  | {
      type: 'tcp'
    }
  | {
      type: 'ws'
      path?: string
      host?: string
    }
  | {
      type: 'grpc'
      serviceName?: string
      authority?: string
    }
  | {
      type: 'httpupgrade'
      path?: string
      host?: string
    }
  | {
      type: 'xhttp'
      path?: string
      host?: string
      mode?: VlessXhttpMode
    }

export interface VlessDraft {
  protocol: 'vless'
  raw: string
  name?: string
  uuid: string
  server: VlessServerDraft
  encryption: VlessEncryption
  packetEncoding?: VlessPacketEncoding
  flow?: VlessFlow
  security: VlessSecurity
  transport: VlessTransportDraft
  tls?: VlessTlsDraft
  reality?: VlessRealityDraft
}

export type VlessParseErrorCode =
  | 'invalid_uri'
  | 'invalid_scheme'
  | 'missing_uuid'
  | 'invalid_uuid'
  | 'missing_host'
  | 'invalid_host'
  | 'missing_port'
  | 'invalid_port'
  | 'unsupported_encryption'
  | 'unsupported_packet_encoding'
  | 'unsupported_security'
  | 'unsupported_transport'
  | 'unsupported_transport_param'
  | 'unsupported_security_param'
  | 'unsupported_security_transport'
  | 'unsupported_flow'
  | 'unsupported_xhttp_mode'
  | 'unsupported_insecure_value'
  | 'unsupported_param'
  | 'missing_reality_public_key'
  | 'missing_reality_server_name'

export interface VlessParseError {
  code: VlessParseErrorCode
  path: string
  message: string
  value?: string
}

export type VlessUriParseResult =
  | {
      ok: true
      draft: VlessDraft
    }
  | {
      ok: false
      raw: string
      errors: VlessParseError[]
    }
