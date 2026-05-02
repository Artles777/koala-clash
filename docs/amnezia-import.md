# Amnezia Import Foundation

## Implemented

- Added a dedicated Amnezia `vpn://` import pipeline with detection, base64url decode, Qt-style compressed payload decode, parsing, normalization, validation, and duplicate checks.
- Added separate persistence for raw imported sources in `imported-sources.yaml` and normalized profiles in `normalized-profiles.yaml`.
- Added a managed Amnezia profile shape with explicit `profileKind`, `sourceType`, `runtimeSupport`, `validityStatus`, and `executionStatus` fields.
- Added a Mihomo-compatible placeholder local profile file so imported Amnezia keys can coexist with the existing profile list without teaching Mihomo to consume `vpn://` directly.
- Added a profile page entry point and modal for raw `vpn://...` input.
- Added profile-list badges, a details/debug modal, and explicit disabled states for unsupported Amnezia runtime actions.
- Added a small runtime capability resolver for current Mihomo-backed profiles and future Amnezia-backed profiles.
- Added migration logic that upgrades old phase-1 placeholder Amnezia items into managed Amnezia profiles and clears unsupported active selection.
- Added a desktop runtime adapter contract for phase 2b:
  - Mihomo profiles resolve to `mihomo-native`.
  - WireGuard/AmneziaWG imports resolve to an `external-helper` dry-run prototype.
  - Unsupported Amnezia protocols resolve to `unsupported` with explicit blockers.
- Added Amnezia execution-plan metadata to the details/debug view, including adapter id, execution kind, desktop platform, helper command prototype, blockers, and warnings.
- Added a phase 3 desktop helper lifecycle prototype:
  - `src/main/runtime/amnezia-helper-manager.ts` owns helper process sessions.
  - `src/main/runtime/amnezia-helper-stub.cjs` is a real spawned stub process that logs and stays alive until stopped.
  - IPC now exposes start, stop, status, and log reads for the helper prototype.
  - The Amnezia details/debug view can start and stop the helper prototype and display current status, last error, and recent logs.
- Added a phase 4 proxy-mode backend path:
  - `src/core/profiles/amnezia-helper-runtime-config.ts` generates isolated helper runtime configs from normalized profiles.
  - `src/main/runtime/amnezia-helper-proxy-backend.cjs` is a spawned proxy-mode backend prototype that consumes the generated config and listens on a local SOCKS5-marked endpoint.
  - Helper sessions now expose backend mode, readiness, local proxy endpoint, config generation status, and startup diagnostics.
  - Readiness is detected by a desktop TCP connection check against the generated local proxy endpoint.
  - A production helper executable can be injected with `KOALA_AMNEZIA_HELPER_BACKEND_PATH`; explicit stub mode is only selected via `KOALA_AMNEZIA_HELPER_BACKEND_MODE=stub`.
- Added a phase 5 routing integration path:
  - `src/core/routing/amnezia-helper-routing.ts` maps a ready helper endpoint to a transient Mihomo `socks5` outbound.
  - `src/main/runtime/amnezia-helper-routing-state.ts` keeps the current helper routing target in memory only.
  - The generated runtime YAML can include `AMNEZIA_HELPER_PROXY` and a selectable `AMNEZIA_HELPER` group while the helper is ready.
  - Helper ready/stop/fail transitions synchronize the transient routing target and request a Mihomo hot reload when possible.
  - The Amnezia debug/details view shows whether the helper routing target is injected, unavailable, or not injected.
- Added a phase 6 minimal helper-rules UX:
  - `src/core/routing/amnezia-helper-rules.ts` defines the app-owned helper rule model, validation, and Mihomo rule serialization.
  - `src/features/amnezia-helper-rules/store.ts` persists helper-targeted rules in a dedicated YAML store.
  - The generated runtime YAML prepends enabled helper rules only while `AMNEZIA_HELPER` is injected.
  - The Amnezia details/debug view can add, edit, enable/disable, and delete helper rules.
- Added a phase 7a production helper backend boundary:
  - `src/main/runtime/amnezia-helper-backend-provider.ts` resolves prototype, stub, production, and unavailable backend providers.
  - `src/core/profiles/amnezia-helper-production-config.ts` maps the normalized helper runtime config into a production backend JSON contract.
  - Production helper executable lookup is injectable with `KOALA_AMNEZIA_HELPER_BACKEND_PATH` and has packaged desktop path candidates under `resources/files/amnezia-helper/<platform>/<arch>/`.
  - Production mode is the default helper backend path; prototype fallback is only selected explicitly with `KOALA_AMNEZIA_HELPER_BACKEND_MODE=proxy-prototype`.
  - The helper manager still owns the existing session lifecycle, logs, TCP readiness check, cleanup, IPC, and routing synchronization.
