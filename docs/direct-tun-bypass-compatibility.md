# DIRECT Exclude Compatibility

This compatibility layer is runtime-only and does not change Mihomo rule semantics. It is controlled
by `directExcludeEnabled` and defaults to `directExcludeMode: conservative` for new configs. Older
configs that still use `directRulesBypassTun` are treated as the same on/off switch for backward
compatibility.

When enabled and TUN is active, Koala inspects the generated runtime rule list for `DIRECT` rules and
adds transient `tun.route-exclude-address` entries only for rule types that can be translated safely:

- `IP-CIDR` / `IP-CIDR6`: injected directly as route exclusions.
- `DOMAIN`: resolved to IP addresses and injected as route exclusions.
- `DOMAIN-SUFFIX`: resolves only the suffix apex. Subdomains still need exact `DOMAIN` rules or
  explicit `IP-CIDR` rules for deterministic bypass.

Unsupported rule types keep normal Mihomo behavior and are reported in diagnostics:

- `PROCESS-NAME`, `PROCESS-NAME-WILDCARD`, `PROCESS-NAME-REGEX`: still select Mihomo `DIRECT`, but
  do not exclude the desktop process from TUN at the OS/network interception layer.
- `PROCESS-PATH`, `PROCESS-PATH-WILDCARD`, `PROCESS-PATH-REGEX`: not translated into route
  exclusions.
- `DOMAIN-KEYWORD`: not translated because it cannot be mapped to deterministic route exclusions.
- Other rule types are ignored by this compatibility layer.

Generated exclusions are never written back to user profile files or rule patches. They are merged
with the existing helper upstream TUN bypass and deduplicated in the runtime YAML only.

This differs from old v0.2-style expectations: a `PROCESS-NAME,Telegram,DIRECT` rule can match
Telegram traffic inside Mihomo, but it cannot by itself create a true process-level TUN bypass. A
real process-level exclude would require platform-specific routing/packet-filter logic outside the
current Mihomo route-exclude model.
