# Amnezia Helper Real Backend Integration

Phase 27d wires Koala Clash to the standalone `amnezia-helper` v1 binary contract.

## Expected Helper Contract

Koala expects a desktop executable named `amnezia-helper` or `amnezia-helper.exe` with these commands:

- `version`
- `run --config <path>`
- `check --config <path>`
- `check-connectivity --config <path> --url <url>`
- `check-connectivity --config <path> --target <host:port>`

The runtime config written by Koala uses helper config `version: 1`, `profile.sourceKind: "self_contained"`, and a local SOCKS5 proxy in `localProxy`. Only `amneziawg` and `wireguard` profiles are startable in this contract.

## Supported Profiles

Supported:

- self-contained AmneziaWG profiles with endpoint, private key, server public key, interface address, and allowed IPs
- self-contained WireGuard profiles with the same WireGuard runtime fields

Unsupported:

- API-only keys
- gateway-expansion profiles
- profiles missing endpoint, key material, interface address, or allowed IPs
- non-WireGuard protocols

Unsupported inputs are blocked before startup where possible and reported with structured diagnostics such as `missing_keys`, `missing_endpoint`, `unsupported_profile_protocol`, or `profile_requires_gateway_expansion`.

## Runtime Readiness

The standalone helper emits JSONL diagnostics on stdout. Koala now parses the real events:

- `config.validated`
- `backend.config_mapped`
- `proxy.listening`
- `readiness.handshake_pending`
- `handshake.observed`
- `helper.ready`
- `connectivity.verified`

For routing, Koala injects the local Mihomo SOCKS5 target after `proxy.listening`, because traffic must be able to reach the helper before a WireGuard handshake can be observed. Handshake and end-to-end traffic validation remain separate diagnostics and support-summary signals.

## Binary Resolution

Development override:

```bash
KOALA_AMNEZIA_HELPER_BACKEND_PATH=/path/to/amnezia-helper pnpm dev
```

Packaged resources:

```text
resources/files/amnezia-helper/<platform>/<arch>/amnezia-helper(.exe)
```

The artifact preparation step also accepts a standalone helper source root where the binary is located at the root, `dist/<platform>/<arch>/`, `dist/<platform>-<arch>/`, `build/<platform>/<arch>/`, or the existing `amnezia-helper/<platform>/<arch>/` layout.

## Autonomous Lifecycle Ownership

Koala owns the helper process in normal product usage. Users should not start `amnezia-helper` manually.

The helper is started automatically when all of these conditions are true:

- the current profile is an Amnezia/VPN profile with helper runtime support
- TUN or proxy mode is enabled, so the runtime can use the helper endpoint
- bundled helper resolution succeeds, or a development override is explicitly configured
- startup preflight passes for backend, profile, production config, endpoint, and TUN bypass safety

The helper is stopped automatically when:

- the app exits
- the active profile changes away from the helper-backed VPN profile
- TUN/proxy runtime mode is disabled
- startup conditions become invalid

Unexpected helper exits are supervised. Koala attempts a bounded restart with exponential backoff, then marks the session as blocked with `crash_loop` diagnostics when the restart budget is exhausted. The session model exposes `desiredState`, `managedByApp`, `restartCount`, `lastExitReason`, `lastRestartAt`, and `crashLoopDetected` for support/debug UI and diagnostics export.

`KOALA_AMNEZIA_HELPER_BACKEND_PATH` remains supported for local development and smoke testing, but diagnostics mark it as a development override. Packaged builds should use the bundled helper path under `resources/files/amnezia-helper/<platform>/<arch>/`.

## Remaining Manual Validation

This integration aligns Koala with the real helper CLI/config/readiness contract. It does not prove that a given production helper artifact and private profile work on every desktop platform. Release confidence still requires packaged smoke runs on Windows, macOS, and Linux with real helper artifacts and real self-contained profiles.
