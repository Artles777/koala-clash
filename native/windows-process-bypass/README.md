# Koala Windows Process Bypass

This directory contains the Windows-native service/controller MVP for Koala's
`PROCESS-NAME,DIRECT` native bypass contract.

It does not change Mihomo core. Koala still owns the high-level policy and only treats Windows
native process bypass as active when `koala-process-bypassctl.exe` returns `dataPlaneActive: true`.

## Components

- `KoalaProcessBypass.exe`: Windows service host. The MVP service is intentionally small and
  provides the privileged installed service prerequisite expected by Koala.
- `koala-process-bypassctl.exe`: elevated controller CLI used by Koala.
- WFP policy manager: user-mode WFP management code that installs per-session, exact-process
  filters.

## Data Plane Choice

The MVP uses Windows Filtering Platform with `ALE_CONNECT_REDIRECT` layers. A plain user-mode WFP
permit/block filter cannot bypass a TUN route. Because of that, this controller refuses to report
`dataPlaneActive: true` unless the required Koala WFP connect-redirect callouts are already
registered by a privileged data-plane driver.

This is deliberate. It prevents Koala from claiming true bypass when only management-plane filters
exist.

## Controller Commands

```powershell
koala-process-bypassctl.exe status --service KoalaProcessBypass --json
koala-process-bypassctl.exe apply --session <id> --service KoalaProcessBypass --json --process-name Telegram.exe
koala-process-bypassctl.exe cleanup --session <id> --service KoalaProcessBypass --json
```

All commands return one JSON object. Koala consumes at least:

- `ok`
- `serviceAvailable`
- `elevated`
- `prerequisitesOk`
- `dataPlaneActive`
- `reasonCode`
- `message`
- `diagnostics`
- `appliedProcessNames`

## Build

Build on Windows with Visual Studio Build Tools and CMake:

```powershell
cmake -S native/windows-process-bypass -B native/windows-process-bypass/build -A x64
cmake --build native/windows-process-bypass/build --config Release
```

## Install Service

Run from an elevated shell:

```powershell
.\KoalaProcessBypass.exe install
Start-Service KoalaProcessBypass
```

Uninstall:

```powershell
Stop-Service KoalaProcessBypass
.\KoalaProcessBypass.exe uninstall
```

## Current MVP Limitations

- Exact process-name matching only.
- Applies to currently running processes only.
- Requires a separate WFP callout driver for real connect-redirection data-plane behavior.
- Without the callout driver, `apply` returns `windows_data_plane_inactive` and
  `dataPlaneActive: false`.
- No macOS or Linux behavior is implemented in this component.

## Cleanup

`apply` stores session filter IDs under:

```text
%ProgramData%\KoalaClash\ProcessBypass\sessions\<session>.filters
```

`cleanup` deletes those filters and removes the session file. Missing filters are treated as
already cleaned.
