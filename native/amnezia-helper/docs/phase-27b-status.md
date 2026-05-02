# Phase 27b Status

## Truly Working

- `run` without `--stub-backend` now attempts the real userspace backend path.
- Helper config is mapped into `amneziawg-go` UAPI:
  - interface private key
  - peer public key
  - optional preshared key
  - endpoint host/port
  - allowed IPs
  - persistent keepalive
  - AmneziaWG fields `Jc/Jmin/Jmax/S1..S4/H1..H4/I1..I5`
- The backend uses `amneziawg-go/tun/netstack`, so it does not create system
  TUN interfaces, routes, or DNS settings.
- A local SOCKS5 listener binds and supports TCP CONNECT through the userspace
  backend dialer.
- JSONL diagnostics distinguish config mapping, backend startup, SOCKS bind,
  ignored fields, handshake pending, handshake observed, and shutdown.
- Phase 27c adds `check-connectivity`, which can prove real TCP and HTTP(S)
  traffic through the helper when a real self-contained profile is available.

## Partially Implemented

- Readiness is conservative. `backend.started` plus `proxy.listening` means the
  process path is up. `helper.ready` is emitted only after `amneziawg-go` reports
  a peer handshake.
- UDP is implemented through SOCKS5 UDP ASSOCIATE and the userspace netstack.
  Koala should still validate the local SOCKS endpoint before advertising UDP in
  Mihomo runtime config.
- SOCKS domain targets require tunnel DNS servers in `profile.interface.dns`.
  If none are present, the helper emits `backend.dns_missing`; IP targets can
  still be dialed through the userspace stack.
- Real traffic has to be validated with a private self-contained profile and a
  reachable AmneziaWG/WireGuard endpoint by running `check-connectivity`.

## Still Missing Before Koala Integration

- End-to-end test against a real AmneziaWG server.
- Confirmation that all imported Koala Amnezia profiles contain the self-contained
  fields this helper requires.
- Real UDP traffic validation against target apps such as Discord voice.
- Packaging/build pipeline for this helper binary across Windows, Linux, and
  macOS.
- Koala-side provider update to call this helper after the standalone binary is
  built and smoke-tested.
