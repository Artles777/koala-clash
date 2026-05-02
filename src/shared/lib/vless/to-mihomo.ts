import { stringify } from 'yaml'
import { VlessDraft } from './types'

export interface VlessMihomoProfile {
  proxyName: string
  groupName: string
  config: {
    proxies: VlessMihomoProxy[]
    'proxy-groups': VlessMihomoProxyGroup[]
    rules: string[]
  }
}

export type VlessMihomoProxy = Record<string, unknown>

export interface VlessMihomoProxyGroup {
  name: string
  type: 'select'
  proxies: string[]
}

const reservedProxyNames = new Set(['DIRECT', 'REJECT', 'GLOBAL'])

export function createVlessMihomoProfile(draft: VlessDraft): VlessMihomoProfile {
  const proxyName = createVlessProxyName(draft)
  const groupName = proxyName === 'Proxy' ? 'Proxy Group' : 'Proxy'
  const proxy: VlessMihomoProxy = {
    name: proxyName,
    type: 'vless',
    server: draft.server.host,
    port: draft.server.port,
    uuid: draft.uuid,
    udp: true,
    encryption: draft.encryption,
    network: draft.transport.type === 'httpupgrade' ? 'ws' : draft.transport.type
  }

  if (draft.packetEncoding) proxy['packet-encoding'] = draft.packetEncoding
  if (draft.flow) proxy.flow = draft.flow

  if (draft.security === 'tls' || draft.security === 'reality') {
    proxy.tls = true
  }

  if (draft.tls) {
    if (draft.tls.serverName) proxy.servername = draft.tls.serverName
    if (draft.tls.alpn?.length) proxy.alpn = draft.tls.alpn
    if (draft.tls.fingerprint) proxy['client-fingerprint'] = draft.tls.fingerprint
    if (typeof draft.tls.insecure === 'boolean') proxy['skip-cert-verify'] = draft.tls.insecure
  }

  if (draft.reality) {
    proxy.servername = draft.reality.serverName
    if (draft.reality.fingerprint) proxy['client-fingerprint'] = draft.reality.fingerprint
    proxy['reality-opts'] = {
      'public-key': draft.reality.publicKey,
      ...(draft.reality.shortId ? { 'short-id': draft.reality.shortId } : {})
    }
  }

  if (draft.transport.type === 'ws' || draft.transport.type === 'httpupgrade') {
    proxy['ws-opts'] = {
      ...(draft.transport.path ? { path: draft.transport.path } : {}),
      ...(draft.transport.host ? { headers: { Host: draft.transport.host } } : {}),
      ...(draft.transport.type === 'httpupgrade' ? { 'v2ray-http-upgrade': true } : {})
    }
  }

  if (draft.transport.type === 'grpc') {
    proxy['grpc-opts'] = {
      ...(draft.transport.serviceName ? { 'grpc-service-name': draft.transport.serviceName } : {}),
      ...(draft.transport.authority ? { authority: draft.transport.authority } : {})
    }
  }

  if (draft.transport.type === 'xhttp') {
    proxy['xhttp-opts'] = {
      ...(draft.transport.path ? { path: draft.transport.path } : {}),
      ...(draft.transport.host ? { host: draft.transport.host } : {}),
      ...(draft.transport.mode ? { mode: draft.transport.mode } : {})
    }
  }

  return {
    proxyName,
    groupName,
    config: {
      proxies: [proxy],
      'proxy-groups': [
        {
          name: groupName,
          type: 'select',
          proxies: [proxyName, 'DIRECT']
        }
      ],
      rules: [`MATCH,${groupName}`]
    }
  }
}

export function createVlessMihomoYaml(draft: VlessDraft): string {
  return stringify(createVlessMihomoProfile(draft).config)
}

export function createVlessDisplayName(draft: VlessDraft): string {
  return createVlessProxyName(draft)
}

function createVlessProxyName(draft: VlessDraft): string {
  const fallback = `VLESS ${draft.server.host}:${draft.server.port}`
  const cleanName = sanitizeMihomoName(draft.name || fallback) || fallback
  if (reservedProxyNames.has(cleanName.toUpperCase())) {
    return `${cleanName} VLESS`
  }
  return cleanName
}

function sanitizeMihomoName(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 96)
}
