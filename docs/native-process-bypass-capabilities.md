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

- `IP-CIDR,DIRECT`: true TUN exclude only for the exact rule that generated a
  `route-exclude-address` entry.
- `DOMAIN,DIRECT`: partial TUN exclude when DNS lookup produced IP route exclusions; coverage can
  change with DNS.
- `DOMAIN-SUFFIX,DIRECT`: partial TUN exclude through the bounded apex-domain path; subdomains are
  not deterministically covered by that single rule.
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
- a Linux native bypass adapter with real cgroup/fwmark apply and cleanup,
- a Windows native bypass service/controller contract for a WFP data plane,
- an explicit macOS fallback-only classification,
- explicit unsupported/degraded states for macOS and missing Windows prerequisites,
- fallback precedence: native true bypass, then learned bypass, then direct-only,
- support/debug fields for native capability and effective PROCESS-NAME mode.

The capability report is runtime support/debug data. The main Rules page intentionally remains an
ordinary Mihomo rule editor and no longer presents per-rule bypass labels as product truth. Treat the
report as diagnostics, not as proof that live connectivity through a specific app or destination has
already succeeded.

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

## Windows Native WFP Service Path

Windows is modeled as a WFP service/controller path. Koala does not implement WFP filtering
inside the Electron process. Instead, it requires a privileged external data-plane component:

- `KoalaProcessBypass` service,
- `koala-process-bypassctl.exe` controller,
- elevated/admin context.

The current integration:

- reports platform mode `windows_wfp_service`,
- exposes the intended mechanism `windows-wfp-service`,
- checks whether an elevated context is available with `net.exe session`,
- checks whether `KoalaProcessBypass` service is installed,
- checks whether `koala-process-bypassctl.exe` is available,
- asks the controller to apply exact `PROCESS-NAME` WFP policy for the active runtime session,
- reports `active` / `true_bypass` only when the controller returns `dataPlaneActive: true`.

If the service/controller is missing, not elevated, or apply does not confirm an active data plane,
Windows `PROCESS-NAME,DIRECT` falls back to learned process-to-IP bypass when available, otherwise
it remains plain Mihomo DIRECT. This avoids claiming true native bypass without a real WFP data
plane.

Implementation sources live under `native/windows-process-bypass`. See
`docs/windows-process-bypass-service.md` for build, install, and limitation details.

## macOS Fallback-Only Mode

macOS is explicitly classified as `macos_fallback_only`.

The current architecture does not claim true native PROCESS-NAME bypass on macOS. `PROCESS-NAME,DIRECT` can still benefit from:

- address-based DIRECT excludes for `DOMAIN`, `DOMAIN-SUFFIX`, and `IP-CIDR` rules,
- learned process-to-IP bypass where observed destination IPs are available,
- normal Mihomo DIRECT behavior when no runtime bypass exists.

This avoids implying that process-name rules can exclude an app from TUN at the OS layer on macOS.

The first native macOS feasibility scaffold now lives under `native/macos-process-bypass`. It uses a
Network Extension/System Extension contract around `NETransparentProxyProvider`, but it intentionally
reports `dataPlaneActive: false` and `fallbackOnly: true`. Koala should not integrate it as native
`true_bypass` until a signed provider is installed, user-approved, and able to confirm an active
per-process data plane.

Koala can now query the scaffold control plane and surface controller, entitlement, extension,
approval, and `dataPlaneActive` status in support/debug output. This does not change precedence:
macOS remains native, then learned, then direct-only, and the current scaffold never reaches the
native active step.

See `docs/macos-process-bypass-native.md` for the entitlement, signing, provider, and future
integration plan.

## Remaining Work

- add a privileged Linux service path so GUI launches do not need direct root/CAP_NET_ADMIN,
- replace polling with a stronger platform event/service implementation if needed,
- implement/package/sign the Windows `KoalaProcessBypass` WFP service and controller,
- validate the macOS Network Extension/System Extension scaffold with a real signed build before any
  Koala-side `macos_transparent_proxy` mode is added,
- run packaged cleanup/recovery smoke validation for native routing state,
- add packaged smoke validation for Linux and Windows true native process bypass diagnostics.
