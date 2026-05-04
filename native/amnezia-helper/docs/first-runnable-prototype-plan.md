# First Runnable Prototype Plan

## Scope

The first runnable prototype should prove that the helper can run a real
AmneziaWG userspace tunnel and expose it through a local SOCKS5 endpoint.

It must not mutate system routes, DNS, firewall, or TUN configuration.

## Steps

1. Add an internal backend package around `github.com/amnezia-vpn/amneziawg-go`. Done in phase 27b.
2. Convert helper config into AmneziaWG UAPI settings. Done in phase 27b:
   - base64 keys to hex
   - endpoint host/port
   - allowed IPs
   - keepalive
   - AWG obfuscation fields
3. Add a userspace network stack bridge suitable for local SOCKS5. Done in phase 27b with `amneziawg-go/tun/netstack`:
   - expose TCP through SOCKS5 CONNECT
   - expose UDP through SOCKS5 UDP ASSOCIATE after runtime validation
4. Replace `--stub-backend` with real backend startup. Done in phase 27b. `--stub-backend` remains explicit dev-only mode.
5. Emit readiness stages. Partially done in phase 27b:
   - proxy bound
   - backend started
   - first handshake observed
   - helper ready only after observed handshake
6. Add shutdown path. Done in phase 27b:
   - close SOCKS listener
   - close backend device
   - remove temp runtime files
7. Add integration tests with a mock backend before requiring a real Amnezia server.
8. Add end-to-end smoke test with a private fixture profile. Phase 27c adds the
   `check-connectivity` command for this.

## First hard blockers

- choosing the userspace stack and proxy bridge
- validating handshake/readiness against a real private endpoint
- validating real AmneziaWG obfuscation fields against an actual endpoint
- packaging a cross-platform helper binary
