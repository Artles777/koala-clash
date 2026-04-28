import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'

import {
  buildMacOSElevatedAppleScript,
  buildMacOSElevatedShellCommand,
  quotePosixShellArg
} from '../src/main/utils/elevation'

describe('macOS elevation command quoting', () => {
  it('quotes app bundle paths with spaces for service commands', () => {
    const servicePath =
      '/Users/sterog/WebstormProjects/koala-clash/dist/mac-arm64/Koala Clash.app/Contents/Resources/files/sparkle-service'

    assert.equal(
      buildMacOSElevatedShellCommand(servicePath, ['service', 'install']),
      `'${servicePath}' 'service' 'install'`
    )
  })

  it('escapes single quotes inside shell arguments', () => {
    assert.equal(
      quotePosixShellArg("/tmp/O'Brien/Koala Clash.app"),
      "'/tmp/O'\\''Brien/Koala Clash.app'"
    )
  })

  it('embeds the quoted shell command in an AppleScript administrator prompt', () => {
    const appleScript = buildMacOSElevatedAppleScript('/tmp/Koala Clash.app/service', [
      'service',
      'start'
    ])

    assert.equal(
      appleScript,
      `do shell script "'/tmp/Koala Clash.app/service' 'service' 'start'" with administrator privileges`
    )
  })
})
