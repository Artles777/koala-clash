# Amnezia Helper Real Platform Validation

Phase 22 formalized packaged desktop validation. Phase 26 turns that into a repeatable release-candidate evidence workflow. It does not add routing features, does not change Mihomo, and does not replace the existing smoke or matrix tools.

## Scope

Real validation is evidence collected on the actual target OS and architecture:

| Platform | Architectures  |
| -------- | -------------- |
| Windows  | `x64`, `arm64` |
| Linux    | `x64`, `arm64` |
| macOS    | `x64`, `arm64` |

Each target should produce three reports:

- proxy smoke: startup, readiness, connectivity, routing injection, cleanup
- TUN smoke: helper bypass, TUN runtime injection, DNS/rule diagnostics, connectivity, cleanup
- stability smoke: repeated lifecycle, reload resilience, recovery/soak checks where supported

## Evidence Layout

Use a run id for each release-candidate validation pass. The recommended layout is:

```text
release-evidence/amnezia-helper/<run-id>/
  reports/
    <platform>-<arch>/
      smoke-<platform>-<arch>-proxy.json
      smoke-<platform>-<arch>-tun.json
      smoke-<platform>-<arch>-stability.json
  amnezia-helper-matrix.json
  amnezia-helper-platform-validation-summary.json
  amnezia-helper-platform-validation-issues.json
  RUNBOOK.md
```

The JSON reports may be collected from different target machines, but keep their final names stable. This makes blocker references and support bundles deterministic.

## Prerequisites

- Production helper artifacts are built from `native/amnezia-helper/` and staged
  by `pnpm amnezia-helper:prepare`.
- The packaged app was built for the target OS/arch.
- A private normalized Amnezia profile fixture is available on the target machine.
- The target machine can reach the real Amnezia endpoint used by the private fixture.

Do not commit private fixtures, raw `vpn://` strings, generated helper configs, or private keys.

## Generate A Run Plan

Generate the command plan for all desktop targets:

```bash
pnpm amnezia-helper:platform-validation -- plan \
  --all \
  --evidence-dir release-evidence/amnezia-helper \
  --run-id "<release-build-id>" \
  --packaged-app-path "<packaged-app-path>" \
  --fixture-profile "<private-normalized-profile.json>" \
  --build-id "<release-build-id>" \
  --app-version "<version>" \
  --helper-rule DOMAIN-SUFFIX,example.com \
  --stability-cycles 5 \
  --soak-duration-ms 60000
```

The plan output is JSON and includes:

- per-target smoke commands
- report paths
- aggregation command
- platform validation summary command
- issue package command
- manual command order

Every generated smoke command must be run on the matching target OS and architecture.

For one target:

```bash
pnpm amnezia-helper:platform-validation -- plan \
  --target linux-x64 \
  --evidence-dir release-evidence/amnezia-helper \
  --run-id "<release-build-id>"
```

## Per-Platform Commands

Proxy smoke:

```bash
pnpm amnezia-helper:smoke -- \
  --scenario packaged \
  --packaged-app-path "<packaged-app-path>" \
  --fixture-profile "<private-normalized-profile.json>" \
  --spawn-self-check \
  --build-id "<release-build-id>" \
  --app-version "<version>" \
  --report-path release-evidence/amnezia-helper/<run-id>/reports/<platform>-<arch>/smoke-<platform>-<arch>-proxy.json
```

TUN smoke:

```bash
pnpm amnezia-helper:smoke -- \
  --scenario packaged \
  --tun \
  --dns-enhanced-mode fake-ip \
  --dns-hijack \
  --packaged-app-path "<packaged-app-path>" \
  --fixture-profile "<private-normalized-profile.json>" \
  --spawn-self-check \
  --build-id "<release-build-id>" \
  --app-version "<version>" \
  --report-path release-evidence/amnezia-helper/<run-id>/reports/<platform>-<arch>/smoke-<platform>-<arch>-tun.json
```

Stability smoke:

```bash
pnpm amnezia-helper:smoke -- \
  --scenario packaged \
  --stability \
  --stability-cycles 5 \
  --soak-duration-ms 60000 \
  --soak-interval-ms 5000 \
  --packaged-app-path "<packaged-app-path>" \
  --fixture-profile "<private-normalized-profile.json>" \
  --spawn-self-check \
  --build-id "<release-build-id>" \
  --app-version "<version>" \
  --report-path release-evidence/amnezia-helper/<run-id>/reports/<platform>-<arch>/smoke-<platform>-<arch>-stability.json
```

Run stability after the base proxy smoke. The matrix tool keeps the newest proxy scenario row for a platform, and the stability run contains the same proxy smoke stages plus `stabilityResult`.

## Aggregate Reports

After collecting JSON reports from target machines:

```bash
pnpm amnezia-helper:matrix -- \
  --reports-dir release-evidence/amnezia-helper/<run-id>/reports \
  --all \
  --require-tun \
  --output release-evidence/amnezia-helper/<run-id>/amnezia-helper-matrix.json
```

Then create the phase-22 platform validation summary:

```bash
pnpm amnezia-helper:platform-validation -- summarize \
  --matrix release-evidence/amnezia-helper/<run-id>/amnezia-helper-matrix.json \
  --output release-evidence/amnezia-helper/<run-id>/amnezia-helper-platform-validation-summary.json
```

Finally generate a compact blocker/warning package for issue filing:

```bash
pnpm amnezia-helper:platform-validation -- package \
  --summary release-evidence/amnezia-helper/<run-id>/amnezia-helper-platform-validation-summary.json \
  --reports-dir release-evidence/amnezia-helper/<run-id>/reports \
  --run-id "<run-id>" \
  --output release-evidence/amnezia-helper/<run-id>/amnezia-helper-platform-validation-issues.json
```

The summary contains:

- platform and arch
- build id and app version
- helper checksum and helper version
- proxy/TUN/stability scenario result
- release readiness
- structured blocker/warning issues
- diagnostic code summaries

The issue package contains each blocker/warning with:

- category
- severity
- platform and arch
- scenario (`proxy_smoke`, `tun_smoke`, or `stability`)
- report reference
- short notes
- reproduction hint

## Blocker Criteria

The phase-22 summary is blocked when any required target has:

- missing proxy smoke report
- missing TUN smoke report
- missing stability evidence
- backend/helper artifact resolution failure
- self-check, startup, readiness, connectivity, routing, cleanup, or TUN safety failure
- failed stability, lifecycle, reload, recovery, stale-state, or cleanup-leak checks

Warnings are non-blocking but must be reviewed. Typical warnings include:

- helper version missing
- helper checksum missing
- UDP not validated, so the helper target is TCP-only
- TUN DNS/rule reliability degraded or unlikely
- crash recovery skipped because no production crash hook exists

## Issue Filing

For each blocker, attach:

- the related smoke JSON report
- the aggregated matrix
- the platform validation summary
- the issue package entry
- short reproduction notes from the target OS tester

Do not attach private normalized fixtures, raw `vpn://` keys, generated helper configs, or private keys.

## Manual Boundaries

The tooling cannot replace real target-OS execution. These checks remain manual or environment-specific:

- Windows/macOS signing, notarization, Gatekeeper, SmartScreen, and antivirus behavior
- installer permission preservation and executable bits
- real TUN privilege/service prompts
- network reachability to the real Amnezia endpoint
- long-running sleep/resume and network-transition behavior
- helper behavior under target-specific endpoint security software

A release should retain the raw smoke reports, aggregated matrix, platform validation summary, and issue package for support and auditability.