- Added a phase 7b connectivity validation layer:
  - `src/main/runtime/amnezia-helper-connectivity.ts` validates ready helper endpoints in stages: local TCP connect, SOCKS5 greeting, and upstream HTTP request through the proxy.
  - Helper sessions now retain connectivity status, validation stage, last check time, latency, last error, last result, and structured runtime diagnostics.
  - IPC exposes manual connectivity validation and last-result reads.
  - The Amnezia details/debug view can run "Test connection" and show validation status, stage, latency, duration, and structured failure category.
- Added a phase 8 routing diagnostics layer:
  - `src/core/routing/amnezia-helper-routing-diagnostics.ts` evaluates app-owned helper rules against a host, domain, URL, or IPv4 address.
  - IPC exposes `evaluateAmneziaHelperRouting` for the Amnezia details/debug view.
  - The UI can show the matched helper rule, target availability, resulting route target, and a structured reason code.
- Added a phase 9 helper rule pack and bulk-management layer:
  - `src/core/routing/amnezia-helper-rule-packs.ts` defines app-owned rule packs, bulk parsing, import/export payloads, and merge summaries.
  - Existing flat `items` stores migrate into a default pack on read.
  - Runtime rule injection and diagnostics still consume a flat derived rule list from enabled packs.
  - The Amnezia details/debug view now supports pack visibility, pack enable/disable, search, bulk add, import/export, and creating a rule from a diagnostic result.
- Added a phase 10 bundled-helper delivery and validation layer:
  - Production helper lookup now validates the bundled resource path `resources/files/amnezia-helper/<platform>/<arch>/amnezia-helper(.exe)`.
  - `KOALA_AMNEZIA_HELPER_BACKEND_PATH` still has precedence for development and smoke testing.
  - Startup diagnostics distinguish missing binaries, permission problems, non-executable paths, unsupported platform/arch, manifest architecture mismatch, spawn failure, readiness timeout, and endpoint readiness failure.
  - `pnpm amnezia-helper:smoke` prints resolution/validation diagnostics and can run the helper self-check command with `--spawn-self-check`.
- Added a phase 11 packaged verification workflow:
  - `src/main/runtime/amnezia-helper-verification.ts` runs a staged packaged-helper smoke flow over the existing provider and helper manager.
  - `pnpm amnezia-helper:smoke` now emits a machine-readable JSON report for backend resolution, optional self-check, startup, readiness, connectivity, routing injection, and cleanup.
  - `fixtures/amnezia-helper/normalized-profile.json` provides a safe normalized-profile fixture for lifecycle validation without committing real credentials.
  - `docs/amnezia-helper-verification.md` defines the Windows, Linux, and macOS smoke matrix and release-blocking checks.
- Added a phase 12 release packaging pipeline:
  - `src/main/runtime/amnezia-helper-artifacts.ts` validates and stages production helper artifacts into the existing `extra/files/amnezia-helper/<platform>/<arch>/` packaging layout.
  - `native/amnezia-helper/` contains the helper Go module that is built into generated artifacts.
  - `scripts/amnezia-helper-build.ts` exposes `pnpm build:amnezia-helper` and platform aliases.
  - `scripts/amnezia-helper-artifacts.ts` exposes `pnpm amnezia-helper:prepare` and `pnpm amnezia-helper:validate`; prepare builds helper source automatically before staging unless an external source root or `--skip-build` is used.
  - Preparation writes `extra/files/amnezia-helper/manifest.json` with platform, arch, source path, packaged path, checksum, size, and optional helper metadata.
  - Desktop build scripts now run helper artifact preparation before `electron-builder`.
  - `docs/amnezia-helper-release-packaging.md` documents the artifact contract and release validation flow.
- Added a phase 13 platform compatibility matrix:
  - Smoke reports now include release metadata, helper checksum/version, and `supported` / `warning` / `blocked` readiness classification.
  - `src/main/runtime/amnezia-helper-matrix.ts` aggregates per-platform smoke JSON into a release matrix.
  - `scripts/amnezia-helper-matrix.ts` exposes `pnpm amnezia-helper:matrix`.
  - `docs/amnezia-helper-platform-matrix.md` documents packaged smoke commands, aggregation, and blocker criteria.
