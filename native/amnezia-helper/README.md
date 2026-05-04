# amnezia-helper

In-repository helper backend for Koala Clash AmneziaWG/WireGuard support.

This module defines the v1 process contract, validates self-contained
AmneziaWG/WireGuard runtime configs, and provides the production helper binary
used by Koala Clash package builds. Generated binaries are written outside this
source tree under `helper-artifacts/` and are staged into `extra/files/` by the
repository build scripts.

Current status:

- config parsing and validation: present
- diagnostics JSONL contract: present
- readiness/status model: present
- SOCKS5 listener: TCP CONNECT and UDP ASSOCIATE support
- real AmneziaWG backend: first userspace `amneziawg-go` path is wired
- system TUN/routes/DNS ownership: intentionally not implemented
- UDP proxying: implemented through SOCKS5 UDP ASSOCIATE and userspace netstack

See [docs/helper-v1-spec.md](docs/helper-v1-spec.md) for the contract.
See [docs/phase-27b-status.md](docs/phase-27b-status.md) for the current
backend integration status.

## Repository Build

From the Koala Clash repository root:

```sh
pnpm build:amnezia-helper -- --target darwin --arch arm64
pnpm amnezia-helper:prepare -- --target darwin --arch arm64 --self-check
pnpm amnezia-helper:validate -- --target darwin --arch arm64
```

`pnpm amnezia-helper:prepare` builds this Go module automatically unless an
explicit external `--source-root` is provided or `--skip-build` is used.

## Commands

Requires Go `1.24.4` or newer.

```sh
amnezia-helper check --config examples/self-contained-awg.json
amnezia-helper run --config /path/to/real-self-contained-awg.json
amnezia-helper check-connectivity --config /path/to/real-self-contained-awg.json --url https://example.com/
amnezia-helper run --config examples/self-contained-awg.json --stub-backend
```

`examples/self-contained-awg.json` documents the shape only. A real run requires
valid base64 or hex WireGuard keys, a reachable endpoint, and self-contained
AmneziaWG/WireGuard runtime fields.

The first real backend milestone proves that the helper can start
`amneziawg-go` with a userspace netstack and bind a local SOCKS5 proxy. It
emits `readiness.handshake_pending` until a peer handshake is actually observed,
then emits `handshake.observed` and `helper.ready`. SOCKS5 UDP ASSOCIATE is
available for UDP-capable clients. Gateway/API-expanded profiles remain
unsupported in v1.

`check-connectivity` is the first end-to-end traffic proof command. With
`--url`, it starts the real backend, binds SOCKS5, performs a real HTTP(S)
request through the helper endpoint, waits for an observed WireGuard handshake,
and emits `connectivity.verified` only when all required stages pass.
