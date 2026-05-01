# Realtime Apps Reliability

Koala treats voice and media apps as a separate reliability problem for VPN/PROXY
profiles. Domain rules can cover login and control traffic, but media often shows
up as UDP flows to IP endpoints, and PROCESS-NAME rules are not native split
tunneling on every desktop platform.

## Confidence Model

`realtimeConfidence` is a diagnostic summary, not a routing feature:

- `high`: helper UDP is validated end-to-end and a `MATCH,PROXY` catch-all covers
  remaining traffic.
- `medium`: helper UDP is validated at the proxy level and rules provide either a
  catch-all or both process and domain coverage.
- `low`: helper UDP is unknown/unvalidated, no VPN/PROXY coverage exists, or
  coverage is likely partial.

The current helper can report proxy-level UDP validation. End-to-end voice/media
validation remains a runtime/manual confidence signal until a real realtime smoke
test proves app media flows through the VPN.

## Preset Validation

Realtime presets expose a separate validation state:

- `not_tested`: no runtime or app-level validation evidence exists yet.
- `partial`: rules or proxy-level UDP look plausible, but media traffic is not
  proven end-to-end.
- `smoke_passed`: the preset smoke runner passed runtime checks for helper
  readiness, VPN/PROXY injection, connectivity, UDP confidence, and rule
  coverage. This is stronger than `partial`, but still not a proof of app-level
  voice quality.
- `validated`: a user/tester manually confirmed a real app session on the current
  device/network, or a future preset-specific smoke test records app-level
  evidence.
- `failed`: an explicit validation or smoke attempt failed.

This state is intentionally separate from rule creation. Adding the preset only
improves coverage; it does not prove that Discord voice or another media app is
stable until validation evidence exists.

Validation sources are machine-readable:

- `rule_analysis`: static rule coverage only.
- `runtime_state`: helper/routing/UDP state inspection.
- `connectivity_probe`: a helper connectivity probe was attempted.
- `preset_smoke`: preset-specific runtime smoke evidence.
- `manual_confirmation`: a tester marked the preset verified after a real session.

`Run preset check` performs a conservative runtime checklist: helper ready,
VPN/PROXY injected, UDP capability, connectivity probe, process coverage, domain
coverage, and final catch-all coverage. Passing this checklist is still `partial`
because it does not prove actual voice/media quality.

`Run preset smoke` runs the same runtime checks as a smoke scenario and records
structured smoke evidence, including observed process-to-IP evidence when Koala
has learned any for the preset processes. A passing smoke records
`smoke_passed`; it means the app has runtime evidence that the helper path is
usable, not that Discord voice quality has been fully proven.

`Mark as verified` stores a lightweight manual confirmation with timestamp,
helper mode, UDP confidence, platform mode, and an optional note. The stored
evidence is app-owned support data only; it does not include profile secrets.

## Validation Freshness

Preset evidence is tied to the runtime environment that produced it:

- active profile id;
- desktop platform;
- TUN on/off mode;
- helper backend mode;
- UDP confidence.

Koala stores this environment fingerprint with validation evidence. Support/UI
marks evidence stale when the fingerprint changes or when it is older than the
configured freshness window. Stale evidence remains visible for debugging, but it
should not be treated as current release/user confidence until the preset check,
smoke, or manual confirmation is repeated.

## Packaged Preset Evidence

Local preset evidence is useful for support, but release confidence requires
packaged evidence collected on real desktop builds. Koala now has a separate
evidence report and quality matrix layer for realtime presets.

An evidence report row records:

- preset id and title;
- profile id/name when available;
- platform and architecture;
- proxy vs TUN runtime scenario;
- helper mode;
- UDP confidence;
- smoke result;
- validation status/source;
- observed IP evidence counts;
- freshness and environment-change state;
- build id, app version, run id, and report path when collected from packaged
  validation.

Generate a packaged evidence report from a tester's preset validation store:

```bash
pnpm realtime-preset:quality -- report \
  --store <path-to-realtime-preset-validation.json> \
  --packaged \
  --platform darwin \
  --arch arm64 \
  --build-id <build-id> \
  --app-version <version> \
  --run-id <run-id> \
  --output release-evidence/realtime-presets/<run-id>/reports/darwin-arm64.json
```

Aggregate collected reports into a preset quality matrix:

