# Learned Process-to-IP Bypass

This is a best-effort compatibility layer for `PROCESS-NAME,DIRECT` rules when Mihomo TUN is enabled.

It does not change Mihomo `DIRECT` semantics and it is not native process exclusion. The app observes Mihomo runtime connection metadata, learns destination IPs for connections that already matched `ProcessName -> DIRECT`, and injects those IPs into runtime-only `tun.route-exclude-address` while they are fresh.

## What It Can Do

- `PROCESS-NAME,<name>,DIRECT` can become `learned_bypass` after the process has produced a visible direct connection.
- Learned IPs are injected as transient TUN route exclusions.
- Entries expire automatically after a conservative TTL.
- Existing address-based DIRECT excludes remain independent and are merged deterministically.

## What It Cannot Do

- It does not exclude a process at the OS or UID level.
- It does not know future destination IPs before traffic is observed.
- It does not mutate user profile YAML or persisted rules.
- It does not make `PROCESS-NAME,DIRECT` equivalent to split tunneling.

## Diagnostics

Support snapshots expose:

- `learnedBypassEnabled`
- `learnedBypassActive`
- `learnedBypassEntryCount`
- `learnedBypassProcessCount`
- `learnedBypassExpiredCount`
- `learnedBypassSupportedOnPlatform`
- `learnedBypassOverallStatus`
- `learnedBypassWarnings`

Statuses mean:

- `observing`: matching rules exist, but no IPs have been learned yet.
- `active`: at least one fresh learned IP is injected into TUN excludes.
- `stale`: learned entries exist, but they expired.
- `unsupported`: the current platform cannot use this observation path.

## Future Work

A future Linux-first phase can add true process/UID exclusion using platform-native primitives. Until then, explicit `IP-CIDR` or `DOMAIN`/`DOMAIN-SUFFIX` DIRECT excludes remain the deterministic bypass mechanism.
