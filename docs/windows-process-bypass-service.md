# Windows Process Bypass Service

Koala's Windows native process bypass uses a service/controller architecture:

- service: `KoalaProcessBypass`
- controller: `koala-process-bypassctl.exe`

Koala calls the controller with:

```powershell
koala-process-bypassctl.exe apply --session <id> --service KoalaProcessBypass --json --process-name <name>
koala-process-bypassctl.exe cleanup --session <id> --service KoalaProcessBypass --json
```

The controller must return a machine-readable JSON object. Koala only enables `true_bypass` when
that object contains:

```json
{
  "ok": true,
  "dataPlaneActive": true
}
```

## Why WFP Callouts Are Required

The Windows Filtering Platform user-mode management API can add filters for an application identity
such as `FWPM_CONDITION_ALE_APP_ID`. That is useful for matching a process, but a normal permit
filter does not reroute traffic around a Wintun/TUN default route.

For real process-aware bypass, the MVP targets WFP connect-redirection layers and requires a
registered Koala callout data-plane driver. If that callout is missing, the controller reports:

```json
{
  "ok": false,
  "dataPlaneActive": false,
  "reasonCode": "windows_data_plane_inactive"
}
```

This is intentional. It keeps the app honest and leaves learned process-to-IP bypass as fallback.

## Build And Install

Build on Windows:

```powershell
cmake -S native/windows-process-bypass -B native/windows-process-bypass/build -A x64
cmake --build native/windows-process-bypass/build --config Release
```

Install from an elevated shell:

```powershell
.\KoalaProcessBypass.exe install
Start-Service KoalaProcessBypass
```

## MVP Scope

Implemented now:

- controller commands: `status`, `apply`, `cleanup`
- elevated/admin detection
- service detection
- WFP engine/provider/sublayer setup
- exact process-name to executable path lookup
- per-session WFP filter apply/cleanup
- JSON diagnostics aligned with Koala's current contract
- no false `dataPlaneActive` without callout registration

Still required before Windows can be considered end-to-end native true bypass:

- signed WFP callout driver that performs the actual connect-redirection/bypass data-plane
- installer/signing flow
- packaged Windows smoke validation with a real TUN scenario
- future-process tracking or reapply loop for newly started processes
