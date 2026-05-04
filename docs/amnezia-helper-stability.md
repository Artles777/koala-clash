# Amnezia Helper Stability Validation

Phase 20 adds an optional stability layer on top of the existing packaged smoke runner. It does not change Mihomo, TUN configuration, helper routing rules, or the helper process manager lifecycle.

## Scenarios

The stability runner produces a structured `stabilityResult` report with these scenarios:

- `repeated_start_stop`: starts and stops the helper repeatedly and checks for stale active state or leaked temp config files.
- `reload_resilience`: starts a ready helper, triggers the configured reload hook, and verifies the helper remains ready with an injected `AMNEZIA_HELPER` target.
- `crash_recovery`: validates failed state cleanup and restart after a crash hook. The default smoke CLI skips this unless a caller supplies a crash hook in code.
- `tun_reload_resilience`: same reload check, but only included when the smoke runtime scenario is TUN.
- `soak`: keeps the helper running and performs periodic connectivity checks for the requested duration.

## Smoke Usage

Run the normal smoke flow:

```bash
pnpm amnezia-helper:smoke -- --packaged-app-path <installed-app> --fixture-profile <profile.json>
```

Run smoke with stability validation:

```bash
pnpm amnezia-helper:smoke -- --packaged-app-path <installed-app> --fixture-profile <profile.json> --stability --stability-cycles 5 --soak-duration-ms 60000 --soak-interval-ms 5000
```

For TUN validation, combine it with the existing TUN scenario:

```bash
pnpm amnezia-helper:smoke -- --tun --packaged-app-path <installed-app> --fixture-profile <profile.json> --stability
```

## Report Fields

Smoke reports and matrix rows now expose:

- `stabilityResult`
- `lifecycleStressPassed`
- `reloadResiliencePassed`
- `recoveryPassed`
- `soakDurationMs`
- `repeatedStartStopCount`
- `staleStateDetected`
- `cleanupLeakDetected`

If a stability scenario fails, the smoke report gets a failed `stability` stage and release readiness is blocked. If crash recovery is skipped because no crash hook is available, release readiness records `recovery_not_validated` as a warning rather than pretending crash recovery was proven.

## Automatic vs Manual

The automated runner can detect repeated lifecycle failures, helper readiness loss after reload, stale routing state after crashes, temp config cleanup leaks, and periodic connectivity failures during a bounded soak.

Manual validation is still required for longer real-world runs, OS sleep/resume behavior, network transitions, security software interference, and production-helper crash scenarios that need an actual backend crash trigger.