- Added a phase 14 supportability layer:
  - `src/main/runtime/amnezia-helper-support.ts` maps helper/runtime diagnostics into user-facing `info` / `warning` / `blocker` support states.
  - The diagnostics bundle exporter writes app-owned helper support data as JSON without raw Amnezia sources, generated helper configs, key material, or full helper rule values.
  - IPC exposes current support snapshot reads and diagnostics bundle export for the Amnezia details/debug view.
  - The Amnezia details/debug view shows platform/backend support state, release readiness, helper checksum/version, rule-pack summary, and an export diagnostics action.
- Added a phase 22 real platform validation layer:
  - `src/main/runtime/amnezia-helper-platform-validation.ts` converts packaged smoke/matrix evidence into a release-focused platform validation summary.
  - `scripts/amnezia-helper-platform-validation.ts` exposes `pnpm amnezia-helper:platform-validation` for target-OS run plans and blocker/warning summaries.
  - `docs/amnezia-helper-real-platform-validation.md` documents proxy, TUN, stability, aggregation, and blocker tracking for Windows, Linux, and macOS.
- Added Node unit tests for valid import, malformed input, unsupported payload, duplicate import, successful normalization, missing WireGuard keys, managed metadata, runtime capabilities, migration, runtime adapter planning, helper config generation, and helper lifecycle/readiness transitions.

## Assumptions

- Amnezia `vpn://` payloads are base64url text that may be Qt `qCompress`/`qUncompress` compatible, matching Amnezia's own config decoder/import handling.
- Initial normalization focuses on Amnezia native JSON containers and WireGuard/AmneziaWG-style payloads because those expose endpoint and key material clearly.
- Imported WireGuard/AmneziaWG profiles are managed app profiles now, and their runtime path is an external desktop helper. They are still not activatable as Mihomo-native live profiles.
- The helper path assumes desktop Electron platforms only: Windows, Linux, and macOS.
- The phase 4 proxy backend is a real spawned local listener and readiness target, but it still does not perform Amnezia tunnel forwarding.
- The phase 5 Mihomo integration treats the ready helper endpoint as a local SOCKS5 proxy. It does not add user rules automatically.
- The phase 6 helper-rules layer supports only `DOMAIN`, `DOMAIN-SUFFIX`, `DOMAIN-KEYWORD`, and IPv4 `IP-CIDR` rules targeting `AMNEZIA_HELPER`.
- The phase 7a production backend contract assumes a real desktop helper can run in proxy mode and accept a JSON config with endpoint, WireGuard keys, DNS, allowed IPs, Amnezia metadata, and local SOCKS5 listen settings.
- Phase 7b "validated" means the local helper proxy is reachable, accepts a SOCKS5 no-auth handshake, can connect to the configured validation target, and returns an HTTP response through that proxied connection.
- Phase 8 routing diagnostics are deterministic for Koala Clash's app-owned helper rules. Helper availability is runtime-derived from the in-memory injected routing target, not from live packet tracing.
- Phase 9 rule packs remain app-owned. They are persisted only in `amnezia-helper-rules.yaml` and are never written back into imported Amnezia sources or Mihomo subscription/local profile files.
- Phase 10 assumes release builds place the real helper artifact under `extra/files/amnezia-helper/<platform>/<arch>/` before packaging; the app then resolves it from packaged `resources/files/...` without user-side manual placement.
- Phase 11 assumes the smoke workflow is run on each target desktop platform from the packaged app artifact. Cross-platform unit tests validate report structure and failure mapping, but they do not prove OS-specific packaging behavior.
- Phase 12 builds production helper binaries from `native/amnezia-helper/` into ignored `helper-artifacts/amnezia-helper/<platform>/<arch>/` before app packaging.
- Phase 13 assumes smoke reports are generated on the real target OS for each shipped desktop target. Aggregation can run anywhere after those reports are collected.
- Phase 14 diagnostics are intentionally support-scoped. They include helper backend/session/routing/rule-pack summaries and logs, but not raw imported `vpn://` strings, generated configs, private keys, or exact helper rule domains.
- Phase 22 formalizes real packaged validation execution, but it still depends on humans or CI agents running generated smoke commands on the actual Windows, Linux, and macOS targets with real helper artifacts and private normalized fixture profiles.

## Still Missing

