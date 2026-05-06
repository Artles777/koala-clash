# Getting Started With AmneziaWG/WireGuard

Use the Profiles import field for self-contained AmneziaWG/WireGuard `vpn://` keys. Supported imports become ordinary local Mihomo profiles.

## Flow

1. Import the `vpn://` key.
2. Koala generates and validates a Mihomo-native WireGuard profile.
3. Activate the profile like any other Mihomo profile.
4. Manage rules from the normal profile/rules surfaces.

Inputs that need gateway/API expansion or lack required WireGuard runtime fields are out of scope and are rejected explicitly.

For packaged-build checks, use [Native Profile Validation Checklist](./native-profile-validation-checklist.md).
