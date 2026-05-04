export interface AmneziaTunRuntimeCompatibilityResult<T extends Partial<MihomoConfig>> {
  config: T
  applied: boolean
  changes: AmneziaTunRuntimeCompatibilityChange[]
}

export type AmneziaTunRuntimeCompatibilityChange =
  | 'tun_dns_hijack_added'
  | 'dns_enabled'
  | 'dns_enhanced_mode_added'
  | 'dns_fake_ip_range_added'
  | 'dns_nameserver_added'
  | 'dns_default_nameserver_added'
  | 'dns_ipv6_disabled'
  | 'sniffer_enabled'
  | 'sniffer_dns_mapping_enabled'
  | 'sniffer_parse_pure_ip_enabled'
  | 'sniffer_protocols_added'
  | 'tun_ipv6_address_disabled'

const defaultDnsHijack = ['any:53']
const defaultDnsNameservers = ['https://1.1.1.1/dns-query', 'https://8.8.8.8/dns-query']
const defaultDnsBootstrapNameservers = ['tls://1.1.1.1']
const defaultFakeIpRange = '198.18.0.1/16'

export function ensureAmneziaTunRuntimeCompatibility<T extends Partial<MihomoConfig>>(
  config: T
): AmneziaTunRuntimeCompatibilityResult<T> {
  if (config.tun?.enable !== true) {
    return { config, applied: false, changes: [] }
  }

  const changes: AmneziaTunRuntimeCompatibilityChange[] = []
  const nextConfig = { ...config } as T
  const ipv6Disabled = config.ipv6 === false

  const tun = { ...(config.tun ?? {}) } as MihomoTunConfig
  if (!hasNonEmptyStringArray(tun['dns-hijack'])) {
    tun['dns-hijack'] = [...defaultDnsHijack]
    changes.push('tun_dns_hijack_added')
  }
  if (
    ipv6Disabled &&
    (!Array.isArray(tun['inet6-address']) || tun['inet6-address'].length > 0)
  ) {
    tun['inet6-address'] = []
    changes.push('tun_ipv6_address_disabled')
  }
  nextConfig.tun = tun as T['tun']

  const dns = { ...(config.dns ?? {}) } as MihomoDNSConfig
  if (dns.enable !== true) {
    dns.enable = true
    changes.push('dns_enabled')
  }
  if (typeof dns['enhanced-mode'] !== 'string' || dns['enhanced-mode'].trim() === '') {
    dns['enhanced-mode'] = 'fake-ip'
    changes.push('dns_enhanced_mode_added')
  }
  if (typeof dns['fake-ip-range'] !== 'string' || dns['fake-ip-range'].trim() === '') {
    dns['fake-ip-range'] = defaultFakeIpRange
    changes.push('dns_fake_ip_range_added')
  }
  if (!hasNonEmptyStringArray(dns.nameserver)) {
    dns.nameserver = [...defaultDnsNameservers]
    changes.push('dns_nameserver_added')
  }
  if (!hasNonEmptyStringArray(dns['default-nameserver'])) {
    dns['default-nameserver'] = [...defaultDnsBootstrapNameservers]
    changes.push('dns_default_nameserver_added')
  }
  if (ipv6Disabled && dns.ipv6 !== false) {
    dns.ipv6 = false
    changes.push('dns_ipv6_disabled')
  }
  nextConfig.dns = dns as T['dns']

  const sniffer = { ...(config.sniffer ?? {}) } as MihomoSnifferConfig
  if (sniffer.enable !== true) {
    sniffer.enable = true
    changes.push('sniffer_enabled')
  }
  if (sniffer['force-dns-mapping'] !== true) {
    sniffer['force-dns-mapping'] = true
    changes.push('sniffer_dns_mapping_enabled')
  }
  if (sniffer['parse-pure-ip'] !== true) {
    sniffer['parse-pure-ip'] = true
    changes.push('sniffer_parse_pure_ip_enabled')
  }
  if (!sniffer.sniff || typeof sniffer.sniff !== 'object') {
    sniffer.sniff = {
      HTTP: {
        ports: [80, 443],
        'override-destination': false
      },
      TLS: {
        ports: [443]
      }
    }
    changes.push('sniffer_protocols_added')
  }
  nextConfig.sniffer = sniffer as T['sniffer']

  return {
    config: nextConfig,
    applied: changes.length > 0,
    changes
  }
}

function hasNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.some((entry) => typeof entry === 'string' && entry.trim())
}
