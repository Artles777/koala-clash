import * as assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const contractPath = path.join(repoRoot, 'native/windows-process-bypass/contract.json')
const cmakePath = path.join(repoRoot, 'native/windows-process-bypass/CMakeLists.txt')
const wfpPolicyPath = path.join(repoRoot, 'native/windows-process-bypass/src/wfp_policy.cpp')

describe('Windows process bypass service contract', () => {
  it('keeps the controller command contract aligned with Koala runtime resolution', async () => {
    const contract = JSON.parse(await readFile(contractPath, 'utf-8')) as {
      serviceName: string
      controllerName: string
      commands: string[]
      koalaLaunchContract: Record<string, string[]>
    }

    assert.equal(contract.serviceName, 'KoalaProcessBypass')
    assert.equal(contract.controllerName, 'koala-process-bypassctl.exe')
    assert.deepEqual(contract.commands, ['status', 'apply', 'cleanup'])
    assert.equal(contract.koalaLaunchContract.apply[0], 'apply')
    assert.ok(contract.koalaLaunchContract.apply.includes('--process-name'))
    assert.equal(contract.koalaLaunchContract.cleanup[0], 'cleanup')
  })

  it('requires a real WFP callout data plane before reporting active bypass', async () => {
    const contract = JSON.parse(await readFile(contractPath, 'utf-8')) as {
      dataPlaneActiveRequires: string[]
      reasonCodes: string[]
    }
    const source = await readFile(wfpPolicyPath, 'utf-8')

    assert.ok(
      contract.dataPlaneActiveRequires.includes(
        'Koala WFP connect-redirect callout driver registered'
      )
    )
    assert.ok(contract.reasonCodes.includes('windows_data_plane_inactive'))
    assert.ok(source.includes('RequiredCalloutsAvailable'))
    assert.ok(source.includes('dataPlaneActive = true'))
    assert.ok(source.includes('windows_data_plane_inactive'))
  })

  it('builds separate service and controller Windows executables', async () => {
    const cmake = await readFile(cmakePath, 'utf-8')

    assert.ok(cmake.includes('add_executable(koala-process-bypassctl'))
    assert.ok(cmake.includes('add_executable(KoalaProcessBypass'))
    assert.ok(cmake.includes('fwpuclnt'))
  })
})