- No Amnezia tunnel execution is implemented.
- No production Mihomo translation is implemented for AmneziaWG or other Amnezia protocols. Phase 5 only injects a dynamic local proxy outbound that points at the helper endpoint.
- The repository still does not include a production Amnezia helper binary artifact. The packaging path and validation are implemented, but release pipelines must supply the binary for each desktop target.
- No traffic reaches a real Amnezia tunnel yet; the local proxy endpoint and Mihomo outbound only prove process/config/readiness/routing orchestration.
- Full production traffic validation against a bundled real Amnezia-compatible helper is still pending until the helper binary is available. The app-side validation path is implemented and can validate an injected production helper.
- Packaged smoke reports still need to be collected from real Windows, Linux, and macOS release artifacts with a private valid Amnezia fixture before claiming end-to-end production traffic readiness.
- Diagnostics export improves supportability but does not prove real production tunnel traffic unless paired with target-OS packaged smoke results and a real helper artifact.
- The helper-rules UX is intentionally small and only manages app-owned rules for the generated `AMNEZIA_HELPER` target.
- Routing diagnostics do not trace Mihomo's full rule engine, packet flow, TUN state, or system routing. They explain only the dedicated `AMNEZIA_HELPER` rule layer and current helper target availability.
- Rule pack import/export is meant for Koala Clash helper rules only. It is not a general Mihomo rule provider/subscription format.
- XRay/OpenVPN/Shadowsocks Amnezia containers are only structurally recognized where possible; full protocol-specific mapping still needs follow-up work.
- No migration or UI management screen exists yet for the separate normalized profile store.

## Runtime Boundary

- `src/core/profiles/managed-profile.ts` is the capability boundary for phase 2a.
- `src/core/profiles/desktop-runtime-adapter.ts` is the phase 2b runtime adapter boundary.
- `src/core/profiles/amnezia-helper-runtime-config.ts` is the phase 4 helper config generation boundary.
- `src/main/runtime/amnezia-helper-backend-provider.ts` and `src/core/profiles/amnezia-helper-production-config.ts` are the phase 7a production backend boundaries.
- `src/main/runtime/amnezia-helper-connectivity.ts` is the phase 7b traffic validation boundary.
- `src/core/routing/amnezia-helper-routing.ts` is the phase 5 Mihomo routing injection boundary.
- `src/core/routing/amnezia-helper-rules.ts` is the phase 6 helper-targeted rule boundary.
- `src/core/routing/amnezia-helper-routing-diagnostics.ts` is the phase 8 deterministic helper-rule diagnostics boundary.
- `src/core/routing/amnezia-helper-rule-packs.ts` is the phase 9 app-owned pack/bulk/import/export boundary.
- `scripts/amnezia-helper-smoke.ts` is the phase 10 packaged-helper resolution and self-check utility.
- `src/main/runtime/amnezia-helper-verification.ts` is the phase 11 packaged smoke report runner.
- `src/main/runtime/amnezia-helper-artifacts.ts` is the phase 12 artifact staging and build-validation boundary.
- `src/main/runtime/amnezia-helper-matrix.ts` is the phase 13 platform compatibility matrix boundary.
- `src/main/runtime/amnezia-helper-support.ts` is the phase 14 support snapshot, diagnostics bundle, and user-facing severity mapping boundary.
- `src/main/runtime/amnezia-helper-platform-validation.ts` is the phase 22 platform validation summary and blocker tracking boundary.
- `scripts/amnezia-helper-platform-validation.ts` is the phase 22 run-plan and summary CLI.
- Mihomo profiles resolve to `runtimeType: "mihomo"` and remain activatable.
- Amnezia profiles resolve to `runtimeType: "amnezia"` and currently expose `executionKind: "external-helper"` with `runtimeSupport: "prototype_available"` when a dry-run plan can be produced.
- UI actions should consult the resolver instead of checking raw profile fields directly.
- Production helper integration should plug into `AmneziaHelperManager` by replacing the stub executable/config writer while preserving the session model and IPC surface.

## Phase 2b Runtime Strategy

Mihomo-native translation is not the default path for desktop Amnezia imports yet. The current app runtime is built around one generated Mihomo YAML and one Mihomo core process. Translating AmneziaWG directly into that YAML would require proving Mihomo's WireGuard behavior matches AmneziaWG semantics, especially Amnezia-specific obfuscation fields and desktop TUN/privilege behavior.

The safer desktop path is an external helper boundary. The helper can eventually own Amnezia-specific tunnel setup while Koala Clash keeps Mihomo unchanged and coordinates profile lifecycle at the app layer. Phase 2b only creates a dry-run execution plan and compatibility validation; it does not execute the helper.

## Phase 3 Helper Lifecycle

Phase 3 turns the dry-run helper plan into a real process lifecycle prototype. The app can start one helper-backed Amnezia session, prevent duplicate starts, stop it safely, collect stdout/stderr logs, detect crashes, and remove temporary config files. The process is a stub, so it does not create a network interface or route traffic.

## Phase 4 Proxy Backend

