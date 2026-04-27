# Amnezia Helper Platform Matrix

Phase 13 turns per-platform packaged smoke reports into a release compatibility matrix. It does not change Mihomo, helper runtime ownership, routing rules, or the UI.

## Required Inputs

Each shipped desktop target needs:

- a real production helper artifact staged by `pnpm amnezia-helper:prepare`
- a packaged Koala Clash build for that platform and architecture
- a private normalized Amnezia profile fixture for real connectivity validation
- a JSON smoke report generated on the target OS

Target matrix:

| Platform | Arch           |
| -------- | -------------- |
| Windows  | `x64`, `arm64` |
| Linux    | `x64`, `arm64` |
| macOS    | `x64`, `arm64` |

## Per-Platform Smoke Command

Run this on the target OS after installing or unpacking the packaged app:

```bash
pnpm amnezia-helper:smoke -- \
  --packaged-app-path <installed-app> \
  --fixture-profile <private-normalized-profile.json> \
  --spawn-self-check \
  --build-id <release-build-id> \
  --app-version <version> \
  --report-path smoke-<platform>-<arch>.json
```

The report includes build id, app version, helper checksum, helper version when available from the helper manifest, startup/readiness/connectivity/routing/cleanup stages, diagnostics, warnings, and blockers.

## Aggregation

Aggregate reports into a release matrix:

```bash
pnpm amnezia-helper:matrix -- \
  --reports-dir smoke-reports \
  --all \
  --output amnezia-helper-matrix.json
```

For a smaller release subset:

```bash
pnpm amnezia-helper:matrix -- \
  --report smoke-linux-x64.json \
  --target linux-x64
```

The matrix command exits with code `1` only when the matrix is `blocked`. A `warning` matrix exits with code `0` but must be reviewed before release.

Phase 22 adds a stricter real-platform summary on top of this matrix:

```bash
pnpm amnezia-helper:platform-validation -- summarize \
  --matrix amnezia-helper-matrix.json \
  --output amnezia-helper-platform-validation-summary.json
```

That summary groups proxy, TUN, and stability evidence by platform/arch and emits structured blocker/warning issues for support and release tracking.

## Release Status

`supported` means every required target has:

- packaged production helper
- helper checksum
- helper version from manifest
- self-check passed
- startup passed
- readiness passed
- connectivity passed
- `AMNEZIA_HELPER` routing target injected
- cleanup passed
- private normalized fixture was used

`warning` means there are no hard failures, but the evidence is incomplete. Examples:

- helper version is missing
- helper checksum is missing
- self-check was skipped
- default smoke fixture was used
- backend was not production
- smoke was not run from a packaged app

`blocked` means release should stop. Examples:

- target report is missing
- backend resolution failed
- startup failed
- local endpoint readiness failed
- connectivity failed
- routing target was not injected
- cleanup failed

## Manual Responsibilities

The tooling can aggregate and gate reports, but it cannot prove these items without running on the target OS:

- Windows/macOS security prompts and signing behavior
- installer permissions and executable bits after install
- antivirus or endpoint security interference
- real Amnezia network reachability from the target environment
- production helper behavior with real credentials

Release readiness requires a `supported` matrix for the shipped targets and retained per-platform smoke reports for audit/debugging.
