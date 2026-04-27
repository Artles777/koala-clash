import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { cn } from '@renderer/lib/utils'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { calcTraffic } from '@renderer/utils/calc'
import dayjs from 'dayjs'
import React, { useEffect, useMemo, useState } from 'react'
import EditFileModal from './edit-file-modal'
import EditRulesModal from './edit-rules-modal'
import EditInfoModal from './edit-info-modal'
import AmneziaProfileDetailsModal from './amnezia-profile-details-modal'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { openFile } from '@renderer/utils/ipc'
import {
  getManagedProfileMetadata,
  getProfileRuntimeCapabilities,
  ProfileBadgeDescriptor
} from '../../../../core/profiles/managed-profile'
import { createUnifiedProfileItem, UnifiedBadge } from '../../../../core/ui/unified-ui'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle
} from '@renderer/components/ui/alert-dialog'
import {
  Clock,
  EllipsisVertical,
  ExternalLink,
  FileText,
  FolderOpen,
  HeadsetIcon,
  Info,
  InfinityIcon,
  ListTree,
  Pencil,
  RefreshCcw,
  Trash2
} from 'lucide-react'

interface Props {
  info: ProfileItem
  isCurrent: boolean
  addProfileItem: (item: Partial<ProfileItem>) => Promise<void>
  updateProfileItem: (item: ProfileItem) => Promise<void>
  removeProfileItem: (id: string) => Promise<void>
  onClick: () => Promise<void>
  switching: boolean
}

interface MenuItem {
  key: string
  label: string
  icon: React.ReactNode
  showDivider: boolean
  variant: 'default' | 'destructive'
  disabled?: boolean
  disabledReason?: string
}

