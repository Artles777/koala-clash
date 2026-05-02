# Phase 27c Connectivity Proof

## What Counts as Ready

`helper.ready` means:

- config was accepted and mapped to `amneziawg-go`
- the userspace backend started
- the local SOCKS5 listener is bound
- `amneziawg-go` reports an observed peer handshake

This is runtime readiness. It is not the same thing as a completed application
request.

## What Counts as Traffic Verified

`connectivity.verified` means:

- backend startup completed
- SOCKS5 listener is reachable
- SOCKS5 TCP CONNECT to the target succeeded
- for `--url`, an HTTP(S) request returned an HTTP response
- peer handshake was observed

The helper does not emit `connectivity.verified` for partial states.

## Running the First Real Test

Install Go `1.24.4+`, then build/test:

```sh
cd /Users/sterog/WebstormProjects/amnezia-helper
go test ./...
go build ./cmd/amnezia-helper
```

Use a private, real, self-contained AmneziaWG/WireGuard config:

```sh
./amnezia-helper check-connectivity \
  --config /path/to/real-self-contained-awg.json \
  --url https://example.com/ \
  --timeout 90s \
  --handshake-timeout 45s
```

For TCP-only diagnosis without an HTTP request:

```sh
./amnezia-helper check-connectivity \
  --config /path/to/real-self-contained-awg.json \
  --target example.com:443
```

TCP-only mode emits `connectivity.request_skipped`, so it is not a full request
proof.

## Failure Codes

- `handshake_timeout`: traffic was attempted, but no peer handshake was observed
  before timeout.
- `socks_connect_failed`: the helper could not connect to its local SOCKS
  listener.
- `socks_handshake_failed`: SOCKS5 negotiation failed.
- `backend_dial_failed`: the SOCKS listener could not open the target through
  the userspace backend.
- `remote_tcp_connect_failed`: SOCKS CONNECT returned a non-success reply.
- `request_timeout`: the TCP path opened, but HTTP/TLS request verification
  failed or timed out.

## Automatic vs Manual Coverage

Unit tests cover URL parsing, local SOCKS client behavior, HTTP request proof
through a local SOCKS listener, and diagnostic shape. Real AmneziaWG traffic
still requires a private endpoint and cannot be honestly faked in normal unit
tests.