Phase 4 moves the helper path from "process stays alive" to proxy-mode backend orchestration. Koala Clash now generates a helper runtime config with remote endpoint, keys, DNS, allowed IPs, Amnezia-specific fields, local proxy listen host/port, and execution metadata. The main-process manager writes that config, starts either the bundled proxy backend prototype or an injected production backend, and waits for a local TCP readiness signal.

The bundled backend exposes a local proxy endpoint and `/health` response for diagnostics, but it does not implement Amnezia tunnel traffic forwarding. Production helper integration should preserve the generated config contract and replace the backend executable.

## Phase 5 Routing Integration

Phase 5 makes the ready helper endpoint visible to Mihomo as a normal local proxy target without persisting it into user profiles. When the helper session reaches `running` + `ready`, Koala Clash keeps an in-memory routing target and `generateProfile()` injects a `socks5` proxy named `AMNEZIA_HELPER_PROXY` plus a select group named `AMNEZIA_HELPER` into the runtime YAML. When the helper stops or fails, that transient state is cleared and the next generated runtime YAML no longer contains the helper target.

This does not alter Mihomo core behavior. Existing rules/groups remain the mechanism for selecting the target; phase 5 only provides the generated target that future UX can expose more directly.

## Phase 6 Helper Rules UX

Phase 6 adds a small app-owned rule layer for routing selected traffic to `AMNEZIA_HELPER`. Rules are persisted in `amnezia-helper-rules.yaml` and are not written into imported Amnezia sources, normalized profiles, or the user's subscription/local profile files.

Enabled helper rules are serialized as standard Mihomo rules such as `DOMAIN-SUFFIX,example.com,AMNEZIA_HELPER` and prepended to the generated runtime YAML only when the helper routing target is currently injected. If the helper is stopped, failed, not ready, missing an endpoint, or explicitly running in stub mode, the rules remain saved but are omitted from runtime config.

The current UI supports only `DOMAIN`, `DOMAIN-SUFFIX`, `DOMAIN-KEYWORD`, and IPv4 `IP-CIDR`. It does not support geosite/geoip providers, process rules, split tunneling, or a full policy editor.

## Phase 7a Production Backend

Phase 7a replaces the hard-coded prototype launch decision with a backend provider boundary. `AmneziaHelperManager` still owns the lifecycle, logs, readiness polling, cleanup, IPC, and routing injection, but backend selection, launch args, diagnostics parsing, and backend-specific config generation now live behind the provider.

Production mode writes a production helper JSON config instead of the prototype runtime config. It maps the normalized Amnezia fields into remote endpoint, WireGuard interface and peer material, DNS, allowed IPs, Amnezia obfuscation metadata, local SOCKS5 proxy listen settings, and execution readiness metadata.

Use `KOALA_AMNEZIA_HELPER_BACKEND_PATH` to point Koala Clash at a development helper, or package the production helper under `extra/files/amnezia-helper/<platform>/<arch>/amnezia-helper(.exe)`, which resolves at runtime as `resources/files/amnezia-helper/<platform>/<arch>/...`. Because production mode is now the default, missing production backends fail with diagnostics; fallback to the proxy prototype is only explicit via `KOALA_AMNEZIA_HELPER_BACKEND_MODE=proxy-prototype`.

## Phase 7b Connectivity Validation

Phase 7b adds an app-side validation path on top of the existing helper lifecycle. The states are deliberately separate: process started means Electron spawned the helper process, endpoint ready means the local proxy TCP port accepts connections, and connectivity verified means the app completed TCP connect, SOCKS5 handshake, SOCKS5 upstream connect, and an HTTP request through that proxy.

Validation is manual from the Amnezia details/debug view and exposed through IPC. It does not modify Mihomo core, TUN, system routing, or rules. The latest result is retained in memory on the helper session with structured diagnostics for backend unavailable, config generation failure, startup timeout, endpoint unreachable, proxy handshake failure, upstream request failure, and validation timeout.

The default upstream validation target is `example.com:80` over HTTP so the check can prove proxied traffic without adding TLS handling yet. Future production hardening should make validation targets configurable and run the same check against the bundled real helper in release builds.

## Phase 8 Routing Diagnostics

Phase 8 makes the helper routing layer explainable without redesigning the rules editor or tracing live packets. A new pure evaluator checks a user-entered host, URL, domain, or IPv4 address against the app-owned `AMNEZIA_HELPER` rules. It supports the same MVP rule types as the rule editor: `DOMAIN`, `DOMAIN-SUFFIX`, `DOMAIN-KEYWORD`, and IPv4 `IP-CIDR`.