```bash
pnpm realtime-preset:quality -- matrix \
  --reports-dir release-evidence/realtime-presets/<run-id>/reports \
  --preset discord_voice_vpn \
  --preset telegram_calls_vpn \
  --preset zoom_meetings_vpn \
  --preset teams_calls_vpn \
  --preset google_meet_vpn \
  --required-platform darwin \
  --required-platform win32 \
  --required-platform linux \
  --require-proxy-tun \
  --output release-evidence/realtime-presets/<run-id>/realtime-preset-quality-matrix.json
```

The matrix groups evidence by preset, platform, and runtime scenario. Rows can be
`validated`, `smoke_passed`, `partial`, `failed`, `not_tested`, or `missing`.
`validated` means manual confirmation or future stronger app-level evidence
exists and is still fresh. `smoke_passed` means runtime checks passed, but app
voice quality still needs manual confirmation. `missing` means no report was
collected for a required preset/platform/scenario.

Support diagnostics include the local evidence report and local quality matrix so
support can distinguish "only local smoke exists" from "packaged evidence was
collected for this build". Packaged reports should be retained with the existing
helper smoke/matrix release evidence.

The Rules page and Amnezia support/debug view render this matrix compactly:

- current preset quality status;
- evidence scope: local, packaged, or none;
- freshness: fresh or stale;
- separate proxy and TUN scenario status;
- per-platform proxy/TUN summary when a matrix contains multiple platforms;
- the most important caveats, such as local-only evidence, stale evidence, missing
  observed IP evidence, or platform fallback limitations.

The UI never upgrades local smoke into packaged evidence. A preset only shows
packaged evidence after a packaged report has been generated and included in the
quality matrix.

## Preset Definitions

Realtime presets are defined in a reusable app-owned preset registry. A preset
definition contains:

- stable preset id and user-facing title;
- process names;
- domains and domain suffixes;
- optional IP/CIDR seeds;
- platform notes and recommended actions;
- the smoke checklist profile used by validation.

Adding a new preset should not duplicate the validation or smoke logic. Add a
definition, then reuse the generic preset apply, validation, smoke, and
recommended-action paths.

The current catalog intentionally stays small:

- `Discord / voice apps through VPN`
- `Telegram calls through VPN`
- `Zoom meetings through VPN`
- `Microsoft Teams calls through VPN`
- `Google Meet through VPN`

The quality bar for adding another preset is that it must have clear process
names or domain coverage, platform notes, and a useful smoke checklist. Browser
apps should not add broad `PROCESS-NAME` rules for Chrome, Safari, or Edge unless
the preset is explicitly meant to route all browser traffic.

## Discord / Voice Preset

Most presets add a hybrid set of editable VPN rules:

- `PROCESS-NAME` rules for native desktop app processes when those names are
  specific enough.
- `DOMAIN` / `DOMAIN-SUFFIX` rules for control and media domains.
- Optional `IP-CIDR` seeds only when they are stable enough to justify
  persistence.

Google Meet is intentionally domain-first because broad browser process rules
would route unrelated browser traffic.

The preset intentionally does not expose internal runtime targets such as
`AMNEZIA_HELPER`. User-facing VPN rules remain `VPN / PROXY`.

## Observed IP Promotion

When learned process-to-IP bypass observes destination IPs for preset processes,
the preset smoke evidence can include those observed IPs. The Rules UI can
promote selected observed IPv4 addresses into persistent app-managed
`IP-CIDR,<ip>/32,PROXY` or `IP-CIDR,<ip>/32,DIRECT` rules for the chosen
owner/profile/action.

Promotion is conservative:

- persisted rules are normal user-facing managed rules;
- duplicate IP rules are skipped;
- invalid or unsupported IP values are reported instead of rewritten;
- internal helper targets are never exported into the normal Rules UI;
- observed IPs improve routing coverage, but still do not prove voice quality by
  themselves.

## Warnings

Realtime diagnostics warn when:

- helper UDP is not validated or only proxy-level validated;
- no final `MATCH,PROXY` catch-all is active;
- rules are domain-only or process-only;
- macOS PROCESS-NAME matching is fallback-based and not native process bypass.

These warnings are informational unless the helper/session is otherwise blocked.
They are meant to explain why apps like Discord can connect but still have poor
voice quality or very high latency.

Recommended actions are concrete upgrade steps, such as adding `MATCH,PROXY`,
strengthening domain coverage, adding observed stable media IPs as `IP-CIDR,PROXY`
rules, and running an end-to-end UDP/media check.
