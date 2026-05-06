import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { AlertTriangle, CheckCircle2, Settings2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button } from '@renderer/components/ui/button'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { checkCorePermission, checkElevateTask, getBuiltinCoreAvailability } from '@renderer/utils/ipc'
import { platform } from '@renderer/utils/init'
import CoreSetupModalHost, { CoreSetupTarget } from './core-setup-modal-host'

type CoreReadinessStatus =
  | 'ready'
  | 'needs_permission'
  | 'unknown'
  | 'system_core'
  | 'missing_builtin_core'

interface CoreReadiness {
  status: CoreReadinessStatus
  needsAction: boolean
}

const CoreReadinessShortcut: React.FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { appConfig } = useAppConfig()
  const [setupTarget, setSetupTarget] = useState<CoreSetupTarget | null>(null)

  const core = appConfig?.core ?? 'mihomo'
  const mainSwitchMode = appConfig?.mainSwitchMode ?? 'tun'
  const shouldShow = mainSwitchMode === 'tun'

  const { data, error, mutate, isLoading } = useSWR(
    shouldShow ? ['core-readiness', core, platform] : null,
    async (): Promise<CoreReadiness> => {
      if (core === 'system') {
        return { status: 'system_core', needsAction: false }
      }

      const availability = await getBuiltinCoreAvailability()
      if (!availability[core]) {
        return { status: 'missing_builtin_core', needsAction: true }
      }

      if (platform === 'win32') {
        const hasTask = await checkElevateTask()
        return {
          status: hasTask ? 'ready' : 'needs_permission',
          needsAction: !hasTask
        }
      }

      const permissions = await checkCorePermission()
      const hasPermission = permissions[core]
      return {
        status: hasPermission ? 'ready' : 'needs_permission',
        needsAction: !hasPermission
      }
    },
    {
      refreshInterval: 15000,
      revalidateOnFocus: true
    }
  )

  const readiness = useMemo<CoreReadiness>(() => {
    if (!shouldShow) return { status: 'ready', needsAction: false }
    if (error) return { status: 'unknown', needsAction: true }
    if (data) return data
    if (isLoading) return { status: 'unknown', needsAction: false }
    return { status: 'unknown', needsAction: true }
  }, [data, error, isLoading, shouldShow])

  if (!shouldShow) return null

  const isReady = readiness.status === 'ready'
  const showAction = isReady || readiness.needsAction || readiness.status === 'system_core'
  const statusText = getStatusText(t, readiness.status)
  const description = getDescription(t, readiness.status)
  const actionLabel =
    readiness.status === 'system_core'
      ? t('pages.home.coreSetupOpenSettings')
      : isReady
        ? t('pages.home.coreSetupResetAction')
        : t('pages.home.coreSetupAction')

  return (
    <>
      <div
        className={`mx-auto flex w-full max-w-lg items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs backdrop-blur-xl ${
          isReady
            ? 'border-stroke bg-card/35 text-muted-foreground'
            : 'border-warning/35 bg-warning/10 text-warning'
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          {isReady ? (
            <CheckCircle2 className="size-4 shrink-0 text-success" />
          ) : (
            <AlertTriangle className="size-4 shrink-0 text-warning" />
          )}
          <div className="min-w-0">
            <div className="truncate font-medium text-foreground">{statusText}</div>
            <div className="truncate text-muted-foreground">{description}</div>
          </div>
        </div>
        {showAction && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 shrink-0 gap-1.5 px-2"
            onClick={() => {
              if (readiness.status === 'system_core') {
                navigate('/mihomo')
                return
              }
              setSetupTarget('permission')
            }}
          >
            <Settings2 className="size-3.5" />
            {actionLabel}
          </Button>
        )}
      </div>
      <CoreSetupModalHost
        target={setupTarget}
        onTargetChange={(target) => {
          setSetupTarget(target)
          if (!target) {
            mutate()
          }
        }}
      />
    </>
  )
}

function getStatusText(t: (key: string) => string, status: CoreReadinessStatus): string {
  switch (status) {
    case 'ready':
      return t('pages.home.coreSetupStatusReady')
    case 'needs_permission':
      return t('pages.home.coreSetupStatusNeedsPermission')
    case 'system_core':
      return t('pages.home.coreSetupStatusSystem')
    case 'missing_builtin_core':
      return t('pages.home.coreSetupStatusMissingBuiltin')
    case 'unknown':
    default:
      return t('pages.home.coreSetupStatusUnknown')
  }
}

function getDescription(t: (key: string) => string, status: CoreReadinessStatus): string {
  switch (status) {
    case 'ready':
      return t('pages.home.coreSetupDescriptionReady')
    case 'needs_permission':
      return t('pages.home.coreSetupDescriptionNeedsPermission')
    case 'system_core':
      return t('pages.home.coreSetupDescriptionSystem')
    case 'missing_builtin_core':
      return t('pages.home.coreSetupDescriptionMissingBuiltin')
    case 'unknown':
    default:
      return t('pages.home.coreSetupDescriptionUnknown')
  }
}

export default CoreReadinessShortcut