The result is machine-readable and includes the normalized input, matched rule id/type/value, whether the helper target is currently injected, whether it is ready, the resulting target, and one of `helper_rule_match`, `helper_not_injected`, `helper_not_ready`, `no_rule_match`, or `invalid_input`.

Rule matching is deterministic. Helper injection and readiness are inferred from Koala Clash's in-memory helper routing target, so the diagnostic can explain what the app would inject for its helper rule layer. It does not inspect live traffic or reproduce every Mihomo rule interaction outside this dedicated layer.

## Phase 9 Rule Packs And Bulk UX

Phase 9 keeps helper rules isolated but makes them practical to manage at larger counts. The persisted store now uses a v2 shape with packs:

```yaml
version: 2
packs:
  - id: default
    name: Default
    enabled: true
    rules:
      - id: rule-id
        type: DOMAIN-SUFFIX
        value: example.com
        enabled: true
        target: AMNEZIA_HELPER
        createdAt: 1710000000000
```

Older flat stores with `items: [...]` are migrated into the default pack when read. Runtime injection and diagnostics do not consume the persisted pack structure directly; they receive a flat derived list from enabled packs, preserving the existing Mihomo runtime integration.

Bulk add accepts one value per line and comma-separated values for the selected MVP rule type. Values are trimmed and normalized through the existing helper rule validator. Duplicate values in the pasted input and duplicates against existing rules are skipped with a summary; malformed values are reported as invalid.

Import/export uses a stable app-owned YAML/JSON-compatible format:

```yaml
format: koala-clash.amnezia-helper-rule-packs
version: 1
packs:
  - name: Work
    enabled: true
    rules:
      - type: DOMAIN-SUFFIX
        value: example.com
        enabled: true
```

Import merges packs by name, adds new packs when needed, skips duplicate rules, and reports added/skipped/invalid counts. This is not a Mihomo provider format and does not subscribe to external rule sources.

## Phase 10 Bundled Helper Delivery

Phase 10 makes the production helper path packaging-ready without changing Mihomo or helper lifecycle ownership. Production mode resolves backends in this order:

1. `KOALA_AMNEZIA_HELPER_BACKEND_PATH`
2. `resources/files/amnezia-helper/<platform>/<arch>/amnezia-helper(.exe)`
3. `resources/files/amnezia-helper/<platform>-<arch>/amnezia-helper(.exe)`
4. `resources/files/amnezia-helper/<platform>/amnezia-helper(.exe)`
5. `resources/files/amnezia-helper(.exe)`

In development, `resources/files` maps to `extra/files`, so release packaging should place helper artifacts under `extra/files/amnezia-helper/<platform>/<arch>/`. Supported platform/arch pairs are Windows, Linux, and macOS on `x64` or `arm64`.

Startup validation checks that the resolved path exists, is a file, is executable/readable for the platform, targets a supported platform/arch, and optionally matches an adjacent manifest at `amnezia-helper(.exe).json`. Missing or invalid helpers fail before spawn with structured diagnostics. Spawn errors are classified separately from readiness timeouts and local endpoint failures.

The smoke utility is:

```bash
pnpm amnezia-helper:smoke
pnpm amnezia-helper:smoke -- --spawn-self-check
```

The utility prints the resolved path, validation diagnostics, self-check args, and exits non-zero when no valid production helper is available. Unit tests cover path resolution and diagnostics, but real packaged verification still needs platform-specific release artifacts on Windows, Linux, and macOS.

## Phase 11 Packaged Smoke Verification

Phase 11 turns the smoke utility into a staged packaged verification runner. The command now builds a JSON report with backend source, packaged/override mode, executable validation, startup, readiness, connectivity, routing injection, cleanup, diagnostics, timestamps, and durations.

The default run exercises the full helper lifecycle. Use `--resolve-only` for the old phase 10 resolution-only behavior:

```bash
pnpm amnezia-helper:smoke -- --packaged-app-path <path-to-installed-app> --spawn-self-check
pnpm amnezia-helper:smoke -- --resolve-only --packaged-app-path <path-to-installed-app>
```

The default fixture is `fixtures/amnezia-helper/normalized-profile.json`. It is intentionally fake and validates process/config/lifecycle behavior only. Real traffic validation requires a private normalized profile fixture passed with `--fixture-profile`.

See `docs/amnezia-helper-verification.md` for the Windows, Linux, and macOS verification matrix, expected report fields, common failure categories, and release-blocking manual checks.

## Phase 12 Release Packaging Pipeline

Phase 12 adds a repeatable preparation step for production helper artifacts. The
helper source lives at `native/amnezia-helper/`; generated binaries are written
to:

```text
helper-artifacts/amnezia-helper/<platform>/<arch>/amnezia-helper(.exe)
```

