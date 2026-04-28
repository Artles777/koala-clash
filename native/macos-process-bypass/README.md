# Koala macOS Process Bypass

This directory is the macOS-native process bypass scaffold for future
`PROCESS-NAME,DIRECT` true bypass support.

It deliberately does not change Koala's current macOS runtime behavior. Koala must continue to
treat macOS as fallback-only until a signed Network/System Extension confirms
`dataPlaneActive: true`.

## Current Components

- `koala-macos-process-bypassctl`: controller CLI scaffold.
- `KoalaMacProcessBypassShared`: shared status/contract model.
- `KoalaTransparentProxyProvider`: `NETransparentProxyProvider` source scaffold.
- `Resources/*.entitlements`: signing entitlement templates.
- `contract.json`: machine-readable contract for future Koala-side integration.

## Provider Strategy

The first practical direction is `NETransparentProxyProvider` packaged as a Network Extension
System Extension.

Rationale:

- route tables and `pf` rules cannot express exact `PROCESS-NAME` bypass safely;
- plain Mihomo `PROCESS-NAME,DIRECT` is still a Mihomo routing decision, not an OS TUN exclusion;
- a Packet Tunnel provider would compete with the existing Mihomo TUN ownership and is a larger
  runtime redesign;
- Transparent Proxy providers are flow-oriented and can choose whether the provider handles a flow
  or lets the system handle it.

This is not an incremental TypeScript feature. It needs Apple entitlements, signing, notarization,
installation, and user approval.

## Controller Contract

```bash
koala-macos-process-bypassctl status --json
koala-macos-process-bypassctl apply --session <id> --json --process-name Telegram
koala-macos-process-bypassctl cleanup --session <id> --json
```

The scaffold always reports `dataPlaneActive: false` and `fallbackOnly: true`.

Koala may only treat macOS native process bypass as `true_bypass` when a future controller returns:

- `ok: true`
- `available: true`
- `entitlementsPresent: true`
- `extensionInstalled: true`
- `userApprovalRequired: false`
- `dataPlaneActive: true`
- `fallbackOnly: false`

## Local Build

The Swift package can build the controller/shared/provider source skeleton:

```bash
cd native/macos-process-bypass
swift build
```

This does not produce an installable System Extension bundle. A real provider bundle requires an
Xcode target, Apple Developer entitlements, signing, and notarization.

## Current Limitations

- no true macOS data plane yet;
- no process policy engine yet;
- no extension installation/activation path yet;
- no Koala-side runtime integration yet;
- no `dataPlaneActive: true` path in this scaffold.

Use Koala's existing macOS fallback stack for now:

- address-based DIRECT exclude for `IP-CIDR`, `DOMAIN`, and bounded `DOMAIN-SUFFIX`;
- learned process-to-IP bypass;
- plain Mihomo DIRECT when no runtime bypass exists.
