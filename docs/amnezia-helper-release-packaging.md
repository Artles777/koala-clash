# Amnezia Helper Release Packaging

Phase 12 makes production helper delivery a repeatable build step. Runtime resolution is unchanged: packaged builds still load the helper from `resources/files/amnezia-helper/<platform>/<arch>/`.

## Source Artifact Contract

Release tooling expects helper artifacts under:

```text
helper-artifacts/amnezia-helper/<platform>/<arch>/amnezia-helper(.exe)
helper-artifacts/amnezia-helper/<platform>/<arch>/amnezia-helper(.exe).json
```

Required target names:

| Target         | Binary               |
| -------------- | -------------------- |
| `win32/x64`    | `amnezia-helper.exe` |
| `win32/arm64`  | `amnezia-helper.exe` |
| `darwin/x64`   | `amnezia-helper`     |
| `darwin/arm64` | `amnezia-helper`     |
| `linux/x64`    | `amnezia-helper`     |
| `linux/arm64`  | `amnezia-helper`     |

The adjacent `.json` manifest is optional but recommended:

```json
{
  "name": "amnezia-helper",
  "version": "0.1.0",
  "platform": "linux",
  "arch": "x64"
}
```

The manifest is used to detect platform or architecture mismatch before packaging.

## Preparing Artifacts

Prepare one target:

```bash
pnpm amnezia-helper:prepare -- --target linux --arch x64
```

Prepare the full desktop matrix:

```bash
pnpm amnezia-helper:prepare -- --all
```

Use an external source root:

```bash
pnpm amnezia-helper:prepare -- --source-root /path/to/helper-artifacts --target darwin-arm64
```

The script copies validated binaries into:

```text
extra/files/amnezia-helper/<platform>/<arch>/amnezia-helper(.exe)
extra/files/amnezia-helper/manifest.json
```

`extra/` is ignored by git and is consumed by `electron-builder` through `extraResources`.

## Build-Time Validation

The desktop build scripts now run helper preparation before `electron-builder`:

```bash
pnpm build:win
pnpm build:mac
pnpm build:linux
```

The required architecture is read from:

1. `KOALA_AMNEZIA_HELPER_TARGET_ARCH`
2. `npm_config_target_arch`
3. `npm_config_arch`
4. `process.arch`

This matches the existing GitHub build matrix, which already sets `npm_config_target_arch`.

The build is blocked when:

- the source helper binary is missing
- the filename/layout does not match the target
- the file is not executable on Linux/macOS or not readable on Windows
- the optional manifest declares a different platform or arch
- staged validation fails after copy
- `--self-check` is requested and the helper `version` command exits non-zero

Validate an already staged layout:

```bash
pnpm amnezia-helper:validate -- --target linux-x64
```

## Generated Manifest

Preparation writes `extra/files/amnezia-helper/manifest.json`:

```json
{
  "schemaVersion": 1,
  "generatedAt": 1710000000000,
  "sourceRoot": "/repo/helper-artifacts",
  "stagingRoot": "/repo/extra/files",
  "artifacts": [
    {
      "platform": "linux",
      "arch": "x64",
      "sourcePath": "/repo/helper-artifacts/amnezia-helper/linux/x64/amnezia-helper",
      "packagedPath": "/repo/extra/files/amnezia-helper/linux/x64/amnezia-helper",
      "checksumSha256": "...",
      "sizeBytes": 123456,
      "helperManifest": {
        "name": "amnezia-helper",
        "version": "0.1.0",
        "platform": "linux",
        "arch": "x64"
      }
    }
  ]
}
```

The manifest is for build diagnostics and release auditability. Runtime helper resolution does not depend on it.

## Connection To Smoke Verification

After packaging, run the phase 11 smoke workflow against the packaged app:

```bash
pnpm amnezia-helper:smoke -- --packaged-app-path <installed-app> --spawn-self-check --report-path smoke-report.json
```

Preparation validates that the expected helper artifact is packaged. Smoke verification proves that the packaged app can resolve, start, monitor, validate, and clean up that helper on the target OS.

## Release Readiness

A release is not ready until every shipped desktop target has:

- a prepared helper artifact
- a generated manifest entry
- a successful platform build
- a passing packaged smoke report using the real production helper
- a private fixture run against a real Amnezia endpoint where production connectivity is claimed
