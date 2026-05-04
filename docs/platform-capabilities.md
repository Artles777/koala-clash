# Platform Capabilities

Koala Clash supports the same user-facing rules on desktop platforms, but true
TUN bypass behavior differs by operating system.

## Linux

Linux has the strongest current native process bypass path.

- Address-based `DIRECT` excludes work through runtime TUN exclusions.
- Learned process-to-IP bypass can add observed process destination IPs.
- Native `PROCESS-NAME,DIRECT` can reach `true_bypass` when Linux prerequisites
  are active.
- The Linux native path uses cgroup v2, nftables/fwmark, and policy routing.

Expect `PROCESS-NAME,DIRECT` to work best on Linux after native bypass
prerequisites and privileges are satisfied.

## Windows

Windows native process bypass depends on a privileged service/controller data
plane.

- Address-based `DIRECT` excludes remain available.
- Learned process-to-IP bypass can still help after destinations are observed.
- `PROCESS-NAME,DIRECT` only becomes `true_bypass` if the Windows native service
  and dataplane report active.
- Without the service/dataplane, Windows falls back to learned bypass or normal
  Mihomo `DIRECT`.

Support/debug status reports whether the controller/service exists, whether
admin privileges are available, and whether the dataplane is active.

## macOS

macOS is fallback-first in the current architecture.

- Address-based `DIRECT` excludes are the most predictable bypass mechanism.
- Learned process-to-IP bypass can add observed destination IPs as runtime TUN
  exclusions.
- `PROCESS-NAME,DIRECT` is not true native process bypass on macOS yet.
- A native macOS control-plane scaffold exists, but it does not claim an active
  dataplane.

For macOS, prefer `IP-CIDR`, exact `DOMAIN`, or promoted observed IP rules when
you need reliable TUN bypass. Treat process rules as helpful matching signals,
not guaranteed OS-level split tunneling.

## Quick Matrix

| Capability                   | Linux                        | Windows                    | macOS         |
| ---------------------------- | ---------------------------- | -------------------------- | ------------- |
| `IP-CIDR,DIRECT` TUN exclude | Supported                    | Supported                  | Supported     |
| `DOMAIN,DIRECT` TUN exclude  | Resolved IPs                 | Resolved IPs               | Resolved IPs  |
| `DOMAIN-SUFFIX,DIRECT`       | Partial                      | Partial                    | Partial       |
| Learned process-to-IP bypass | Supported                    | Supported                  | Supported     |
| Native `PROCESS-NAME,DIRECT` | Available with prerequisites | Requires service/dataplane | Fallback-only |

See [DIRECT Exclude Compatibility](./direct-tun-bypass-compatibility.md) and
[Native Process Bypass Capabilities](./native-process-bypass-capabilities.md)
for implementation-level details.
