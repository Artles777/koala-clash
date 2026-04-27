# Amnezia Helper Desktop Verification

Phase 11 adds a repeatable packaged smoke workflow for the desktop helper path. It does not replace Mihomo, does not enable TUN/system routing, and does not change the helper lifecycle model.

## Target Matrix

Run the smoke verification on every packaged desktop build:

| Platform | Arch       | Expected helper location                                               |
| -------- | ---------- | ---------------------------------------------------------------------- |
| Windows  | x64, arm64 | `resources/files/amnezia-helper/win32/<arch>/amnezia-helper.exe`       |
| Linux    | x64, arm64 | `resources/files/amnezia-helper/linux/<arch>/amnezia-helper`           |
| macOS    | x64, arm64 | `Contents/Resources/files/amnezia-helper/darwin/<arch>/amnezia-helper` |

Development and CI jobs may override the helper with `KOALA_AMNEZIA_HELPER_BACKEND_PATH` or `--backend-path`.

## Command

```bash
pnpm amnezia-helper:smoke -- --packaged-app-path <path-to-installed-app> --spawn-self-check --report-path smoke-report.json
```

Useful variants:

```bash
pnpm amnezia-helper:smoke -- --resolve-only --packaged-app-path <path-to-installed-app>
pnpm amnezia-helper:smoke -- --backend-path <helper-binary> --spawn-self-check
pnpm amnezia-helper:smoke -- --backend-mode proxy-prototype --spawn-self-check
```

The tool emits JSON to stdout and optionally writes the same report to `--report-path`.
For release aggregation, pass `--build-id` and `--app-version` so the matrix can tie smoke results to a packaged build.

## Fixture Strategy

The default fixture is a normalized AmneziaWG profile with fake key material and a non-real remote endpoint. It is safe to commit and sufficient for:

- config generation
- helper process startup
- local proxy readiness
- cleanup

For end-to-end production traffic validation, pass a real normalized fixture with:

```bash
pnpm amnezia-helper:smoke -- --fixture-profile fixtures/private/amnezia-profile.json
```

Private fixtures must not be committed. They should contain a normalized profile shape, not a raw `vpn://` key.

## Report Stages

The JSON report records:

- `backend_resolution`: packaged/override path resolution and executable validation
- `self_check`: optional helper `self-check` command
- `startup`: helper process creation and config generation
- `readiness`: local proxy endpoint readiness
- `connectivity`: TCP, SOCKS5 handshake, upstream HTTP request through the proxy, plus UDP capability classification
- `routing_injection`: current `AMNEZIA_HELPER` routing target state
- `cleanup`: helper stop and temp config cleanup

Common failure codes include:

- `missing`
- `permission_denied`
- `unsupported_platform`
- `unsupported_arch`
- `arch_mismatch`
- `startup_failed`
- `endpoint_unreachable`
- `proxy_handshake_failure`
- `upstream_request_failure`
- `validation_timeout`

## What Is Automatic

The smoke tool can automatically verify helper binary discovery, executable validation, process startup, local endpoint readiness, proxy-level connectivity, routing target injection state, and cleanup.

Phase 20 adds an optional stability pass:

```bash
pnpm amnezia-helper:smoke -- --packaged-app-path <path-to-installed-app> --fixture-profile <profile.json> --stability
```

This appends a `stability` stage with repeated lifecycle, reload resilience, optional crash recovery, TUN reload, and soak diagnostics. See `docs/amnezia-helper-stability.md` for the scenario details.

## What Remains Manual

Release readiness still requires platform-specific packaged builds with real helper artifacts. Manual checks must confirm:

- helper binaries are signed/notarized where required, especially macOS and Windows
- installer packaging preserves executable permissions
- antivirus or OS security prompts do not block startup
- the real helper can reach a real Amnezia endpoint from the target network
- logs and diagnostics are acceptable for support without exposing secrets

A release should be blocked if any target platform cannot produce a passing smoke report with a real production helper and a private valid fixture.

## Matrix Aggregation

Phase 13 adds matrix aggregation for per-platform smoke reports:

```bash
pnpm amnezia-helper:matrix -- --reports-dir smoke-reports --all --output amnezia-helper-matrix.json
```

The matrix classifies each target as `supported`, `warning`, or `blocked`. See `docs/amnezia-helper-platform-matrix.md` for the release-gating criteria.
