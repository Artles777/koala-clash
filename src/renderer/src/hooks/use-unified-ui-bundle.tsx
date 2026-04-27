import { useMemo } from 'react'
import useSWR, { KeyedMutator } from 'swr'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import { useRules } from '@renderer/hooks/use-rules'
import {
  getAmneziaHelperRulePacks,
  getAmneziaHelperStatus,
  getAmneziaHelperSupportSnapshot
} from '@renderer/utils/ipc'
import {
  createUnifiedUiBundle,
  UnifiedRuleScopeId,
  UnifiedUiBundle
} from '../../../core/ui/unified-ui'

interface UnifiedUiBundleHook {
  bundle: UnifiedUiBundle
  mutateMihomoRules: () => void
  mutateAmneziaRulePacks: KeyedMutator<AmneziaHelperRulePack[]>
  mutateAmneziaStatus: KeyedMutator<AmneziaHelperSession | undefined>
  mutateAmneziaSupport: KeyedMutator<AmneziaHelperDiagnosticsBundle | undefined>
}

export function useUnifiedUiBundle(requestedRuleScopeId?: UnifiedRuleScopeId): UnifiedUiBundleHook {
  const { profileConfig } = useProfileConfig()
  const { rules, mutate: mutateMihomoRules } = useRules()
  const { data: amneziaRulePacks = [], mutate: mutateAmneziaRulePacks } = useSWR(
    'unifiedAmneziaRulePacks',
    getAmneziaHelperRulePacks
  )
  const { data: amneziaStatus, mutate: mutateAmneziaStatus } = useSWR<
    AmneziaHelperSession | undefined
  >('unifiedAmneziaHelperStatus', () => getAmneziaHelperStatus().catch(() => undefined), {
    refreshInterval: 2000
  })
  const { data: amneziaSupport, mutate: mutateAmneziaSupport } = useSWR<
    AmneziaHelperDiagnosticsBundle | undefined
  >('unifiedAmneziaHelperSupport', () => getAmneziaHelperSupportSnapshot().catch(() => undefined), {
    refreshInterval: 5000
  })

  const bundle = useMemo(
    () =>
      createUnifiedUiBundle({
        profileItems: profileConfig?.items ?? [],
        currentProfileId: profileConfig?.current,
        mihomo: {
          running: rules ? true : undefined,
          currentProfileId: profileConfig?.current,
          tunEnabled: amneziaSupport?.tun.enabled
        },
        mihomoRules: rules?.rules ?? [],
        amnezia: {
          readinessSummary: amneziaSupport?.readinessSummary,
          session: amneziaStatus
        },
        amneziaRulePacks,
        requestedRuleScopeId
      }),
    [
      amneziaRulePacks,
      amneziaStatus,
      amneziaSupport,
      profileConfig?.current,
      profileConfig?.items,
      requestedRuleScopeId,
      rules
    ]
  )

  return {
    bundle,
    mutateMihomoRules,
    mutateAmneziaRulePacks,
    mutateAmneziaStatus,
    mutateAmneziaSupport
  }
}
