# Native Process Bypass Capability Model

This phase adds a capability model for DIRECT bypass behavior under Mihomo TUN. It does not replace Mihomo core and it does not make `PROCESS-NAME,DIRECT` universally solved.

## Effective Modes

Rules are classified into one effective bypass mode:

- `true_bypass`: traffic is covered by a real runtime bypass mechanism.
- `partial_bypass`: traffic is covered by a bounded or partially resolved runtime bypass.
- `learned_bypass`: PROCESS-NAME traffic is using observed destination IPs as temporary route exclusions.
- `direct_only`: the rule remains normal Mihomo DIRECT and does not bypass TUN capture.
- `unsupported`: the rule cannot be represented by the available bypass layers.

## Current Rule Behavior

- `IP-CIDR,DIRECT`: true TUN exclude when DIRECT exclude is active.
- `DOMAIN,DIRECT`: resolved to route exclusions when possible.
- `DOMAIN-SUFFIX,DIRECT`: resolved through the bounded apex-domain path and reported as partial when coverage is heuristic.
- `PROCESS-NAME,DIRECT`: true native process bypass only when a platform adapter is active; otherwise it may fall back to learned process-to-IP bypass.

## Linux-First Native Path

Linux is the first realistic target because process traffic can be grouped and marked using OS primitives. The recommended foundation is:

1. cgroup v2 for app-owned process grouping.
2. nftables/fwmark for marking traffic from that group.
3. policy routing for marked traffic outside Mihomo TUN capture.

This is preferred over `iptables owner` as the primary design because owner matching works naturally by UID/GID, not by `PROCESS-NAME`. Mapping process names to PIDs and keeping that set fresh fits better with a cgroup-based adapter.

## Current Implementation Status

The code now includes:

- a cross-platform capability report,
- a Linux native bypass adapter scaffold,
- explicit unsupported/degraded states for macOS and Windows,
- fallback precedence: native true bypass, then learned bypass, then direct-only,
- support/debug fields for native capability and effective PROCESS-NAME mode.

The Linux adapter now has an MVP apply/cleanup path. It attempts to:

1. verify Linux, cgroup v2, `nft`, `ip`, and privileges,
2. create `/sys/fs/cgroup/koala-clash-bypass`,
3. install an app-owned nftables table that marks cgroup traffic,
4. install an `ip rule` for that fwmark,
5. move exact-name matching PIDs into the cgroup,
6. keep a lightweight reconcile loop running while the bypass is active.

It reports `active` only after all steps complete. If any step fails, it rolls back the app-owned nft/ip/cgroup state where possible and reports a blocker diagnostic such as `nft_apply_failed`, `policy_route_apply_failed`, or `process_binding_failed`.

## Process Reconcile Loop

When Linux native bypass is active, Koala periodically scans `/proc` for exact `/proc/<pid>/comm` matches against `PROCESS-NAME,DIRECT` rules. Newly discovered matching PIDs are bound to `/sys/fs/cgroup/koala-clash-bypass`; dead PIDs are removed from in-memory tracking.

This is intentionally conservative:

- matching is exact process name only,
- no regex or process tree tracking is performed,
- polling is low-frequency and avoids a busy loop,
- failures are reported through `process_reconcile_failed` diagnostics,
- persisted Mihomo rules and profile files are not changed.

The reconcile state is exposed in support/debug data:

- tracked PID count,
- newly rebound PID count,
- dead PID cleanup count,
- last reconcile timestamp,
- reconcile errors.

## Remaining Work

- add a privileged Linux service/helper path so GUI launches do not need direct root/CAP_NET_ADMIN,
- replace polling with a stronger platform event/service implementation if needed,
- add cleanup/recovery for native routing state,
- add Linux packaged smoke validation for true native process bypass.
