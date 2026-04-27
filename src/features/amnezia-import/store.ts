import { ImportedSource, NormalizedProfile } from '../../core/profiles/normalized-profile'
import { AmneziaImportError } from '../../shared/lib/amnezia/errors'

export interface AmneziaImportStores {
  sources: ImportedSource[]
  profiles: NormalizedProfile[]
}

export function assertUniqueAmneziaImport(raw: string, existingSources: ImportedSource[]): void {
  const normalizedRaw = raw.trim()
  const duplicate = existingSources.find(
    (source) => source.type === 'amnezia_vpn_uri' && source.raw.trim() === normalizedRaw
  )

  if (duplicate) {
    throw new AmneziaImportError('duplicate_import', 'This Amnezia key has already been imported', {
      sourceId: duplicate.id
    })
  }
}

export function appendAmneziaImport(
  stores: AmneziaImportStores,
  source: ImportedSource,
  profile: NormalizedProfile
): AmneziaImportStores {
  assertUniqueAmneziaImport(source.raw, stores.sources)

  if (stores.profiles.some((existing) => existing.id === profile.id)) {
    throw new AmneziaImportError('duplicate_import', 'This normalized profile already exists', {
      profileId: profile.id
    })
  }

  return {
    sources: [...stores.sources, source],
    profiles: [...stores.profiles, profile]
  }
}
