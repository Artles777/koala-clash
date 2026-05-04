# Amnezia Helper TUN Bypass

Phase 16 adds a runtime-only bypass layer for helper upstream traffic when Mihomo TUN is enabled.

## What Was Implemented

- The helper manager resolves the normalized Amnezia upstream endpoint into IP addresses before starting a non-stub helper backend.
- Resolved upstream IPs are kept in transient runtime state and injected into `tun.route-exclude-address` during Mihomo runtime YAML generation.
- The persisted Mihomo profile/config and imported Amnezia profile data are not mutated.
- If TUN is enabled and upstream resolution fails, helper startup is blocked with `tun_bypass_resolution_failure`.
- If TUN is disabled, resolved bypass state can still be prepared so enabling TUN later can reuse it safely.
- Support diagnostics now expose TUN enabled state, bypass active state, bypass IP count, and resolution status.

## Failure Behavior

- Direct IP endpoints are converted to single-host route exclusions.
- Domain endpoints are resolved with desktop DNS and all resolved IPs are normalized.
- Resolution failures do not silently mark TUN as safe.
- In TUN mode, resolution failure is a blocker for helper startup.
- Outside TUN mode, resolution failure is recorded as diagnostics but does not block existing proxy-mode behavior.

## Still Missing

- TUN-mode packaged smoke validation with the real helper backend.
- Process/UID-based exclusion for platforms where IP route exclusions are insufficient.
- DNS fake-IP caveat validation under real Mihomo TUN traffic.
- UDP and long-running route stability validation.
