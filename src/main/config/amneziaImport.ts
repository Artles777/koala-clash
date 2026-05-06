import { createHash } from 'crypto'
import { existsSync } from 'fs'
import { readFile, unlink, writeFile } from 'fs/promises'
import { profilePath } from '../utils/dirs'
import { NormalizedProfile } from '../../core/profiles/normalized-profile'
import { parseAmneziaVpnKey } from '../../shared/lib/amnezia/parser'
import { getProfileConfig, setProfileConfig } from './profile'
import { AmneziaImportError } from '../../shared/lib/amnezia/errors'
import {
  assessAmneziaMihomoNativeSupport,
  AmneziaMihomoNativeBlocker,
  createAmneziaMihomoNativeYaml
} from '../../shared/lib/amnezia/to-mihomo'
import { isAmneziaWgUnsupportedFailure } from '../../shared/lib/amnezia/mihomo-validation'
import { isStaleProfileYaml } from '../../shared/lib/profile/stale-yaml'

export async function importAmneziaKey(raw: string): Promise<ProfileItem> {
  const normalizedRaw = raw.trim()
  const fingerprint = createHash('sha256').update(normalizedRaw).digest('hex')
  const sourceId = `amnezia-source-${fingerprint.slice(0, 16)}`
  const profileId = `amnezia-${fingerprint.slice(0, 16)}`
  const importedAt = Date.now()

  const draft = parseAmneziaVpnKey(normalizedRaw, {
    sourceId,
    profileId,
    importedAt
  })

  const assessment = assessAmneziaMihomoNativeSupport(draft.profile)
  if (!assessment.supported) {
    throw new AmneziaImportError(
      mapNativeSupportErrorCode(assessment.blockers),
      `Unsupported Amnezia vpn:// profile. Only self-contained AmneziaWG/WireGuard profiles can be imported. Missing or unsupported fields: ${assessment.blockers.join(', ')}`,
      assessment
    )
  }

  const yaml = createAmneziaMihomoNativeYaml(draft.profile)
  await validateAmneziaNativeMihomoYaml(yaml)
  const profileItem = createAmneziaNativeProfileItem(draft.profile)

  const profileConfig = await getProfileConfig()
  const existingIndex = profileConfig.items?.findIndex((item) => item.id === profileItem.id) ?? -1
  if (existingIndex >= 0) {
    throw new AmneziaImportError('duplicate_import', 'This profile already exists')
  }

  await removeStaleProfileYaml(profileItem.id)
  await writeFile(profilePath(profileItem.id), yaml, 'utf-8')

  if (!profileConfig.items) profileConfig.items = []
  profileConfig.items.push(profileItem)
  if (!profileConfig.current) {
    profileConfig.current = profileItem.id
  }
  await setProfileConfig(profileConfig)

  return profileItem
}

function createAmneziaNativeProfileItem(profile: NormalizedProfile): ProfileItem {
  return {
    id: profile.id,
    type: 'local',
    name: profile.name,
    updated: profile.metadata.importedAt,
    autoUpdate: false
  }
}

async function validateAmneziaNativeMihomoYaml(yaml: string): Promise<void> {
  const { execFile } = await import('child_process')
  const { promisify } = await import('util')
  const { mihomoCorePath } = await import('../utils/dirs')
  const execFileAsync = promisify(execFile)
  const corePath = mihomoCorePath('mihomo')
  const encodedConfig = Buffer.from(yaml).toString('base64')

  try {
    await execFileAsync(corePath, ['-t', '-config', encodedConfig], {
      timeout: 10000,
      maxBuffer: 1024 * 1024
    })
  } catch (error) {
    const details = getExecErrorDetails(error)
    if (isAmneziaWgUnsupportedFailure(details)) {
      throw new AmneziaImportError(
        'core_does_not_support_amnezia_wg',
        `The bundled Mihomo core does not support amnezia-wg-option. Update the bundled core (re-run "pnpm prepare") and try again. Core output: ${details}`,
        error
      )
    }
    throw new AmneziaImportError(
      'validation_failed',
      `Mihomo rejected the generated Amnezia WireGuard profile: ${details}`,
      error
    )
  }
}

function mapNativeSupportErrorCode(
  blockers: AmneziaMihomoNativeBlocker[]
): AmneziaImportError['code'] {
  if (blockers.includes('missing_endpoint') || blockers.includes('missing_endpoint_port')) {
    return 'missing_endpoint'
  }
  if (blockers.includes('missing_private_key') || blockers.includes('missing_public_key')) {
    return 'missing_keys'
  }
  return 'unsupported_payload'
}

async function removeStaleProfileYaml(profileId: string): Promise<void> {
  const target = profilePath(profileId)
  if (!existsSync(target)) return
  const existing = await readFile(target, 'utf-8').catch(() => '')
  if (isStaleProfileYaml(existing)) {
    await unlink(target).catch(() => {})
  }
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
