# amnezia-helper v1 Contract

## Purpose

`amnezia-helper` is a standalone desktop helper process for Koala Clash. It
must consume a normalized self-contained AmneziaWG/WireGuard profile, start a
userspace backend, expose a local proxy endpoint, and report readiness and
diagnostics through machine-readable logs.

It must not own system-wide TUN, system routes, or DNS. Koala Clash keeps
Mihomo as the routing core.

## CLI

```sh
amnezia-helper check --config <path>
amnezia-helper check-connectivity --config <path> (--url <http-url|https-url> | --target <host:port>)
amnezia-helper run --config <path> [--listen <host:port>] [--stub-backend]
amnezia-helper version
```

`check`
: Parses and validates the config. It does not start any listener or backend.

`check-connectivity`
: Starts the real userspace backend and local SOCKS5 listener, then proves
  outbound TCP through that SOCKS endpoint. `--url` performs a real HTTP(S)
  request and is the full end-to-end proof path. `--target` checks TCP CONNECT
  only and emits `connectivity.request_skipped`.

`run`
: Starts the helper runtime. By default it starts the userspace AmneziaWG
  backend and a local SOCKS5 TCP listener. `--stub-backend` can be used by
  developers to test process lifecycle and listener binding only.

`version`
: Prints helper version metadata.

## Config File Format

Config is JSON. YAML can be added later by Koala before invoking the helper.

Required top-level shape:

```json
{
  "version": 1,
  "profile": {
    "type": "amneziawg",
    "sourceKind": "self_contained",
    "name": "example",
    "keys": {
      "privateKey": "...",
      "serverPublicKey": "...",
      "presharedKey": "..."
    },
    "endpoint": {
      "host": "example.com",
      "port": 51820
    },
    "interface": {
      "addresses": ["10.8.1.2/32"],
      "mtu": 1376,
      "dns": ["1.1.1.1"]
    },
    "peer": {
      "allowedIPs": ["0.0.0.0/0", "::/0"],
      "persistentKeepalive": 25
    },
    "amnezia": {
      "Jc": "3",
      "Jmin": "10",
      "Jmax": "30",
      "S1": "15",
      "S2": "18",
      "H1": "1020325451",
      "H2": "3288052141",
      "H3": "1766607858",
      "H4": "2528465083"
    }
  },
  "localProxy": {
    "listenHost": "127.0.0.1",
    "listenPort": 0,
    "protocols": ["socks5"],
    "udp": true
  }
}
```

## Required Runtime Fields

For `profile.type = "amneziawg"` or `"wireguard"`:

- `version = 1`
- `profile.sourceKind = "self_contained"`
- `profile.keys.privateKey`
- `profile.keys.serverPublicKey`
- `profile.endpoint.host`
- `profile.endpoint.port`
- `profile.interface.addresses[]`
- `profile.peer.allowedIPs[]`
- `localProxy.listenHost`
- `localProxy.listenPort` (`0` means OS-assigned)

## Optional Runtime Fields

- `profile.name`
- `profile.keys.presharedKey`
- `profile.interface.mtu`
- `profile.interface.dns[]`
- `profile.peer.persistentKeepalive`
- AmneziaWG obfuscation fields:
  - `Jc`, `Jmin`, `Jmax`
  - `S1`, `S2`, `S3`, `S4`
  - `H1`, `H2`, `H3`, `H4`
  - `I1`, `I2`, `I3`, `I4`, `I5`
- `localProxy.udp`
- `diagnostics.logLevel`

`localProxy.udp = true` enables SOCKS5 UDP ASSOCIATE support. Koala still treats
UDP as usable only after a runtime UDP ASSOCIATE validation succeeds.

SOCKS5 CONNECT with domain names relies on `profile.interface.dns[]` because
name resolution happens inside the userspace netstack. If no DNS servers are
provided, the helper emits `backend.dns_missing`; IP-target CONNECT can still
work.

## Unsupported v1 Inputs

- API-only / gateway-expansion `vpn://` profiles
- unknown config fields
- profiles without embedded `containers` / `last_config` equivalent data
- OpenVPN, Cloak, Shadowsocks, Xray, IKEv2
- system-wide TUN ownership
- route/DNS mutation
- split tunneling inside the helper

## Readiness Signals

The helper writes newline-delimited JSON events to stdout.

Important events:

- `helper.starting`
- `config.validated`
- `backend.starting`
- `backend.config_mapped`
- `backend.started`
- `proxy.listening`
- `readiness.handshake_pending`
- `handshake.observed`
- `helper.ready`
- `helper.stopping`
- `helper.stopped`
- `helper.error`

`readiness.handshake_pending` means the backend process path and local SOCKS5
listener are up, but no peer handshake has been observed yet. `helper.ready` is
emitted only after a handshake is observed through `amneziawg-go` status.

## Connectivity Proof Signals

`helper.ready` means the backend, SOCKS listener, and peer handshake are ready.
It does not by itself prove an application request completed.

`check-connectivity --url ...` emits these additional stage events:

- `connectivity.starting`
- `connectivity.tcp_connect_succeeded`
- `connectivity.request_succeeded`
- `connectivity.verified`

`connectivity.verified` means the helper started, SOCKS CONNECT succeeded,
an HTTP(S) request returned an HTTP response, and a peer handshake was observed.
If any stage fails, the command exits non-zero and emits a machine-readable
failure event.

Relevant failure codes:

- `handshake_timeout`
- `socks_connect_failed`
- `socks_handshake_failed`
- `backend_dial_failed`
- `remote_tcp_connect_failed`
- `request_timeout`

## stderr / stdout

- stdout: machine-readable JSONL diagnostics only
- stderr: human-readable developer/debug logs and raw backend logs

## Exit Codes

- `0`: clean exit
- `2`: invalid CLI arguments
- `10`: invalid config
- `11`: unsupported profile
- `12`: profile requires gateway expansion
- `20`: backend start failed
- `21`: local SOCKS bind failed
- `22`: readiness timeout
- `23`: handshake not observed
- `24`: local SOCKS connect failed
- `25`: SOCKS handshake failed
- `26`: backend/remote TCP dial failed
- `27`: request failed or timed out
- `30`: internal error

## Stop / Cleanup

The process must handle SIGINT and SIGTERM by:

- stopping local proxy listener
- stopping the userspace backend
- releasing temp runtime files
- emitting `helper.stopping` and `helper.stopped`
- exiting with code `0` when cleanup succeeds

No system routes, DNS settings, or TUN interfaces should be modified by this
helper.
