# Getting Started With VPN / Amnezia

This guide covers the normal user path for running Mihomo profiles and Amnezia
VPN profiles in Koala Clash. It avoids internal helper names and focuses on what
to check when routing does not behave as expected.

## Importing Profiles

Use the single import field on the Profiles page:

- `https://...` or `http://...`: imports a Mihomo remote config or subscription.
- `vpn://...`: imports an Amnezia VPN key.

Mihomo and VPN profiles are stored and started separately. They appear together
in the UI, but a rule still has an explicit owner:

- Mihomo owner: edits Mihomo rules for a Mihomo profile.
- VPN owner: edits app-managed VPN rules for an Amnezia helper-backed profile.

## Basic Terms

- `PROXY`: send traffic to the selected proxy group. For VPN-owned rules this is
  shown as `VPN / PROXY`.
- `DIRECT`: ask Mihomo to connect directly. In TUN mode this is not always the
  same as OS-level bypass.
- `TUN`: capture system traffic through Mihomo's virtual network interface.
- `Helper`: the bundled `amnezia-helper` process that exposes an Amnezia VPN
  profile to Mihomo as a local proxy endpoint.

See [Glossary](./glossary.md) for more terms.

## First Run Checklist

1. Import a `vpn://` key from Profiles.
2. Open the profile details/debug view and check that the helper backend is
   `Bundled` and available.
3. Enable Proxy mode or TUN mode from the main switch.
4. Start the connection.
5. Check support/debug status:
   - helper is managed by app;
   - local proxy is listening;
   - handshake is observed;
   - helper is ready;
   - connectivity is verified or explicitly reports why it is not.
6. Add VPN-owned rules from the Rules page.
7. Watch Logs to confirm matching traffic uses `VPN / PROXY`, `PROXY`, or
   `DIRECT` as intended.

## Routing Common Traffic

### All Traffic Through VPN

Add a VPN-owned `MATCH` rule with action `VPN / PROXY`. Keep it near the end of
the VPN rule list, after any specific `DIRECT` exceptions.

### Only Some Sites Through VPN

Add VPN-owned `DOMAIN`, `DOMAIN-SUFFIX`, or `IP-CIDR` rules with action
`VPN / PROXY`. Use logs to confirm the site is matched. Browser traffic can use
many domains, so one visible domain may not cover every request.

### Bypassing TUN Where Possible

When TUN is enabled, address-like `DIRECT` rules can become runtime TUN
exclusions:

- `IP-CIDR,DIRECT`: strongest and deterministic.
- `DOMAIN,DIRECT`: resolved to IPs and excluded when resolution succeeds.
- `DOMAIN-SUFFIX,DIRECT`: partial; only bounded resolved targets can be excluded.
- `PROCESS-NAME,DIRECT`: platform dependent. It is native on Linux when the
  native bypass prerequisites are active, learned/best-effort on macOS, and
  depends on the Windows native service/dataplane on Windows.

## Realtime Presets

Realtime presets help route apps such as Discord, Telegram calls, Zoom, Teams,
and Google Meet through VPN. They add a hybrid set of process/domain rules and
then show reliability evidence.

Use the preset controls on the Rules page:

1. Select a VPN profile owner.
2. Select a realtime preset.
3. Add the preset.
4. Run preset check or preset smoke.
5. If a real app call works on this device/network, mark it as verified.

Validation labels mean:

- `partial`: static/runtime checks look plausible, but app-level traffic is not
  proven.
- `smoke_passed`: helper/routing/connectivity checks passed for the preset.
- `validated`: a real app session was manually confirmed or stronger app-level
  evidence exists.
- `fallback-only`: the platform cannot currently provide true native
  process-level bypass; Koala uses address-based and learned fallback behavior.

Packaged evidence is separate from local evidence. The UI only shows packaged
evidence after reports are collected from real packaged builds.

## More Guides

- [Platform Capabilities](./platform-capabilities.md)
- [Troubleshooting](./troubleshooting.md)
- [Glossary](./glossary.md)
- [Realtime Apps Reliability](./realtime-apps-reliability.md)
