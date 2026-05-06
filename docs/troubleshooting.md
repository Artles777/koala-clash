# Troubleshooting

Use this guide when the app starts but traffic does not route as expected.

## Amnezia Import Rejected

What it means: the `vpn://` input is not a self-contained AmneziaWG/WireGuard
profile that can run directly through Mihomo.

Check that the profile includes endpoint host and port, private key, peer public
key, local address, allowed IPs, and AmneziaWG options when applicable.

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

## macOS Fallback-Only Confusion

On macOS, `PROCESS-NAME,DIRECT` is not native process split tunneling yet. It can
match traffic inside Mihomo and can use learned observed IPs, but reliable TUN
bypass should use address-based rules where possible.

If a macOS process rule appears to match but traffic still times out, add or
promote stable destination IPs as `IP-CIDR` rules, or route the whole app through
VPN with stronger domain/catch-all coverage.

## After Amnezia-Helper Removal

The standalone `amnezia-helper` SOCKS sidecar has been removed; AmneziaWG now
runs through the bundled Mihomo core natively (`type: wireguard` with
`amnezia-wg-option`). Three classes of issues can show up after the upgrade.

### "core_does_not_support_amnezia_wg" on import

The bundled Mihomo core is too old and rejects `amnezia-wg-option`. Re-run the
prepare step to refresh the sidecar:

```sh
pnpm prepare
# or, when packaging:
pnpm build:mac    # / build:win / build:linux
```

If the freshly downloaded core still reports the same error, switch the
configured core under Settings → Core to `mihomo-alpha`, which always carries
the AmneziaWG patches.

### UDP traffic falls outside the VPN (Discord voice, gaming, DNS)

AmneziaWG profiles imported through `vpn://` now ship with two safety nets:

- a `DIRECT,no-resolve` rule that pins the WireGuard endpoint host so packets
  destined to the upstream do not loop through TUN;
- a `fallback` PROXY group with a periodic `generate_204` health check that
  drops back to `DIRECT` when the WG handshake stalls.

If UDP still leaks, open the runtime config (Mihomo → Open Config) and
confirm:

- the first rule is `IP-CIDR,<endpoint>/32,DIRECT,no-resolve` (or
  `IP-CIDR6,...,/128,DIRECT,no-resolve` for IPv6 endpoints, or
  `DOMAIN,<host>,DIRECT,no-resolve` for FQDN endpoints);
- the `PROXY` group `type` is `fallback` and includes both your
  AmneziaWG proxy and `DIRECT`;
- `udp: true` is set on the WireGuard proxy itself.

Re-import the `vpn://` key if any of those are missing — the file on disk may
predate the new generator.

### Stale placeholder profile after upgrade

Older builds occasionally wrote placeholder YAML (no `proxies:` section) under
the same profile id. The Amnezia importer now unlinks that file before writing
the new config, but a profile whose YAML on disk lacks proxies cannot be
activated as the current profile and will be rejected by `changeCurrentProfile`.

To recover manually:

1. Quit the app.
2. Delete the offending YAML in `<userData>/profiles/` (the file id matches the
   `profileItem.id` from `profile.yaml`).
3. Re-import the AmneziaWG `vpn://` key.

You can also remove the broken profile from Profiles UI and re-import — the
importer will rewrite a clean YAML on the next import.
