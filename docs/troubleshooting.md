# Troubleshooting

Use this guide when the app starts but traffic does not route as expected.

## Helper Not Found

What it means: Koala cannot find the bundled `amnezia-helper` binary.

Check:

- packaged builds should contain `resources/files/amnezia-helper/<platform>/<arch>/`;
- development builds can use `KOALA_AMNEZIA_HELPER_BACKEND_PATH`;
- support/debug should show helper source as `Bundled` or `Dev override`.

## Helper Not Ready

What it means: the helper process started, but Koala has not confirmed readiness.

Likely causes:

- invalid or unsupported `vpn://` profile;
- helper binary cannot execute on this platform/arch;
- local proxy failed to bind;
- handshake was not observed;
- connectivity probe failed.

Open profile details/debug and check helper logs, readiness state, and startup
preflight blockers.

## TUN Permission Error

Typical symptoms:

- `operation not permitted`;
- route creation failure;
- app cannot start the TUN listener.

Check:

- macOS service/core permissions were granted for the packaged app path;
- no stale Mihomo process from another build is still running;
- no second VPN/TUN app owns conflicting routes;
- the installed service path matches the app you are launching.

After moving a macOS `.app` to another folder or machine, reinstall core/service
permissions from the same app path.

## UDP Not Validated

Realtime apps may connect but voice/video can be unstable if UDP is unsupported
or only partially validated.

Check:

- support/debug UDP status;
- realtime confidence warnings;
- preset smoke result;
- whether a final `MATCH,VPN / PROXY` rule exists for VPN-owned traffic.

If UDP is unknown or TCP-only, Koala should report that honestly instead of
claiming realtime traffic is fully validated.

## Preset Confidence Is Low Or Medium

Common causes:

- no final catch-all VPN rule;
- only domain rules exist for an app that uses IP media endpoints;
- process rules are fallback-only on the current platform;
- UDP is not end-to-end validated;
- observed IP evidence is missing or stale.

Use `Run preset check`, `Run preset smoke`, and observed IP promotion where
available. Mark a preset as verified only after a real app session works on the
current device/network.

## No Packaged Evidence

This is normal until testers collect evidence from packaged builds.

Local smoke/check evidence helps support the current machine. Packaged evidence
is release evidence and must be generated from real packaged app runs on target
platforms.

## macOS Fallback-Only Confusion

On macOS, `PROCESS-NAME,DIRECT` is not native process split tunneling yet. It can
match traffic inside Mihomo and can use learned observed IPs, but reliable TUN
bypass should use address-based rules where possible.

If a macOS process rule appears to match but traffic still times out, add or
promote stable destination IPs as `IP-CIDR` rules, or route the whole app through
VPN with stronger domain/catch-all coverage.
