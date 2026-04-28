import * as assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const nativeRoot = path.join(repoRoot, 'native/macos-process-bypass')
const contractPath = path.join(nativeRoot, 'contract.json')

describe('macOS process bypass native scaffold contract', () => {
  it('defines a controller contract without claiming an active data plane', async () => {
    const contract = JSON.parse(await readFile(contractPath, 'utf-8')) as {
      component: string
      controllerName: string
      providerStrategy: string
      commands: string[]
      jsonFields: string[]
      currentTruth: { dataPlaneActive: boolean; fallbackOnly: boolean }
    }

    assert.equal(contract.component, 'koala-macos-process-bypass')
    assert.equal(contract.controllerName, 'koala-macos-process-bypassctl')
    assert.equal(contract.providerStrategy, 'NETransparentProxyProvider')
    assert.deepEqual(contract.commands, ['status', 'apply', 'cleanup'])
    assert.ok(contract.jsonFields.includes('entitlementsPresent'))
    assert.ok(contract.jsonFields.includes('extensionInstalled'))
    assert.ok(contract.jsonFields.includes('dataPlaneActive'))
    assert.equal(contract.currentTruth.dataPlaneActive, false)
    assert.equal(contract.currentTruth.fallbackOnly, true)
  })

  it('documents signing, entitlement, approval, and provider requirements', async () => {
    const contract = JSON.parse(await readFile(contractPath, 'utf-8')) as {
      dataPlaneActiveRequires: string[]
      reasonCodes: string[]
    }
    const docs = await readFile(path.join(repoRoot, 'docs/macos-process-bypass-native.md'), 'utf-8')

    assert.ok(
      contract.dataPlaneActiveRequires.includes(
        'com.apple.developer.networking.networkextension entitlement with app-proxy-provider-systemextension'
      )
    )
    assert.ok(contract.dataPlaneActiveRequires.includes('user approved the System Extension'))
    assert.ok(contract.reasonCodes.includes('macos_user_approval_required'))
    assert.ok(contract.reasonCodes.includes('macos_data_plane_pending'))
    assert.ok(docs.includes('com.apple.developer.system-extension.install'))
    assert.ok(docs.includes('app-proxy-provider-systemextension'))
  })

  it('keeps the provider scaffold safe by letting flows pass through unless implemented', async () => {
    const provider = await readFile(
      path.join(nativeRoot, 'Sources/KoalaMacProcessBypassProvider/TransparentProxyProvider.swift'),
      'utf-8'
    )
    const controller = await readFile(
      path.join(nativeRoot, 'Sources/KoalaMacProcessBypassController/main.swift'),
      'utf-8'
    )

    assert.ok(provider.includes('NETransparentProxyProvider'))
    assert.ok(provider.includes('handleNewFlow'))
    assert.ok(provider.includes('return false'))
    assert.ok(controller.includes('dataPlaneActive: false'))
    assert.ok(controller.includes('fallbackOnly: true'))
  })

  it('keeps the scaffold separate from Koala runtime integration', async () => {
    const packageFile = await readFile(path.join(nativeRoot, 'Package.swift'), 'utf-8')
    const docs = await readFile(path.join(repoRoot, 'docs/macos-process-bypass-native.md'), 'utf-8')

    assert.ok(packageFile.includes('koala-macos-process-bypassctl'))
    assert.ok(packageFile.includes('KoalaMacProcessBypassProvider'))
    assert.ok(docs.includes('Nothing in this phase should make Koala claim macOS `true_bypass`.'))
  })
})
