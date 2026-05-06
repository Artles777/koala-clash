# Amnezia Import

Koala Clash supports self-contained AmneziaWG/WireGuard `vpn://` inputs by converting them into ordinary Mihomo local profiles.

## Import Boundary

- `http(s)://` imports a remote Mihomo subscription.
- `vless://` imports a local Mihomo profile generated from VLESS.
- `vpn://` imports a local Mihomo profile only when the payload is a self-contained AmneziaWG/WireGuard profile.

## Supported Inputs

The import must contain all runtime data:

- endpoint host and port
- client private key
- peer public key
- local address
- allowed IPs
- AmneziaWG options when the profile is `amneziawg`

## Runtime

Imported profiles run through the normal Mihomo path. The generated profile uses Mihomo `type: wireguard` and, for AmneziaWG, `amnezia-wg-option`.

Unsupported or non-self-contained inputs are rejected during import.

For packaged-build checks, use [Native Profile Validation Checklist](./native-profile-validation-checklist.md).
