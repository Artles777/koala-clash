# Amnezia Helper First Local Run

This checklist is for the first local Koala Clash run with a bundled
`amnezia-helper` production binary.

## Preconditions

- The helper source is present under `native/amnezia-helper/`.
- The helper artifact is generated and staged under
  `extra/files/amnezia-helper/<platform>/<arch>/amnezia-helper(.exe)`.
- `pnpm amnezia-helper:prepare` and `pnpm amnezia-helper:validate` pass for the
  current platform and architecture. `prepare` builds the helper first unless an
  external source root or `--skip-build` is used.
- `KOALA_AMNEZIA_HELPER_BACKEND_PATH` is unset unless an explicit development
  override is intended.
- The active profile is an imported Amnezia/VPN profile backed by a
  self-contained AmneziaWG/WireGuard config.
- API-only or gateway-expansion profiles are expected to be rejected by the
  helper v1 contract.
- Either TUN mode or app proxy mode is enabled. If both are disabled, Koala
  stops the helper with `runtime_disabled`.

## Expected Bring-Up Flow

1. Start Koala in development mode.
2. Import or select a self-contained Amnezia/VPN profile.
3. Make that profile current.
4. Enable TUN mode or proxy mode.
5. Open the Amnezia profile details/debug view.
6. Confirm support/backend state:
   - backend mode: `production`
   - helper source: `bundled`
   - backend state: available/production
   - helper version/checksum: populated
   - managed by app: yes
   - desired state: running
7. Confirm startup/session state:
   - status moves from `starting` to `running`
   - config status is `generated`
   - local proxy endpoint is shown
   - helper logs include `proxy.listening`
   - helper logs include `readiness.handshake_pending`
   - startup diagnostics include the corresponding readable messages
8. Send traffic through the helper path, or run the UI `Test connection` action.
9. Confirm traffic validation:
   - helper logs include `handshake.observed`
   - helper logs include `helper.ready`
   - connectivity status becomes `verified`

## Readiness Semantics

The standalone helper emits `helper.ready` only after a real peer handshake is
observed.

Koala marks the helper session as route-ready after `proxy.listening` so Mihomo
can inject and use the local SOCKS endpoint. This is intentional: without
routing or a connectivity test, no traffic may reach the helper, and a handshake
may never be observed.

For first-run validation, treat the stages this way:

- `proxy.listening`: the local helper proxy can be routed to.
- `readiness.handshake_pending`: backend and proxy are running, but no peer
  handshake has been seen yet.
- `handshake.observed`: real tunnel traffic reached the peer.
- `helper.ready`: the standalone helper considers the tunnel ready.
- `connectivity.verified`: Koala's validation request succeeded through the
  helper proxy.

## Common Blockers By Stage

### Bundled Helper Not Detected

Likely causes:

- artifact was not staged into `extra/files`
- wrong platform/architecture directory
- executable bit is missing on macOS/Linux
- `KOALA_AMNEZIA_HELPER_BACKEND_PATH` points to a broken override
- manifest platform/arch does not match the current host

Check the support section for backend source, helper version, checksum, and
startup preflight backend status.

### Helper Does Not Autostart

Likely causes:

- current profile is not an Amnezia/VPN profile
- TUN mode and proxy mode are both disabled
- profile runtime capability is not activatable
- startup preflight is blocked

Koala starts the helper from profile/runtime synchronization, not from a
separate manual daemon.

### Config Generation Fails

Likely causes:

- imported profile is API-only or requires gateway expansion
- endpoint host/port is missing
- interface private key is missing
- peer public key is missing
- required interface address/allowed IP fields are missing

The v1 helper only supports self-contained AmneziaWG/WireGuard profiles.

### TUN Bypass Blocks Startup

Likely causes:

- TUN is enabled and the upstream endpoint hostname cannot be resolved
- endpoint resolves to no usable IP addresses
- DNS is unavailable during preflight

Koala blocks helper startup under TUN when it cannot inject upstream
route-exclude addresses, because starting anyway can create a routing loop.

### `proxy.listening` Is Missing

Likely causes:

- helper process did not spawn
- macOS blocked execution or permissions are wrong
- local SOCKS port bind failed
- helper config was rejected before listener startup

Check helper logs for raw JSONL event/code values such as `helper.error`,
`socks_bind_failed`, or `backend_start_failed`. Startup diagnostics show the
same failures as readable messages.

### Stuck At `readiness.handshake_pending`

Likely causes:

- no traffic has been sent through the helper yet
- helper rule does not match the target host
- Mihomo has not injected the helper outbound/group
- upstream Amnezia endpoint is unreachable
- keys or peer configuration are invalid
- another VPN/TUN route is interfering
- UDP is blocked on the network path

Run `Test connection` from the profile details view to force a controlled
validation request through the local helper proxy.

### Connectivity Validation Fails

Likely causes by validation stage:

- `tcp_connect`: Koala cannot reach the local SOCKS endpoint.
- `socks5_handshake`: local proxy is reachable, but SOCKS negotiation failed.
- `upstream_request`: SOCKS worked, but the helper could not complete the
  outbound request through the tunnel.

Use the latest validation result, runtime diagnostics, and helper logs in the
support/debug view to separate local proxy issues from upstream tunnel issues.
