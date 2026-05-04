# Amnezia Helper TUN DNS Rule Reliability

Phase 18 adds diagnostics for AMNEZIA_HELPER rule matching under Mihomo TUN mode. It does not change Mihomo runtime behavior and does not add new routing mechanics.

## What Is Evaluated

The evaluator checks:

- whether TUN is enabled;
- whether TUN DNS hijack is configured;
- Mihomo DNS `enhanced-mode`;
- enabled AMNEZIA_HELPER rule types.

Supported helper rule types are the existing MVP set:

- `DOMAIN`
- `DOMAIN-SUFFIX`
- `DOMAIN-KEYWORD`
- `IP-CIDR`

## Classification

- `reliable`: TUN is disabled, no helper rules are enabled, only `IP-CIDR` rules are enabled, or domain rules are used with DNS hijack and `fake-ip`.
- `degraded`: domain rules are enabled under TUN, DNS hijack is present, but DNS mode is `redir-host`, `normal`, or unknown.
- `unlikely`: domain rules are enabled under TUN without DNS hijack.
- `blocked`: domain rules are enabled under TUN while Mihomo DNS is explicitly disabled.

The result is exposed in support diagnostics, smoke reports, and compatibility matrix rows.

## Inferred vs Directly Known

Directly known:

- generated/runtime TUN enabled state;
- configured `tun.dns-hijack`;
- configured `dns.enhanced-mode`;
- enabled helper rule types.

Inferred:

- whether future traffic will match a domain rule. This depends on Mihomo runtime DNS mapping and traffic metadata. Phase 18 reports reliability risk; it does not trace live packets or Mihomo's internal rule decision.

## Limitations

- No live packet inspection.
- No process or UID exclusion.
- No DNS fake-ip redesign.
- No UDP-specific validation.
- No split tunneling.