The preparation command validates each requested target, stages it into `extra/files/amnezia-helper/<platform>/<arch>/`, copies any adjacent helper manifest, and writes `extra/files/amnezia-helper/manifest.json` with checksums and metadata:

```bash
pnpm amnezia-helper:prepare -- --target linux --arch x64
pnpm amnezia-helper:prepare -- --all
pnpm amnezia-helper:validate -- --target linux-x64
```

`pnpm build:amnezia-helper` can be used for explicit helper-only builds, but
`pnpm amnezia-helper:prepare` already builds helper source automatically before
staging. The `build:win`, `build:mac`, and `build:linux` scripts run helper
preparation before `electron-builder`. Missing or invalid generated helper
artifacts fail the build before packaging. The existing runtime path resolver is
unchanged.

See `docs/amnezia-helper-release-packaging.md` for the full artifact contract and release flow.

## Phase 13 Platform Compatibility Matrix

Phase 13 keeps the phase 11 smoke runner as the per-platform validation primitive and adds release aggregation. A packaged smoke run now records build id, app version, helper checksum, helper version when available, and a readiness status:

- `supported`: all required packaged runtime stages passed with production helper evidence.
- `warning`: no hard failure, but release evidence is incomplete.
- `blocked`: at least one required runtime stage or target report failed/missing.

Run smoke on each target OS:

```bash
pnpm amnezia-helper:smoke -- --packaged-app-path <installed-app> --fixture-profile <private-profile.json> --spawn-self-check --build-id <id> --app-version <version> --report-path smoke-<platform>-<arch>.json
```

Aggregate collected reports:

```bash
pnpm amnezia-helper:matrix -- --reports-dir smoke-reports --all --output amnezia-helper-matrix.json
```

The matrix tool exits non-zero only for `blocked` matrices. See `docs/amnezia-helper-platform-matrix.md` for the full gating criteria.

## Phase 18 TUN DNS Rule Reliability

Phase 18 adds diagnostics for AMNEZIA_HELPER rule matching under Mihomo TUN mode. Domain helper rules are classified as reliable only when TUN DNS hijack is active and Mihomo DNS `enhanced-mode` is `fake-ip`. `IP-CIDR` helper rules are considered independent from fake-ip DNS behavior.

The support snapshot, smoke report, and compatibility matrix now include DNS hijack state, DNS enhanced mode, helper rule type summary, and helper rule reliability:

- `reliable`
- `degraded`
- `unlikely`
- `blocked`

The smoke CLI can override diagnostic assumptions with:

```bash
pnpm amnezia-helper:smoke -- --tun --helper-rule DOMAIN-SUFFIX,example.com --dns-enhanced-mode fake-ip --dns-hijack
pnpm amnezia-helper:smoke -- --tun --helper-rule DOMAIN-SUFFIX,example.com --no-dns-hijack
```

See `docs/amnezia-helper-tun-dns-rule-reliability.md` for the exact classification model and limitations.

## Phase 19 UDP Capability Truthfulness

Phase 19 removes the previous implicit UDP assumption from the transient Mihomo helper outbound. `AMNEZIA_HELPER_PROXY` now advertises `udp: true` only after helper UDP capability is explicitly validated. Unknown or unsupported UDP capability is represented as TCP-only runtime config with `udp: false`.

The current validation checks SOCKS5 `UDP ASSOCIATE` against the helper local proxy endpoint. This confirms proxy-level UDP support, but it is not yet a full end-to-end UDP datagram validation through the Amnezia upstream.

Support snapshots, smoke reports, and matrix rows now include:

- `udpSupport`
- `udpValidated`
- `udpReasonCode`
- `udpExplanation`
- `runtimeAdvertisesUdp`

See `docs/amnezia-helper-udp-capability.md` for the exact model and remaining validation gaps.

## Phase 20 Stability and Recovery Validation

Phase 20 adds an optional stability stage to the packaged helper smoke workflow. It reuses the existing helper manager and verifies repeated start/stop, reload resilience, crash recovery when a crash hook is supplied, TUN reload resilience, and short or long soak checks with periodic connectivity validation.

The smoke CLI now accepts:

```bash
pnpm amnezia-helper:smoke -- --stability --stability-cycles 5 --soak-duration-ms 60000 --soak-interval-ms 5000
pnpm amnezia-helper:smoke -- --tun --stability
```

Smoke reports and matrix rows include `lifecycleStressPassed`, `reloadResiliencePassed`, `recoveryPassed`, `soakDurationMs`, `repeatedStartStopCount`, `staleStateDetected`, and `cleanupLeakDetected`.

