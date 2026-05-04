# Amnezia Helper Readiness Summary

Phase 21 adds a compact readiness summary on top of the existing support diagnostics bundle. It does not change Mihomo, helper execution, TUN routing, or rule injection.

## Inputs

The summary is computed from app-owned diagnostics only:

- helper backend resolution and executable validation
- helper session state, readiness, routing target, and connectivity result
- TUN bypass state and DNS/rule reliability
- UDP capability and whether runtime advertises UDP
- helper rule pack counts, without raw rule values
- release readiness statuses
- optional stability smoke result, when supplied

If no stability result is available in the app session, stability is reported as `unknown` and the summary recommends running packaged smoke with `--stability`.

## Severity Precedence

The summary is conservative:

- `blocked`: any blocker in helper startup, backend validation, TUN safety, DNS rule safety, connectivity, or stability.
- `unknown`: no blocker, but helper readiness cannot be proven yet, for example the helper is not running.
- `ready_with_warnings`: helper is usable but at least one advisory signal remains, such as TCP-only UDP mode or missing stability validation.
- `ready`: helper is running, validated, no decisive blockers or advisory warnings are present, and stability is known to have passed.

## UI and Export

The Amnezia details/debug view now shows:

- aggregated readiness
- helper, TUN, DNS/rule, UDP, stability, and release components
- top issues
- recommended next actions
- a copy action for `summaryExport`

The copied summary is intentionally support-safe. It excludes raw `vpn://` sources, private keys, generated helper config, helper logs, raw helper rule values, and temp config paths.

## Remaining Manual Checks

The readiness summary explains the current app-owned state. It does not prove OS sleep/resume behavior, security software behavior, real production helper crashes, or target-platform packaged execution unless paired with platform smoke reports.
