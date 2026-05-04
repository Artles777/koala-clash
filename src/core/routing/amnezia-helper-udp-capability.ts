export type AmneziaHelperUdpSupport = 'supported' | 'unsupported' | 'unknown'
export type AmneziaHelperUdpReasonCode =
  | 'udp_associate_validated'
  | 'udp_associate_rejected'
  | 'udp_validation_failed'
  | 'udp_validation_timeout'
  | 'udp_not_validated'
  | 'proxy_endpoint_not_ready'
  | 'backend_capability_unknown'
  | 'stub_backend'

export interface AmneziaHelperUdpCapability {
  udpSupport: AmneziaHelperUdpSupport
  udpValidated: boolean
  udpReasonCode: AmneziaHelperUdpReasonCode
  udpExplanation: string
  checkedAt?: number
}

export function createInitialAmneziaHelperUdpCapability(
  backendMode?: 'production' | 'proxy-prototype' | 'stub',
  checkedAt?: number
): AmneziaHelperUdpCapability {
  if (backendMode === 'stub') {
    return createAmneziaHelperUdpCapability('unsupported', false, 'stub_backend', checkedAt)
  }

  return createAmneziaHelperUdpCapability(
    'unknown',
    false,
    backendMode === 'production' || backendMode === 'proxy-prototype'
      ? 'backend_capability_unknown'
      : 'udp_not_validated',
    checkedAt
  )
}

export function createAmneziaHelperUdpCapability(
  udpSupport: AmneziaHelperUdpSupport,
  udpValidated: boolean,
  udpReasonCode: AmneziaHelperUdpReasonCode,
  checkedAt?: number
): AmneziaHelperUdpCapability {
  return {
    udpSupport,
    udpValidated,
    udpReasonCode,
    udpExplanation: explainUdpCapability(udpReasonCode),
    checkedAt
  }
}

export function shouldAdvertiseAmneziaHelperUdp(
  capability: AmneziaHelperUdpCapability | undefined
): boolean {
  return capability?.udpSupport === 'supported' && capability.udpValidated
}

export function explainUdpCapability(reason: AmneziaHelperUdpReasonCode): string {
  switch (reason) {
    case 'udp_associate_validated':
      return 'SOCKS5 UDP ASSOCIATE succeeded against the helper local proxy endpoint.'
    case 'udp_associate_rejected':
      return 'The helper local proxy rejected SOCKS5 UDP ASSOCIATE.'
    case 'udp_validation_failed':
      return 'UDP capability validation failed before UDP support could be confirmed.'
    case 'udp_validation_timeout':
      return 'UDP capability validation timed out before UDP support could be confirmed.'
    case 'proxy_endpoint_not_ready':
      return 'The helper local proxy endpoint is not ready, so UDP support was not validated.'
    case 'backend_capability_unknown':
      return 'The current helper backend contract does not declare UDP support.'
    case 'stub_backend':
      return 'The stub backend does not provide proxy traffic forwarding or UDP support.'
    case 'udp_not_validated':
      return 'UDP support has not been validated yet.'
  }
}
