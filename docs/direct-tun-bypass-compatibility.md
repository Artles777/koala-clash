# DIRECT Rules TUN Bypass Compatibility

This compatibility layer is runtime-only and does not change Mihomo rule semantics. It is controlled
by `directRulesBypassTun` and is enabled by default for new configs because user-facing `DIRECT`
rules are expected to bypass the VPN/TUN path where Koala can do that safely.

When enabled and TUN is active, Koala inspects the generated runtime rule list for `DIRECT` rules and
adds transient `tun.route-exclude-address` entries only for rule types that can be translated safely:

- `IP-CIDR`: injected directly as a route exclusion.
- `DOMAIN`: resolved to IP addresses and injected as route exclusions.
- `DOMAIN-SUFFIX`: resolves the suffix apex only. Subdomains still need exact `DOMAIN` rules or
  explicit `IP-CIDR` rules for deterministic bypass.
- `PROCESS-NAME,Telegram,DIRECT`: uses Koala's built-in Telegram address preset. This excludes known
  Telegram IPv4/IPv6 ranges from TUN; it does not rely on unsupported process-level exclusion.

Unsupported rule types keep normal Mihomo behavior and are reported in diagnostics:

- Unknown `PROCESS-NAME` values: still select Mihomo `DIRECT`, but do not exclude the process from
  TUN at the OS level unless a built-in address preset exists.
- `DOMAIN-KEYWORD`: not translated because it cannot be mapped to deterministic route exclusions.
- Other rule types are ignored by this compatibility layer.

Generated exclusions are never written back to user profile files or rule patches. They are merged
with the existing helper upstream TUN bypass and deduplicated in the runtime YAML only.
