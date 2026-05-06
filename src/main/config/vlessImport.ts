import { createHash } from 'crypto'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { parseVlessUri } from '../../shared/lib/vless/parser'
import { VlessParseError } from '../../shared/lib/vless/types'
import { createVlessDisplayName, createVlessMihomoYaml } from '../../shared/lib/vless/to-mihomo'

const execFileAsync = promisify(execFile)

export type VlessImportErrorCode = 'parse_failed' | 'duplicate_import' | 'mihomo_validation_failed'

export class VlessImportError extends Error {
  constructor(
    public readonly code: VlessImportErrorCode,
    message: string,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'VlessImportError'
  }
}

export interface PreparedVlessImport {
  raw: string
  profile: Partial<ProfileItem> & Pick<ProfileItem, 'id' | 'name' | 'type'>
  yaml: string
}

export interface VlessImportRuntime {
  now: () => number
  validateMihomoYaml: (yaml: string) => Promise<void>
  getProfileConfig: () => Promise<ProfileConfig>
  setProfileConfig: (config: ProfileConfig) => Promise<void>
  createProfile: (item: Partial<ProfileItem>) => Promise<ProfileItem>
  changeCurrentProfile: (id: string) => Promise<void>
}

export function prepareVlessImport(rawInput: string, now = Date.now()): PreparedVlessImport {
  const raw = rawInput.trim()
  const parsed = parseVlessUri(raw)

  if (!parsed.ok) {
    throw new VlessImportError(
      'parse_failed',
      `Unsupported VLESS URI: ${formatVlessParseErrors(parsed.errors)}`,
      parsed.errors
    )
  }

  const fingerprint = createHash('sha256').update(raw).digest('hex')
  const id = `vless-${fingerprint.slice(0, 16)}`
  const yaml = createVlessMihomoYaml(parsed.draft)

  return {
    raw,
    yaml,
    profile: {
      id,
      name: createVlessDisplayName(parsed.draft),
      type: 'local',
      sourceType: 'vless_uri',
      file: yaml,
      autoUpdate: false,
      updated: now
    }
  }
}

export async function importVlessUri(
  raw: string,
  runtime = createDefaultVlessImportRuntime()
): Promise<ProfileItem> {
  const prepared = prepareVlessImport(raw, runtime.now())
  const config = await runtime.getProfileConfig()

  if (config.items?.some((item) => item.id === prepared.profile.id)) {
    throw new VlessImportError('duplicate_import', 'This VLESS link has already been imported')
  }

  await runtime.validateMihomoYaml(prepared.yaml)

  const profileItem = await runtime.createProfile(prepared.profile)
  if (!config.items) config.items = []
  config.items.push(profileItem)
  await runtime.setProfileConfig(config)

  if (!config.current) {
    await runtime.changeCurrentProfile(profileItem.id)
  }

  return profileItem
}

export function createDefaultVlessImportRuntime(): VlessImportRuntime {
  return {
    now: () => Date.now(),
    validateMihomoYaml: validateVlessMihomoYaml,
    getProfileConfig: async () => {
      const { getProfileConfig } = await import('./profile')
      return getProfileConfig()
    },
    setProfileConfig: async (config) => {
      const { setProfileConfig } = await import('./profile')
      return setProfileConfig(config)
    },
    createProfile: async (item) => {
      const { createProfile } = await import('./profile')
      return createProfile(item)
    },
    changeCurrentProfile: async (id) => {
      const { changeCurrentProfile } = await import('./profile')
      return changeCurrentProfile(id)
    }
  }
}

export async function validateVlessMihomoYaml(yaml: string): Promise<void> {
  const { mihomoCorePath } = await import('../utils/dirs')
  const corePath = mihomoCorePath('mihomo')
  const encodedConfig = Buffer.from(yaml).toString('base64')

  try {
    await execFileAsync(corePath, ['-t', '-config', encodedConfig], {
      timeout: 10000,
      maxBuffer: 1024 * 1024
    })
  } catch (error) {
    const details = getExecErrorDetails(error)
    throw new VlessImportError(
      'mihomo_validation_failed',
      `Generated VLESS Mihomo profile failed validation: ${details}`,
      details
    )
  }
}

function formatVlessParseErrors(errors: VlessParseError[]): string {
  return errors.map((error) => `${error.path}: ${error.message}`).join('; ')
}

function getExecErrorDetails(error: unknown): string {
  if (typeof error !== 'object' || error === null) return String(error)

  const maybeExecError = error as {
    stdout?: string
    stderr?: string
    message?: string
  }
  return (
    maybeExecError.stderr?.trim() ||
    maybeExecError.stdout?.trim() ||
    maybeExecError.message?.trim() ||
    String(error)
  )
}
