# Amnezia Helper TUN Smoke Validation

Phase 17 adds a dedicated TUN-aware smoke scenario for the desktop Amnezia helper runtime.

## What TUN Smoke Validates

- The helper starts through the existing helper lifecycle with `tunEnabled=true`.
- Helper upstream bypass resolution runs before backend startup.
- A failed bypass resolution blocks helper startup for safety.
- A resolved bypass is present in the simulated Mihomo runtime `tun.route-exclude-address`.
- The transient `AMNEZIA_HELPER` outbound/group is present in the simulated runtime config.
- Configured helper rules are serialized into the same simulated runtime config.
- DNS hijack and `dns.enhanced-mode` are evaluated for helper rule matching reliability.
- Connectivity validation still runs through the helper local proxy endpoint.
- Cleanup verifies that transient TUN bypass state is cleared.

## Report And Matrix Fields

Smoke reports now include `runtimeScenario`, which is separate from the existing packaged/override/prototype `scenario`.

- `runtimeScenario: "proxy"` is the existing non-TUN smoke flow.
- `runtimeScenario: "tun"` is the new TUN-aware flow.

TUN reports include:

- `tunEnabled`
- `tunDnsHijackEnabled`
- `tunDnsEnhancedMode`
- `helperRuleReliability`
- `helperRuleReliabilityReason`
- `helperRulesHaveDomainRules`
- `helperRulesIpCidrOnly`
- `helperTunBypassActive`
- `helperTunBypassIps`
- `helperTunBypassResolutionStatus`
- `tunScenarioResult`
- `tunSafetyBlocked`
- `cleanupRestored`
- `tunRuntimeInjection`

The compatibility matrix can require both proxy and TUN rows with:

```bash
pnpm amnezia-helper:matrix -- --reports-dir smoke-reports --all --require-tun
```

## Smoke Commands

Run the default proxy-mode smoke:

```bash
pnpm amnezia-helper:smoke -- --packaged-app-path <path-to-packaged-app> --fixture-profile <profile.json>
```

Run the TUN-aware smoke:

```bash
pnpm amnezia-helper:smoke -- --tun --packaged-app-path <path-to-packaged-app> --fixture-profile <profile.json>
```

Optional helper rules can be checked with:

```bash
pnpm amnezia-helper:smoke -- --tun --helper-rule DOMAIN-SUFFIX,example.com --dns-enhanced-mode fake-ip --dns-hijack
```

## Still Manual

- Real OS TUN privileges and service setup on Windows, Linux, and macOS.
- Real Mihomo route table effects with packaged builds.
- Live DNS fake-IP behavior under TUN; the smoke report classifies configured reliability but does not trace Mihomo's internal DNS cache or live packet matching.
- UDP behavior and long-running route stability.
- Process/UID exclusion, which is intentionally not implemented yet.
