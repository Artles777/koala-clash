# Amnezia Helper UDP Capability

Phase 19 makes AMNEZIA_HELPER UDP support explicit instead of assuming it.

## What Is Known

The helper path exposes a local SOCKS5 proxy endpoint. Before this phase, the generated Mihomo runtime outbound always included `udp: true` for `AMNEZIA_HELPER_PROXY`.

That was too optimistic because the existing validation flow only checked:

- local TCP connect to the helper proxy;
- SOCKS5 greeting;
- SOCKS5 TCP `CONNECT`;
- HTTP request through the TCP proxy path.

It did not validate SOCKS5 UDP support.

## Capability Model

The app now tracks:

- `udpSupport`: `supported`, `unsupported`, or `unknown`;
- `udpValidated`: whether validation confirmed the status;
- `udpReasonCode`;
- `udpExplanation`;
- `runtimeAdvertisesUdp`.

`AMNEZIA_HELPER_PROXY` advertises UDP only when `udpSupport === "supported"` and `udpValidated === true`.

If UDP is unknown or unsupported, the generated runtime outbound is TCP-only:

```yaml
proxies:
  - name: AMNEZIA_HELPER_PROXY
    type: socks5
    server: 127.0.0.1
    port: 19080
    udp: false
```

## Validation

The current UDP validation performs a SOCKS5 `UDP ASSOCIATE` check against the helper local proxy endpoint.

This proves that the local helper proxy accepts SOCKS5 UDP association. It does not yet prove end-to-end UDP traffic through the Amnezia upstream server.

## Diagnostics

Support snapshots, smoke reports, and matrix rows include UDP capability fields. The UI shows a warning when the helper routing target is downgraded to TCP-only.

Common reason codes:

- `backend_capability_unknown`: backend contract does not declare UDP support yet.
- `udp_associate_validated`: SOCKS5 UDP ASSOCIATE succeeded.
- `udp_associate_rejected`: SOCKS5 UDP ASSOCIATE was rejected.
- `udp_validation_failed`: validation could not complete.
- `udp_validation_timeout`: validation timed out.
- `stub_backend`: stub mode cannot support UDP.

## Remaining Work

- End-to-end UDP datagram validation through the helper.
- Backend manifest or self-check capability declaration.
- Long-running UDP stability checks under TUN.
- Platform smoke results with real production helper binaries.
