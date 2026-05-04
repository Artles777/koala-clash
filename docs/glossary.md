# Glossary

## Helper

The external `amnezia-helper` process managed by Koala. It starts the
Amnezia/WireGuard runtime and exposes a local proxy endpoint that Mihomo can use.

## TUN

A virtual network interface mode where Mihomo captures system traffic. TUN can
route traffic that does not use the system proxy, but it also makes bypass rules
more platform-dependent.

## PROXY / VPN / PROXY

Send matching traffic to the proxy path. For VPN-owned rules, Koala shows this
as `VPN / PROXY` so users do not need to see internal helper target names.

## DIRECT

Ask Mihomo to connect directly. In non-TUN mode this is usually straightforward.
In TUN mode, true bypass may require runtime route exclusions or native
platform-specific process bypass.

## True Bypass

Traffic is excluded from the TUN capture path at the OS/network layer. This is
stronger than merely matching `DIRECT` inside Mihomo.

## Learned Bypass

Koala observes destination IPs for a process and temporarily injects those IPs as
runtime TUN exclusions. This is best-effort and expires with TTL.

## Fallback-Only

The platform does not currently have an active native process-bypass dataplane,
so Koala relies on address-based excludes and learned bypass.

## smoke_passed

A preset smoke check passed runtime checks such as helper readiness, routing
injection, UDP confidence, connectivity probe, and rule coverage. It is not a
guarantee of real voice/video quality.

## validated

A stronger evidence state. Usually it means a tester manually confirmed a real
app session on the current device/network, or future app-level evidence exists.
