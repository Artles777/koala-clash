import { useMemo } from 'react'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import { useRules } from '@renderer/hooks/use-rules'
import { createUnifiedUiBundle, UnifiedUiBundle } from '../../../core/ui/unified-ui'

interface UnifiedUiBundleHook {
  bundle: UnifiedUiBundle
  mutateMihomoRules: () => void
}

export function useUnifiedUiBundle(): UnifiedUiBundleHook {
  const { profileConfig } = useProfileConfig()
  const { rules, mutate: mutateMihomoRules } = useRules()

  const bundle = useMemo(
    () =>
      createUnifiedUiBundle({
        profileItems: profileConfig?.items ?? [],
        currentProfileId: profileConfig?.current,
        mihomo: {
          running: rules ? true : undefined,
          currentProfileId: profileConfig?.current
        },
        mihomoRules: rules?.rules ?? []
      }),
    [profileConfig?.current, profileConfig?.items, rules]
  )

  return {
    bundle,
    mutateMihomoRules
  }
}
