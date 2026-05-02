# Profile Support Matrix

## Supported in v1

| Profile source | Protocol | State | Notes |
| --- | --- | --- | --- |
| self-contained `vpn://` decoded to embedded config | AmneziaWG | first userspace runtime wired | Requires valid keys, endpoint, interface address, allowed IPs, and optional AWG fields. Exposes SOCKS5 TCP and UDP ASSOCIATE. |
| self-contained WireGuard native config normalized by Koala | WireGuard | first userspace runtime wired | Same runtime shape, without AWG obfuscation fields. Exposes SOCKS5 TCP and UDP ASSOCIATE. |

## Explicitly rejected in v1

| Profile source | Reason | Diagnostic code |
| --- | --- | --- |
| API-only Amnezia premium/trial key | Needs gateway/API expansion before local runtime can start. | `profile_requires_gateway_expansion` |
| `vpn://` without embedded containers / protocol config | No local runtime fields are available. | `profile_requires_gateway_expansion` |
| OpenVPN / Cloak / Shadowsocks / Xray / IKEv2 | Out of scope for first helper. | `unsupported_profile_type` |
| Any profile requiring system route/DNS ownership inside helper | Koala/Mihomo own routing; helper exposes only local proxy. | `unsupported_profile_type` |

## Required self-contained fields

| Field | Amnezia source equivalent |
| --- | --- |
| `profile.keys.privateKey` | `client_priv_key` |
| `profile.keys.serverPublicKey` | `server_pub_key` |
| `profile.keys.presharedKey` | `psk_key` |
| `profile.endpoint.host` | `hostName` from `*_config_data` or top-level server config |
| `profile.endpoint.port` | `port` |
| `profile.interface.addresses` | `client_ip` |
| `profile.interface.mtu` | `mtu` |
| `profile.interface.dns` | DNS server list when available |
| `profile.peer.allowedIPs` | `allowed_ips` |
| `profile.peer.persistentKeepalive` | `persistent_keep_alive` |
| `profile.amnezia.*` | `Jc/Jmin/Jmax/S1..S4/H1..H4/I1..I5` |

## Local proxy capabilities

| Field | Behavior |
| --- | --- |
| `localProxy.udp = true` | SOCKS5 UDP ASSOCIATE is supported through the userspace netstack. Koala must validate it before advertising UDP to Mihomo. |

## Runtime readiness caveat

The helper emits `backend.started` and `proxy.listening` once the userspace
device and SOCKS5 listener are up. It emits `helper.ready` only after
`amneziawg-go` reports a peer handshake. Until then the honest state is
`readiness.handshake_pending`.