const ProfileItem: React.FC<Props> = (props) => {
  const { t } = useTranslation()
  const {
    info,
    addProfileItem,
    removeProfileItem,
    updateProfileItem,
    onClick,
    isCurrent,
    switching
  } = props
  const extra = info?.extra
  const usage = (extra?.upload ?? 0) + (extra?.download ?? 0)
  const total = extra?.total ?? 0
  const [updating, setUpdating] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [openInfoEditor, setOpenInfoEditor] = useState(false)
  const [openFileEditor, setOpenFileEditor] = useState(false)
  const [openRulesEditor, setOpenRulesEditor] = useState(false)
  const [openAmneziaDetails, setOpenAmneziaDetails] = useState(false)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform: tf,
    transition,
    isDragging
  } = useSortable({
    id: info.id
  })
  const transform = tf ? { x: tf.x, y: tf.y, scaleX: 1, scaleY: 1 } : null
  const [disableSelect, setDisableSelect] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const updatedFromNow = dayjs(info.updated).fromNow()

  const hasLimit = total > 0
  const expired = extra?.expire ? dayjs.unix(extra.expire).isBefore(dayjs()) : false
  const unifiedProfile = useMemo(
    () => createUnifiedProfileItem(info, isCurrent ? info.id : undefined),
    [info, isCurrent]
  )
  const metadata = useMemo(() => getManagedProfileMetadata(info), [info])
  const runtime = useMemo(() => getProfileRuntimeCapabilities(info), [info])
  const badges = unifiedProfile.badges
  const isAmnezia = metadata.profileKind === 'amnezia'

  const trafficRemaining = useMemo(() => {
    if (info.type !== 'remote' || !extra) return null
    if (!hasLimit) return null
    const remaining = Math.max(0, total - usage)
    return calcTraffic(remaining)
  }, [info.type, extra, hasLimit, total, usage])

  const daysRemaining = useMemo(() => {
    if (info.type !== 'remote' || !extra) return null
    if (!extra.expire) return null
    if (expired) return '0'
    const days = dayjs.unix(extra.expire).diff(dayjs(), 'day')
    return days.toString()
  }, [info.type, extra, expired])

  const intervalLabel = useMemo(() => {
    if (!info.interval || info.interval <= 0) return null
    const hours = Math.floor(info.interval / 60)
    if (hours >= 24) {
      const days = Math.floor(hours / 24)
      return `${days}${t('profile.dayShort')}`
    }
    if (hours > 0) return `${hours}${t('profile.hourShort')}`
    return `${info.interval}${t('profile.minuteShort')}`
  }, [info.interval, t])

  const menuItems: MenuItem[] = useMemo(() => {
    const list: MenuItem[] = []
    if (info.home) {
      list.push({
        key: 'home',
        label: t('profile.homepage'),
        icon: <ExternalLink />,
        showDivider: false,
        variant: 'default'
      })
    }
    if (info.supportUrl) {
      list.push({
        key: 'support',
        label: t('profile.support'),
        icon: <HeadsetIcon />,
        showDivider: false,
        variant: 'default'
      })
    }
    if (runtime.canViewDetails) {
      list.push({
        key: 'view-details',
        label: t('profile.viewDetails'),
        icon: <Info />,
        showDivider: false,
        variant: 'default'
      })
    }
    list.push(
      {
        key: 'edit-info',
        label: t('profile.editInfo'),
        icon: <Pencil />,
        showDivider: false,
        variant: 'default'
      },
      {
        key: 'edit-file',
        label: t('profile.editFile'),
        icon: <FileText />,
        showDivider: false,
        variant: 'default',
        disabled: !runtime.canEditConfig,
        disabledReason: !runtime.canEditConfig ? t('profile.actionNotSupported') : undefined
      },
      {
        key: 'edit-rules',
        label: t('profile.editRule'),
        icon: <ListTree />,
        showDivider: false,
        variant: 'default',
        disabled: !runtime.canEditRules,
        disabledReason: !runtime.canEditRules ? t('profile.actionNotSupported') : undefined
      },
      {
        key: 'open-file',
        label: t('profile.openFile'),
        icon: <FolderOpen />,
        showDivider: true,
        variant: 'default',
        disabled: !runtime.canOpenConfigFile,
        disabledReason: !runtime.canOpenConfigFile ? t('profile.actionNotSupported') : undefined
      },
      {
        key: 'delete',
        label: t('profile.delete'),
        icon: <Trash2 />,
        showDivider: false,
        variant: 'destructive'
      }
    )
    return list
  }, [info, runtime, t])

  const onMenuAction = async (key: string): Promise<void> => {
    switch (key) {
      case 'view-details': {
        setOpenAmneziaDetails(true)
        break
      }
      case 'update': {
        setUpdating(true)
        try {
          await addProfileItem(info)
        } finally {
          setUpdating(false)
        }
        break
      }
      case 'edit-info': {
        setOpenInfoEditor(true)
        break
      }
      case 'edit-file': {
        setOpenFileEditor(true)
        break
      }
      case 'edit-rules': {
        setOpenRulesEditor(true)
        break
      }
      case 'open-file': {
        openFile(info.id)
        break
      }
      case 'delete': {
        setConfirmOpen(true)
        break
      }
      case 'home': {
        open(info.home)
        break
      }
      case 'support': {
        open(info.supportUrl)
        break
      }
    }
  }

  useEffect(() => {
    if (isDragging) {
      setTimeout(() => setDisableSelect(true), 100)
    } else {
      setTimeout(() => setDisableSelect(false), 100)
    }
  }, [isDragging])

  const handleSelect = (): void => {
    if (disableSelect || switching) return
    if (!runtime.canActivate) {
      toast.error(t('profile.runtimeNotSupported'))
      return
    }
    setSelecting(true)
    onClick().finally(() => setSelecting(false))
  }

  return (
    <div
      className="relative col-span-1"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 'calc(infinity)' : undefined
      }}
    >
      {openFileEditor && <EditFileModal id={info.id} onClose={() => setOpenFileEditor(false)} />}
      {openRulesEditor && <EditRulesModal id={info.id} onClose={() => setOpenRulesEditor(false)} />}
      {openAmneziaDetails && (
        <AmneziaProfileDetailsModal id={info.id} onClose={() => setOpenAmneziaDetails(false)} />
      )}
      {openInfoEditor && (
        <EditInfoModal
          item={info}
          isCurrent={isCurrent}
          onClose={() => setOpenInfoEditor(false)}
          updateProfileItem={updateProfileItem}
        />
      )}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2 className="size-8 text-destructive" />
            </AlertDialogMedia>
            <AlertDialogTitle>{t('profile.confirmDeleteProfile')}</AlertDialogTitle>
            <AlertDialogDescription className="truncate max-w-3xs">
              {info.name}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setTimeout(() => removeProfileItem(info.id), 200)
              }}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div
        role="button"
        tabIndex={0}
        aria-selected={isCurrent}
        aria-disabled={!runtime.canActivate}
        aria-busy={selecting || switching}
        onClick={handleSelect}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            handleSelect()
          }
        }}
        className={cn(
          'group relative rounded-2xl backdrop-blur-3xl border px-4 pt-3 pb-2 cursor-pointer transition-all duration-200',
          isCurrent
            ? 'border-stroke-profile-active bg-profile-active hover:bg-profile-active/90'
            : 'border-stroke-profile-inactive bg-profile-inactive hover:bg-accent/60',
          selecting && 'opacity-60 scale-[0.98]',
          switching && 'cursor-wait',
          !runtime.canActivate && 'cursor-not-allowed'
        )}
      >
        <div ref={setNodeRef} {...attributes} {...listeners} className="w-full h-full">
          {/* Header: logo + name + menu */}
          <div className="flex items-center gap-2">
            {info.logo && (
              <img
                src={info.logo}
                alt=""
                className="size-7 rounded-full object-cover shrink-0"
                onError={(e) => {
                  ;(e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            )}
            <h3 title={info.name} className="text-sm font-semibold truncate flex-1 leading-tight">
              {info.name}
            </h3>
            <div
              className="shrink-0 -mr-1 flex items-center"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {runtime.canRefresh && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => onMenuAction('update')}
                  disabled={updating}
                >
                  <RefreshCcw
                    className={cn('text-base text-muted-foreground', updating && 'animate-spin')}
                  />
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon-sm" variant="ghost">
                    <EllipsisVertical className="text-base text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  {menuItems.map((item) => (
                    <React.Fragment key={item.key}>
                      <DropdownMenuItem
                        variant={item.variant}
                        disabled={item.disabled}
                        onClick={() => onMenuAction(item.key)}
                      >
                        {item.icon}
                        {item.label}
                        {item.disabledReason && (
                          <span className="ml-auto text-[10px] text-muted-foreground">
                            {item.disabledReason}
                          </span>
                        )}
                      </DropdownMenuItem>
                      {item.showDivider && <DropdownMenuSeparator />}
                    </React.Fragment>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {badges.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {badges.map((badge) => (
                <Badge
                  key={badge.code}
                  variant={getBadgeVariant(badge)}
                  className="max-w-full truncate text-[10px]"
                >
                  {getBadgeLabel(t, badge)}
                </Badge>
              ))}
            </div>
          )}

          {isAmnezia ? (
            <div className="grid grid-cols-2 mt-2">
              <div className="pr-3 border-r border-foreground/10 justify-items-center">
                <div className="text-[11px] text-muted-foreground">{t('profile.runtime')}</div>
                <div
                  className={cn(
                    'text-xs font-bold mt-0.5 leading-tight',
                    getRuntimeSupportClass(metadata.runtimeSupport)
                  )}
                >
                  {getRuntimeSupportLabel(t, metadata.runtimeSupport)}
                </div>
              </div>
              <div className="pl-3 justify-items-center">
                <div className="text-[11px] text-muted-foreground">{t('profile.status')}</div>
                <div className="text-xs font-bold mt-0.5 leading-tight">
                  {getValidityLabel(t, metadata.validityStatus)}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 mt-2">
              <div className="pr-3 border-r border-foreground/10 justify-items-center">
                <div className="text-[11px] text-muted-foreground">
                  {t('profile.trafficRemaining')}
                </div>
                <div className="text-sm font-bold mt-0.5 leading-tight">
                  {hasLimit ? trafficRemaining : <InfinityIcon className="size-5" />}
                </div>
              </div>
              <div className="pl-3 justify-items-center">
                <div className="text-[11px] text-muted-foreground">
                  {t('profile.daysRemaining')}
                </div>
                <div className="text-sm font-bold mt-0.5 leading-tight">
                  {extra?.expire ? daysRemaining : <InfinityIcon className="size-5" />}
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="border-t border-foreground/10 mt-3 pt-2 flex items-center justify-between text-[11px] text-muted-foreground">
            {info.type === 'remote' ? (
              <>
                <span>
                  {t('profile.updatedAt')}: {updatedFromNow}
                </span>
                {intervalLabel && (
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    {intervalLabel}
                  </span>
                )}
              </>
            ) : (
              <span>
                {isAmnezia ? t('profile.amneziaProfileLabel') : t('profile.localProfileLabel')}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function getBadgeVariant(badge: UnifiedBadge): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (badge.tone === 'danger') return 'destructive'
  if (badge.tone === 'warning') return 'outline'
  if (badge.tone === 'info') return 'secondary'
  return 'outline'
}

function getBadgeLabel(
  t: ReturnType<typeof useTranslation>['t'],
  badge: UnifiedBadge | ProfileBadgeDescriptor
): string {
  if ('label' in badge && badge.label) return badge.label
  if ('labelKey' in badge && badge.labelKey) return t(badge.labelKey)
  const key = 'key' in badge ? badge.key : badge.code
  switch (key) {
    case 'imported':
      return t('profile.badgeImported')
    case 'amnezia':
      return t('profile.badgeAmnezia')
    case 'runtime_not_supported':
      return t('profile.badgeRuntimeNotSupported')
    case 'runtime_planned':
      return t('profile.badgeRuntimePlanned')
    case 'runtime_translatable':
      return t('profile.badgeRuntimeTranslatable')
    case 'runtime_requires_helper':
      return t('profile.badgeRuntimeRequiresHelper')
    case 'runtime_prototype_available':
      return t('profile.badgeRuntimePrototypeAvailable')
    case 'invalid':
      return t('profile.badgeInvalid')
    case 'partial':
      return t('profile.badgePartial')
    case 'mihomo':
      return t('profile.badgeMihomo')
  }
  return key
}

function getRuntimeSupportLabel(
  t: ReturnType<typeof useTranslation>['t'],
  status: ProfileRuntimeSupport
): string {
  switch (status) {
    case 'none':
      return t('profile.runtimeSupportNone')
    case 'planned':
      return t('profile.runtimeSupportPlanned')
    case 'available':
      return t('profile.runtimeSupportAvailable')
    case 'translatable':
      return t('profile.runtimeSupportTranslatable')
    case 'requires_helper':
      return t('profile.runtimeSupportRequiresHelper')
    case 'prototype_available':
      return t('profile.runtimeSupportPrototypeAvailable')
  }
}

function getRuntimeSupportClass(status: ProfileRuntimeSupport): string {
  switch (status) {
    case 'available':
    case 'translatable':
    case 'prototype_available':
      return 'text-primary'
    case 'requires_helper':
    case 'planned':
      return 'text-warning'
    case 'none':
      return 'text-muted-foreground'
  }
}

function getValidityLabel(
  t: ReturnType<typeof useTranslation>['t'],
  status: ProfileValidityStatus
): string {
  switch (status) {
    case 'invalid':
      return t('profile.validityInvalid')
    case 'partial':
      return t('profile.validityPartial')
    case 'valid':
      return t('profile.validityValid')
  }
}

export default ProfileItem
