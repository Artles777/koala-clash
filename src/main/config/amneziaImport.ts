import { createHash } from 'crypto'
import { existsSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { importedSourcesPath, normalizedProfilesPath, profilePath } from '../utils/dirs'
import { parseYaml, stringifyYaml } from '../utils/yaml'
import { ImportedSource, NormalizedProfile } from '../../core/profiles/normalized-profile'
import { parseAmneziaVpnKey } from '../../shared/lib/amnezia/parser'
import { appendAmneziaImport, assertUniqueAmneziaImport } from '../../features/amnezia-import/store'
import { getProfileConfig, setProfileConfig } from './profile'
import { AmneziaImportError } from '../../shared/lib/amnezia/errors'
import {
  createAmneziaManagedProfileFields,
  getProfileRuntimeCapabilities
} from '../../core/profiles/managed-profile'
import { validateNormalizedProfile } from '../../core/profiles/normalized-profile'
import { getExecutionPlan } from '../../core/profiles/desktop-runtime-adapter'

interface ImportedSourcesConfig {
  items: ImportedSource[]
}

interface NormalizedProfilesConfig {
  items: NormalizedProfile[]
}

export async function importAmneziaKey(raw: string): Promise<ProfileItem> {
  const normalizedRaw = raw.trim()
  const sourcesConfig = await getImportedSourcesConfig()
  const profilesConfig = await getNormalizedProfilesConfig()

  assertUniqueAmneziaImport(normalizedRaw, sourcesConfig.items)

  const fingerprint = createHash('sha256').update(normalizedRaw).digest('hex')
  const sourceId = `amnezia-source-${fingerprint.slice(0, 16)}`
  const profileId = `amnezia-${fingerprint.slice(0, 16)}`
  const importedAt = Date.now()

  if (profilesConfig.items.some((profile) => profile.id === profileId)) {
    throw new AmneziaImportError('duplicate_import', 'This Amnezia key has already been imported')
  }

  const draft = parseAmneziaVpnKey(normalizedRaw, {
    sourceId,
    profileId,
    importedAt
  })
  const nextStores = appendAmneziaImport(
    {
      sources: sourcesConfig.items,
      profiles: profilesConfig.items
    },
    draft.source,
    draft.profile
  )
  const profileItem = createAmneziaProfileItem(draft.profile)

  const profileConfig = await getProfileConfig()
  if (profileConfig.items?.some((item) => item.id === profileItem.id)) {
    throw new AmneziaImportError('duplicate_import', 'This profile already exists')
  }

  await writeImportedSourcesConfig({ items: nextStores.sources })
  await writeNormalizedProfilesConfig({ items: nextStores.profiles })
  await writeFile(
    profilePath(profileItem.id),
    createMihomoPlaceholderProfile(draft.profile),
    'utf-8'
  )

  if (!profileConfig.items) profileConfig.items = []
  profileConfig.items.push(profileItem)
  if (!profileConfig.current) {
    profileConfig.current = profileItem.id
  }
  await setProfileConfig(profileConfig)

  return profileItem
}

export async function getAmneziaProfileDetails(id: string): Promise<AmneziaProfileDetails> {
  const profileConfig = await getProfileConfig()
  const item = profileConfig.items?.find((profileItem) => profileItem.id === id)
  if (!item || item.profileKind !== 'amnezia') {
    throw new AmneziaImportError('unsupported_format', 'Amnezia profile not found')
  }

  const sourcesConfig = await getImportedSourcesConfig()
  const profilesConfig = await getNormalizedProfilesConfig()
  const normalizedProfile = profilesConfig.items.find(
    (profile) => profile.id === item.normalizedProfileId
  )
  const source = normalizedProfile
    ? sourcesConfig.items.find((importedSource) => importedSource.id === normalizedProfile.sourceId)
    : sourcesConfig.items.find((importedSource) => importedSource.id === item.importedSourceId)

  return {
    source,
    profile: normalizedProfile,
    runtime: getProfileRuntimeCapabilities(item),
    executionPlan: normalizedProfile
      ? getExecutionPlan(normalizedProfile, process.platform)
      : undefined,
    validationIssues: normalizedProfile ? validateNormalizedProfile(normalizedProfile) : []
  }
}

async function getImportedSourcesConfig(): Promise<ImportedSourcesConfig> {
  return readYamlConfig(importedSourcesPath(), { items: [] })
}

async function getNormalizedProfilesConfig(): Promise<NormalizedProfilesConfig> {
  return readYamlConfig(normalizedProfilesPath(), { items: [] })
}

async function writeImportedSourcesConfig(config: ImportedSourcesConfig): Promise<void> {
  await writeFile(importedSourcesPath(), stringifyYaml(config), 'utf-8')
}

async function writeNormalizedProfilesConfig(config: NormalizedProfilesConfig): Promise<void> {
  await writeFile(normalizedProfilesPath(), stringifyYaml(config), 'utf-8')
}

async function readYamlConfig<T>(path: string, fallback: T): Promise<T> {
  if (!existsSync(path)) return fallback

  const content = await readFile(path, 'utf-8')
  const parsed = parseYaml<T>(content)
  return parsed || fallback
}

function createAmneziaProfileItem(profile: NormalizedProfile): ProfileItem {
  return {
    id: profile.id,
    type: 'local',
    name: profile.name,
    updated: profile.metadata.importedAt,
    autoUpdate: false,
    ...createAmneziaManagedProfileFields({
      sourceId: profile.sourceId,
      normalizedProfileId: profile.id
    }),
    compatibilityProtocol: profile.protocol
  }
}

function createMihomoPlaceholderProfile(profile: NormalizedProfile): string {
  return [
    '# Imported Amnezia VPN key.',
    '# Routed through the desktop Amnezia helper when it is running.',
    `# Normalized profile id: ${profile.id}`,
    'proxies: []',
    'proxy-groups:',
    '  - name: PROXY',
    '    type: select',
    '    proxies:',
    '      - DIRECT',
    'rules:',
    '  - MATCH,DIRECT',
    ''
  ].join('\n')
}
