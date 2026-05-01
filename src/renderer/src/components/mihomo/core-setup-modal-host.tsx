/* eslint-disable react/prop-types */
import PermissionModal from '@renderer/components/mihomo/permission-modal'
import ServiceModal from '@renderer/components/mihomo/service-modal'
import { platform } from '@renderer/utils/init'
import {
  deleteElevateTask,
  initService,
  installService,
  manualGrantCorePermition,
  restartAsAdmin,
  restartCore,
  restartService,
  revokeCorePermission,
  startService,
  stopService,
  uninstallService
} from '@renderer/utils/ipc'
import { useTranslation } from 'react-i18next'

export type CoreSetupTarget = 'permission' | 'service'

interface CoreSetupModalHostProps {
  target: CoreSetupTarget | null
  onTargetChange: (target: CoreSetupTarget | null) => void
}

const CoreSetupModalHost: React.FC<CoreSetupModalHostProps> = (props) => {
  const { target, onTargetChange } = props
  const { t } = useTranslation()

  if (target === 'permission') {
    return (
      <PermissionModal
        onChange={(open) => onTargetChange(open ? 'permission' : null)}
        onRevoke={async () => {
          if (platform === 'win32') {
            await deleteElevateTask()
            new Notification(t('pages.mihomo.taskScheduleCanceled'))
          } else {
            await revokeCorePermission()
            new Notification(t('pages.mihomo.corePermissionRevoked'))
          }
          await restartCore()
        }}
        onGrant={async () => {
          if (platform === 'win32') {
            await restartAsAdmin()
            return
          }
          await manualGrantCorePermition()
          new Notification(t('pages.mihomo.coreAuthSuccess'))
          await restartCore()
        }}
      />
    )
  }

  if (target === 'service') {
    return (
      <ServiceModal
        onChange={(open) => onTargetChange(open ? 'service' : null)}
        onInit={async () => {
          await initService()
          new Notification(t('pages.mihomo.serviceInitSuccess'))
        }}
        onInstall={async () => {
          await installService()
          new Notification(t('pages.mihomo.serviceInstallSuccess'))
        }}
        onUninstall={async () => {
          await uninstallService()
          new Notification(t('pages.mihomo.serviceUninstallSuccess'))
        }}
        onStart={async () => {
          await startService()
          new Notification(t('pages.mihomo.serviceStartSuccess'))
        }}
        onRestart={async () => {
          await restartService()
          new Notification(t('pages.mihomo.serviceRestartSuccess'))
        }}
        onStop={async () => {
          await stopService()
          new Notification(t('pages.mihomo.serviceStopSuccess'))
        }}
      />
    )
  }

  return null
}

export default CoreSetupModalHost
