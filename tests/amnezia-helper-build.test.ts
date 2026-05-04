import * as assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { buildAmneziaHelperArtifacts, parseBuildArgs } from '../scripts/amnezia-helper-build'

const winX64 = { platform: 'win32' as const, arch: 'x64' as const }

let cleanupTasks: Array<() => Promise<void>> = []

describe('Amnezia helper source build', () => {
  afterEach(async () => {
    const tasks = cleanupTasks
    cleanupTasks = []
    await Promise.all(tasks.map((task) => task()))
  })

  it('parses explicit build targets and output roots', () => {
    const options = parseBuildArgs([
      'build',
      '--source-dir',
      'native/amnezia-helper',
      '--output-root',
      'helper-artifacts',
      '--target',
      'win32',
      '--arch',
      'x64',
      '--compact'
    ])

    assert.equal(options.sourceDir, 'native/amnezia-helper')
    assert.equal(options.outputRoot, 'helper-artifacts')
    assert.deepEqual(options.targets, [winX64])
    assert.equal(options.compact, true)
  })

  it('fails clearly when the in-repo Go module is missing', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'koala-amnezia-helper-build-'))
    cleanupTasks.push(async () => rm(root, { recursive: true, force: true }))

    const report = await buildAmneziaHelperArtifacts({
      sourceDir: path.join(root, 'missing-helper'),
      outputRoot: path.join(root, 'helper-artifacts'),
      targets: [winX64]
    })

    assert.equal(report.summary.status, 'failed')
    assert.equal(report.failures[0].code, 'source_missing')
    assert.match(report.failures[0].message, /Go module is missing/)
  })
})
