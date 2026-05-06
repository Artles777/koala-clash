# Native Profile Validation Checklist

Use this checklist on packaged builds after changing import, profile activation,
TUN, or routing behavior.

## Imports

- Import an `http(s)://` Mihomo subscription. Confirm it appears as a remote
  profile and can update normally.
- Import a `vless://` link. Confirm it appears as a local profile and activates
  through the normal Mihomo runtime.
- Import a self-contained WireGuard `vpn://` key. Confirm it appears as a local
  Mihomo profile and activates without AmneziaWG options.
- Import a self-contained AmneziaWG `vpn://` key. Confirm it appears as a local
  Mihomo profile and the generated proxy uses `amnezia-wg-option`.
- Try a non-self-contained or incomplete `vpn://` input. Confirm import is
  rejected with a clear self-contained-profile or missing-field error.

## Runtime

- Activate each imported local profile and confirm Mihomo starts with the
  selected profile.
- Switch between an AmneziaWG/WireGuard profile, a VLESS profile, and an
  ordinary Mihomo profile. Confirm only the selected profile remains active.
- Restart the app and confirm saved local profiles still activate through the
  ordinary Mihomo path.
- Confirm profile status and activation errors use the normal profile surfaces.

## TUN And Rules

- Enable TUN and confirm basic traffic routes through `PROXY`.
- Add a `DIRECT` domain or IP rule and confirm the rule is written to the
  selected Mihomo profile.
- Toggle TUN off and on after switching profiles. Confirm route exclusions and
  rules remain consistent with the selected profile.
- Confirm the Rules page shows `PROXY`, `DIRECT`, and `REJECT` targets without
  Amnezia-specific runtime targets.
