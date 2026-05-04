import * as assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, it } from 'node:test'
import {
  AmneziaHelperArtifactReport,
  AmneziaHelperArtifactTarget,
  getAmneziaHelperArtifactSourcePath,
  getAmneziaHelperArtifactStagedPath,
  normalizeAmneziaHelperArtifactTarget,
  prepareAmneziaHelperArtifacts,
  validatePreparedAmneziaHelperArtifacts
} from '../src/main/runtime/amnezia-helper-artifacts'

const winX64: AmneziaHelperArtifactTarget = { platform: 'win32', arch: 'x64' }

let cleanupTasks: Array<() => Promise<void>> = []

describe('Amnezia helper artifact packaging', () => {
  afterEach(async () => {
    const tasks = cleanupTasks
    cleanupTasks = []
    await Promise.all(tasks.map((task) => task()))
  })

  it('normalizes target specs for the release matrix', () => {
    assert.deepEqual(normalizeAmneziaHelperArtifactTarget('win32-x64'), [winX64])
    assert.deepEqual(normalizeAmneziaHelperArtifactTarget('linux', 'arm64'), [
      { platform: 'linux', arch: 'arm64' }
    ])
    assert.equal(normalizeAmneziaHelperArtifactTarget('all').length, 6)
    assert.throws(() => normalizeAmneziaHelperArtifactTarget('android-arm64'), /Unsupported/)
  })

  it('validates, stages, and manifests a helper artifact', async () => {
    const { sourceRoot, stagingRoot } = await createTempLayout()
    await createSourceArtifact(sourceRoot, winX64)

    const report = await prepareAmneziaHelperArtifacts({
      sourceRoot,
      stagingRoot,
      targets: [winX64]
    })
    const stagedPath = getAmneziaHelperArtifactStagedPath({ stagingRoot, target: winX64 })
    const manifestPath = path.join(stagingRoot, 'amnezia-helper', 'manifest.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as {
      artifacts: Array<{ checksumSha256: string; platform: string; arch: string }>
    }

    assert.equal(report.summary.status, 'passed')
    assert.equal(report.summary.prepared, 1)
    assert.equal(existsSync(stagedPath), true)
    assert.equal(existsSync(`${stagedPath}.json`), true)
    assert.equal(manifest.artifacts.length, 1)
    assert.equal(manifest.artifacts[0].platform, 'win32')
    assert.equal(manifest.artifacts[0].arch, 'x64')
    assert.equal(manifest.artifacts[0].checksumSha256, report.artifacts[0].checksumSha256)

    const validation = await validatePreparedAmneziaHelperArtifacts({
      stagingRoot,
      targets: [winX64]
    })
    assert.equal(validation.summary.status, 'passed')
    assert.equal(validation.summary.validated, 1)
  })

  it('skips the helper-artifacts/amnezia-helper directory when resolving nested binaries', async () => {
    const { sourceRoot } = await createTempLayout()
    const sourcePath = await createSourceArtifact(sourceRoot, winX64)

    assert.equal(
      getAmneziaHelperArtifactSourcePath({
        sourceRoot,
        target: winX64
      }),
      sourcePath
    )
  })

  it('fails clearly when a required source artifact is missing', async () => {
    const { sourceRoot, stagingRoot } = await createTempLayout()

    const report = await prepareAmneziaHelperArtifacts({
      sourceRoot,
      stagingRoot,
      targets: [winX64]
    })

    assert.equal(report.summary.status, 'failed')
    assert.ok(report.failures.some((failure) => failure.code === 'missing'))
    assert.equal(report.artifacts[0].sourcePath?.endsWith('amnezia-helper.exe'), true)
  })

  it('detects source manifest platform or architecture mismatch', async () => {
    const { sourceRoot, stagingRoot } = await createTempLayout()
    await createSourceArtifact(sourceRoot, winX64, { arch: 'arm64' })

    const report = await prepareAmneziaHelperArtifacts({
      sourceRoot,
      stagingRoot,
      targets: [winX64]
    })

    assert.equal(report.summary.status, 'failed')
    assert.ok(report.failures.some((failure) => failure.code === 'arch_mismatch'))
  })

  it('detects staged checksum mismatch during build validation', async () => {
    const { sourceRoot, stagingRoot } = await createTempLayout()
    await createSourceArtifact(sourceRoot, winX64)
    await prepareAmneziaHelperArtifacts({ sourceRoot, stagingRoot, targets: [winX64] })
    const stagedPath = getAmneziaHelperArtifactStagedPath({ stagingRoot, target: winX64 })
    await writeFile(stagedPath, 'tampered-helper', 'utf-8')

    const validation = await validatePreparedAmneziaHelperArtifacts({
      stagingRoot,
      targets: [winX64]
    })

    assert.equal(validation.summary.status, 'failed')
    assert.ok(validation.failures.some((failure) => failure.code === 'checksum_mismatch'))
  })

  it('emits JSON from the artifact preparation CLI', async () => {
    const { sourceRoot, stagingRoot } = await createTempLayout()
    await createSourceArtifact(sourceRoot, winX64)

    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        'scripts/amnezia-helper-artifacts.ts',
        'prepare',
        '--',
        '--source-root',
        sourceRoot,
        '--staging-root',
        stagingRoot,
        '--target',
        'win32-x64',
        '--compact'
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf-8'
      }
    )

    assert.equal(result.status, 0, result.stderr)
    const report = JSON.parse(result.stdout) as AmneziaHelperArtifactReport
    assert.equal(report.summary.status, 'passed')
    assert.equal(report.artifacts[0].platform, 'win32')
    assert.equal(report.artifacts[0].arch, 'x64')
  })
})

async function createTempLayout(): Promise<{ sourceRoot: string; stagingRoot: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'koala-amnezia-artifacts-'))
  cleanupTasks.push(async () => rm(root, { recursive: true, force: true }))
  return {
    sourceRoot: path.join(root, 'helper-artifacts'),
    stagingRoot: path.join(root, 'extra', 'files')
  }
}

async function createSourceArtifact(
  sourceRoot: string,
  target: AmneziaHelperArtifactTarget,
  manifestOverride: Partial<Record<'platform' | 'arch' | 'version', string>> = {}
): Promise<string> {
  const binaryName = target.platform === 'win32' ? 'amnezia-helper.exe' : 'amnezia-helper'
  const binaryPath = path.join(
    sourceRoot,
    'amnezia-helper',
    target.platform,
    target.arch,
    binaryName
  )
  await mkdir(path.dirname(binaryPath), { recursive: true })
  await writeFile(binaryPath, 'test-helper-binary', 'utf-8')
  await chmod(binaryPath, 0o755)
  await writeFile(
    `${binaryPath}.json`,
    JSON.stringify(
      {
        name: 'amnezia-helper',
        version: manifestOverride.version ?? '0.0.0-test',
        platform: manifestOverride.platform ?? target.platform,
        arch: manifestOverride.arch ?? target.arch
      },
      null,
      2
    ),
    'utf-8'
  )
  return binaryPath
}
