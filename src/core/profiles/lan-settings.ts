type LanConfigShape = {
  'allow-lan'?: unknown
  'lan-allowed-ips'?: string[]
  'lan-disallowed-ips'?: string[]
}

export function configureLanSettings<T extends LanConfigShape>(profile: T): void {
  const partial = profile as Partial<LanConfigShape>
  if (!profile['allow-lan']) {
    delete partial['allow-lan']
    delete partial['lan-allowed-ips']
    delete partial['lan-disallowed-ips']
    return
  }

  const allowedIps = profile['lan-allowed-ips']
  if (allowedIps?.length === 0) {
    delete partial['lan-allowed-ips']
  } else if (allowedIps && !allowedIps.some((ip: string) => ip.startsWith('127.0.0.1/'))) {
    allowedIps.push('127.0.0.1/8')
  }

  if (profile['lan-disallowed-ips']?.length === 0) {
    delete partial['lan-disallowed-ips']
  }
}