See `docs/amnezia-helper-stability.md` for the exact scenario model and remaining manual long-running validation gaps.

## Phase 21 Support Readiness Summary

Phase 21 adds a conservative aggregated readiness summary to the Amnezia helper diagnostics bundle and the details/debug UI. The summary combines backend validation, helper session readiness, connectivity, TUN bypass state, TUN DNS/rule reliability, UDP capability, release readiness, and optional stability smoke results.

The UI now shows a compact status, component-level readiness, top issues, recommended next actions, and a support-safe copy action for a compact JSON summary. The copied summary excludes raw import sources, private keys, generated helper configs, logs, raw helper rule values, and temp config paths.

See `docs/amnezia-helper-support-readiness.md` for the severity precedence and remaining manual checks.

## Phase 22 Real Platform Validation

Phase 22 adds a release-execution layer around the existing packaged smoke, TUN smoke, stability, and matrix tools. It generates target-OS run plans and summarizes collected evidence into a platform validation report with proxy, TUN, stability, helper artifact, release readiness, and structured blocker/warning issues.

Generate a run plan:

```bash
pnpm amnezia-helper:platform-validation -- plan --all --reports-dir smoke-reports --packaged-app-path "<packaged-app-path>" --fixture-profile "<private-normalized-profile.json>" --build-id "<id>" --app-version "<version>"
```

Summarize collected results:

```bash
pnpm amnezia-helper:matrix -- --reports-dir smoke-reports --all --require-tun --output smoke-reports/amnezia-helper-matrix.json
pnpm amnezia-helper:platform-validation -- summarize --matrix smoke-reports/amnezia-helper-matrix.json --output smoke-reports/amnezia-helper-platform-validation-summary.json
```

The summary treats missing proxy, TUN, or stability evidence as release blockers for phase-22 validation. It does not fake real platform execution; the generated smoke commands still need to run on the actual Windows, Linux, and macOS targets.

See `docs/amnezia-helper-real-platform-validation.md` for the concrete runbook and blocker criteria.

## Phase 26 Packaged Validation Evidence Workflow

Phase 26 keeps the phase-22 smoke/matrix/runtime architecture intact and adds release-candidate evidence handling around it. Platform validation plans can now use a stable `runId` and `evidenceDir`, producing deterministic report paths under `release-evidence/amnezia-helper/<run-id>/`.

The platform validation model now includes:

- run-scoped evidence layout
- deterministic per-platform report names
- an issue package JSON for blockers and warnings
- scenario-aware issues (`proxy_smoke`, `tun_smoke`, `stability`)
- reproduction hints tied to report references

Example:

```bash
pnpm amnezia-helper:platform-validation -- plan --all --evidence-dir release-evidence/amnezia-helper --run-id "<build-id>" --packaged-app-path "<packaged-app-path>" --fixture-profile "<private-normalized-profile.json>" --build-id "<build-id>" --app-version "<version>"
pnpm amnezia-helper:platform-validation -- package --summary release-evidence/amnezia-helper/<build-id>/amnezia-helper-platform-validation-summary.json --run-id "<build-id>" --output release-evidence/amnezia-helper/<build-id>/amnezia-helper-platform-validation-issues.json
```

The workflow still requires manual execution on real Windows, Linux, and macOS machines with production helper artifacts and private normalized fixtures.

## Real Helper Startup Preflight

The production helper startup path now runs a structured preflight before spawning the backend. It checks helper binary resolution and executability, normalized profile/runtime config compatibility, production config generation, concrete local SOCKS5 listen settings, and TUN upstream bypass readiness when TUN is enabled.

If preflight fails, the helper manager records a failed session with machine-readable diagnostics instead of spawning a process that is known to fail. The Amnezia details/debug view and diagnostics bundle show whether startup is blocked by a missing helper binary, permissions, platform/architecture mismatch, missing endpoint/key/profile fields, config generation failure, or TUN bypass resolution failure.

Real tunnel startup still requires a production helper binary supplied by the release/build process or `KOALA_AMNEZIA_HELPER_BACKEND_PATH`, a valid imported Amnezia WireGuard/AmneziaWG profile with endpoint, keys, interface addresses and allowed IPs, and normal platform permissions for the helper and Mihomo/TUN runtime.

## Format References

- Amnezia docs describe `.vpn` / `vpn://...` as the Amnezia app connection key format: https://docs.amnezia.org/documentation/supported-configuration-formats
- Amnezia's public config decoder shows `vpn://` payloads are base64url-decoded and `qUncompress` is attempted: https://github.com/amnezia-vpn/config-decoder
