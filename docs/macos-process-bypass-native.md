# macOS Native Process Bypass Feasibility and Scaffold

## Feasibility Result

True `PROCESS-NAME,DIRECT` bypass on macOS is feasible only as a native Apple Network Extension /
System Extension data plane. It is high-risk and not incremental in the current Koala architecture.

The current Koala path must remain fallback-only until a signed native component can prove
`dataPlaneActive: true`.

## Current Koala Integration Points

Current code already has the right boundary:

- `src/main/runtime/native-process-bypass.ts` returns `macos_fallback_only`.
- `src/core/routing/bypass-capabilities.ts` classifies macOS `PROCESS-NAME,DIRECT` as learned or
  direct-only unless a native capability is active.
- `src/core/routing/learned-process-bypass.ts` provides best-effort learned IP exclusions.
- `src/core/routing/direct-tun-bypass.ts` handles address-backed DIRECT exclusions.
- support/debug data surfaces fallback state through `macos_native_bypass_fallback_only`.

Nothing in this phase should make Koala claim macOS `true_bypass`.

## Provider Choice

The scaffold chooses `NETransparentProxyProvider` as the first realistic direction.

Why:

- macOS route exclusions are address-based, not process-name based;
- `pf` and routes do not provide a safe app-owned exact `PROCESS-NAME` bypass primitive;
- `NETransparentProxyProvider` is flow-oriented and can be packaged as a System Extension;
- a future provider can decide per flow whether to handle it or let the system handle it;
- `NEPacketTunnelProvider` would mean redesigning TUN ownership and competing with Mihomo TUN.

`NEAppProxyProvider` is close, but it is app-rule oriented and less suitable as a transparent
system-wide companion to the existing Mihomo TUN architecture. It remains a fallback candidate if
Transparent Proxy provider policy cannot map Koala's requirements cleanly.

## Native Scaffold

Files live under:

```text
native/macos-process-bypass/
```

Key files:

- `contract.json`: controller/status contract.
- `Package.swift`: Swift package skeleton.
- `Sources/KoalaMacProcessBypassController/main.swift`: controller CLI scaffold.
- `Sources/KoalaMacProcessBypassProvider/TransparentProxyProvider.swift`: safe provider skeleton.
- `Resources/HostApp.entitlements`: host app entitlement template.
- `Resources/Provider.entitlements`: provider entitlement template.
- `Resources/Provider-Info.plist`: extension bundle metadata template.

The scaffold returns `dataPlaneActive: false` by design.

## Koala Control-Plane Integration

Koala now has status-level integration for this scaffold:

- it can detect `koala-macos-process-bypassctl`;
- it can parse `status`, `apply`, and `cleanup` JSON output;
- support/debug snapshots expose controller availability, entitlement state, extension install state,
  user approval state, `dataPlaneActive`, `fallbackOnly`, and reason code;
- macOS remains fallback-only unless a future controller returns `dataPlaneActive: true` and
  `fallbackOnly: false`.

This is intentionally not a runtime enablement of native bypass. The current Swift scaffold returns
`dataPlaneActive: false`, so Koala continues to use learned process-to-IP bypass or address-based
DIRECT excludes on macOS.

## Required Apple Components

A real implementation needs:

- Apple Developer provisioning profile with Network Extension capability approved;
- host app entitlement `com.apple.developer.system-extension.install`;
- provider entitlement `com.apple.developer.networking.networkextension`;
- entitlement value `app-proxy-provider-systemextension`;
- System Extension packaging and installation;
- signed and notarized macOS build;
- user approval for System Extension activation;
- IPC between Koala and the controller/provider;
- reliable cleanup and deactivation on profile switch/app quit.

Official Apple references:

- Network Extension framework:
  https://developer.apple.com/documentation/networkextension
- Network Extension entitlement:
  https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.networking.networkextension
- System Extension install entitlement:
  https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.system-extension.install

## Controller Contract

The planned Koala-facing CLI mirrors the Windows service/controller pattern:

```bash
koala-macos-process-bypassctl status --json
koala-macos-process-bypassctl apply --session <id> --json --process-name <exact-process-name>
koala-macos-process-bypassctl cleanup --session <id> --json
```

Required JSON fields:

- `ok`
- `available`
- `entitlementsPresent`
- `extensionInstalled`
- `userApprovalRequired`
- `dataPlaneActive`
- `fallbackOnly`
- `activeSessionId`
- `reasonCode`
- `message`
- `diagnostics`
- `appliedProcessNames`
- `provider`
- `providerBundleIdentifier`

Important reason codes:

- `macos_entitlements_missing`
- `macos_extension_not_installed`
- `macos_user_approval_required`
- `macos_data_plane_pending`
- `macos_data_plane_active`
- `macos_apply_failed`
- `macos_cleanup_failed`
- `macos_cleanup_complete`

## Future Koala Integration Plan

The control-plane hooks exist, but true bypass should be enabled only after the native component can
truthfully return `dataPlaneActive: true`.

Already wired:

1. `NativeProcessBypassMechanism` includes `macos-transparent-proxy-system-extension`.
2. `NativeProcessBypassPlatformMode` includes `macos_transparent_proxy`.
3. `src/main/runtime/native-process-bypass.ts` can call the macOS controller.
4. `status/apply/cleanup` JSON is parsed and surfaced in support/debug state.

Still required before release enablement:

1. build and package the real signed provider bundle;
2. activate the extension through the host app and handle user approval;
3. implement real provider-side per-process flow policy;
4. prove cleanup on profile switch, core stop, and app quit;
5. run packaged smoke on Intel and Apple Silicon macOS.

## Recommendation

Keep macOS fallback-only for product behavior now. Use this scaffold to evaluate signing,
installation, provider policy, and lifecycle risk before enabling any Koala-side native mode.

Invest in native macOS only if process-level bypass becomes a release-critical requirement. The
implementation will require a real signed System Extension validation loop, not just Electron/TS
changes.
