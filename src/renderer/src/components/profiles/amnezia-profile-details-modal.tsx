import React, { useCallback, useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Textarea } from '@renderer/components/ui/textarea'
import { Spinner } from '@renderer/components/ui/spinner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Switch } from '@renderer/components/ui/switch'
import {
  addAmneziaHelperRule,
  addAmneziaHelperRulePack,
  bulkAddAmneziaHelperRules,
  evaluateAmneziaHelperRouting,
  exportAmneziaHelperDiagnosticsBundle,
  exportAmneziaHelperRulePacks,
  getAmneziaHelperSupportSnapshot,
  getAmneziaHelperRulePacks,
  getAmneziaHelperLogs,
  getAmneziaHelperStatus,
  getAmneziaProfileDetails,
  importAmneziaHelperRulePacks,
  removeAmneziaHelperRule,
  startAmneziaHelper,
  stopAmneziaHelper,
  updateAmneziaHelperRulePack,
  updateAmneziaHelperRule,
  validateAmneziaHelperConnectivity
} from '@renderer/utils/ipc'
import { useTranslation } from 'react-i18next'
import { Copy, Download, Pencil, Plus, Save, Search, Trash2, Upload, X } from 'lucide-react'

interface Props {
  id: string
  onClose: () => void
}

const helperRuleTypes: AmneziaHelperRuleType[] = [
  'DOMAIN',
  'DOMAIN-SUFFIX',
  'DOMAIN-KEYWORD',
  'IP-CIDR',
  'PROCESS-NAME'
]

interface HelperRuleDraft {
  type: AmneziaHelperRuleType
  value: string
  note: string
}

const createEmptyRuleDraft = (): HelperRuleDraft => ({
  type: 'DOMAIN-SUFFIX',
  value: '',
  note: ''
})

const AmneziaProfileDetailsModal: React.FC<Props> = ({ id, onClose }) => {
  const { t } = useTranslation()
  const [details, setDetails] = useState<AmneziaProfileDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [helperSession, setHelperSession] = useState<AmneziaHelperSession | null>(null)
  const [helperLogs, setHelperLogs] = useState<AmneziaHelperLogEntry[]>([])
  const [helperError, setHelperError] = useState<string | null>(null)
  const [helperBusy, setHelperBusy] = useState(false)
  const [connectivityBusy, setConnectivityBusy] = useState(false)
  const [helperRulePacks, setHelperRulePacks] = useState<AmneziaHelperRulePack[]>([])
  const [helperRulesBusy, setHelperRulesBusy] = useState(false)
  const [helperRulesError, setHelperRulesError] = useState<string | null>(null)
  const [helperRuleSearch, setHelperRuleSearch] = useState('')
  const [selectedRulePackId, setSelectedRulePackId] = useState('default')
  const [packDraftName, setPackDraftName] = useState('')
  const [bulkRuleText, setBulkRuleText] = useState('')
  const [bulkRuleType, setBulkRuleType] = useState<AmneziaHelperRuleType>('DOMAIN-SUFFIX')
  const [bulkRuleSummary, setBulkRuleSummary] = useState<string | null>(null)
  const [importExportText, setImportExportText] = useState('')
  const [importExportSummary, setImportExportSummary] = useState<string | null>(null)
  const [routingDiagnosticInput, setRoutingDiagnosticInput] = useState('')
  const [routingDiagnosticResult, setRoutingDiagnosticResult] =
    useState<AmneziaHelperRoutingDiagnosticResult | null>(null)
  const [routingDiagnosticBusy, setRoutingDiagnosticBusy] = useState(false)
  const [routingDiagnosticError, setRoutingDiagnosticError] = useState<string | null>(null)
  const [supportSnapshot, setSupportSnapshot] = useState<AmneziaHelperDiagnosticsBundle | null>(
    null
  )
  const [supportBusy, setSupportBusy] = useState(false)
  const [supportError, setSupportError] = useState<string | null>(null)
  const [diagnosticsExportPath, setDiagnosticsExportPath] = useState<string | null>(null)
  const [supportSummaryCopied, setSupportSummaryCopied] = useState(false)
  const [ruleDraft, setRuleDraft] = useState<HelperRuleDraft>(() => createEmptyRuleDraft())
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null)
  const [editingRuleDraft, setEditingRuleDraft] = useState<HelperRuleDraft>(() =>
    createEmptyRuleDraft()
  )

  const refreshHelperState = useCallback(async () => {
    const [status, logs] = await Promise.all([getAmneziaHelperStatus(id), getAmneziaHelperLogs(id)])
    setHelperSession(status)
    setHelperLogs(logs)
  }, [id])

  const refreshSupportState = useCallback(async () => {
    setSupportSnapshot(await getAmneziaHelperSupportSnapshot(id))
  }, [id])

  const refreshHelperRules = useCallback(async () => {
    const packs = await getAmneziaHelperRulePacks()
    setHelperRulePacks(packs)
    if (!packs.some((pack) => pack.id === selectedRulePackId)) {
      setSelectedRulePackId(packs[0]?.id ?? 'default')
    }
  }, [selectedRulePackId])

  useEffect(() => {
    let active = true
    getAmneziaProfileDetails(id)
      .then((value) => {
        if (active) setDetails(value)
      })
      .catch((e) => {
        if (active) setError(`${e}`)
      })
    return () => {
      active = false
    }
  }, [id])

  useEffect(() => {
    let active = true
    getAmneziaHelperRulePacks()
      .then((packs) => {
        if (active) {
          setHelperRulePacks(packs)
          setSelectedRulePackId((current) =>
            packs.some((pack) => pack.id === current) ? current : (packs[0]?.id ?? 'default')
          )
        }
      })
      .catch((e) => {
        if (active) setHelperRulesError(`${e}`)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    const refresh = async (): Promise<void> => {
      try {
        await refreshHelperState()
      } catch (e) {
        if (active) setHelperError(`${e}`)
      }
    }

    refresh()
    const timer = setInterval(refresh, 1000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [refreshHelperState])

  useEffect(() => {
    let active = true
    const refresh = async (): Promise<void> => {
      try {
        await refreshSupportState()
      } catch (e) {
        if (active) setSupportError(`${e}`)
      }
    }

    refresh()
    const timer = setInterval(refresh, 5000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [refreshSupportState])

  const endpoint = useMemo(() => {
    const value = details?.profile?.transport.endpoint
    if (!value) return '-'
    return value.port ? `${value.host}:${value.port}` : value.host
  }, [details])

  const dns = details?.profile?.interface.dns ?? []
  const importedAt = details?.source?.importedAt ?? details?.profile?.metadata.importedAt
  const executionPlan = details?.executionPlan
  const helperCommand = executionPlan?.helper
    ? [executionPlan.helper.executable, ...executionPlan.helper.args].join(' ')
    : '-'
  const helperStatus = helperSession?.status ?? 'idle'
  const helperReadiness = helperSession?.readiness ?? 'unknown'
  const helperEndpoint = helperSession?.localEndpoint
    ? `${helperSession.localEndpoint.protocol}://${helperSession.localEndpoint.host}:${helperSession.localEndpoint.port}`
    : '-'
  const helperRoutingTarget = helperSession?.routingTarget
  const helperRoutingEndpoint = helperRoutingTarget?.endpoint
    ? `${helperRoutingTarget.endpoint.protocol}://${helperRoutingTarget.endpoint.host}:${helperRoutingTarget.endpoint.port}`
    : '-'
  const connectivityResult = helperSession?.connectivityResult
  const connectivityStatus = helperSession?.connectivityStatus ?? 'unknown'
  const connectivityStage = helperSession?.validationStage ?? 'not_started'
  const connectivityEndpoint = connectivityResult?.endpoint
    ? `${connectivityResult.endpoint.protocol}://${connectivityResult.endpoint.host}:${connectivityResult.endpoint.port}`
    : helperEndpoint
  const connectivityLatency =
    helperSession?.lastConnectivityLatencyMs !== undefined
      ? `${helperSession.lastConnectivityLatencyMs}ms`
      : '-'
  const connectivityDuration =
    connectivityResult?.durationMs !== undefined ? `${connectivityResult.durationMs}ms` : '-'
  const connectivityDiagnostic = connectivityResult?.diagnostic
  const helperRulesActive = helperRoutingTarget?.status === 'injected'
  const helperRules = useMemo(
    () => helperRulePacks.flatMap((pack) => pack.rules.map((rule) => ({ pack, rule }))),
    [helperRulePacks]
  )
  const visibleHelperRulePacks = useMemo(() => {
    const search = helperRuleSearch.trim().toLowerCase()
    if (!search) return helperRulePacks

    return helperRulePacks
      .map((pack) => ({
        ...pack,
        rules: pack.rules.filter(
          (rule) =>
            pack.name.toLowerCase().includes(search) ||
            rule.type.toLowerCase().includes(search) ||
            rule.value.toLowerCase().includes(search) ||
            rule.note?.toLowerCase().includes(search)
        )
      }))
      .filter((pack) => pack.rules.length > 0 || pack.name.toLowerCase().includes(search))
  }, [helperRulePacks, helperRuleSearch])
  const selectedRulePack =
    helperRulePacks.find((pack) => pack.id === selectedRulePackId) ?? helperRulePacks[0]
  const diagnosticRuleDraft = routingDiagnosticResult
    ? getDiagnosticRuleDraft(routingDiagnosticResult)
    : null
  const startupPreflight = supportSnapshot?.startupPreflight
  const canStartHelper =
    Boolean(executionPlan?.helper) &&
    startupPreflight?.canStart !== false &&
    !['starting', 'running', 'restarting', 'stopping'].includes(helperStatus)
  const canStopHelper = ['starting', 'running', 'restarting'].includes(helperStatus)
  const canTestConnectivity = helperStatus === 'running' && helperReadiness === 'ready'
  const supportSummary = supportSnapshot?.support
  const supportPrimaryStatus = supportSummary?.primaryStatus
  const supportSeverity = supportSummary?.severity ?? 'warning'
  const supportBadgeVariant = supportSeverity === 'blocker' ? 'destructive' : 'outline'
  const supportBackendState = supportSnapshot?.backend.available
    ? supportSnapshot.backend.kind
    : 'unavailable'
  const supportHelperChecksum = supportSnapshot?.backend.helperChecksumSha256
    ? supportSnapshot.backend.helperChecksumSha256.slice(0, 12)
    : '-'
  const supportRuleSummary = supportSnapshot
    ? t('profile.supportRuleSummaryValue', {
        enabledRules: supportSnapshot.rules.enabledRules,
        totalRules: supportSnapshot.rules.totalRules,
        enabledPacks: supportSnapshot.rules.enabledPacks,
        totalPacks: supportSnapshot.rules.totalPacks
      })
    : '-'
  const supportTunRuleSummary = supportSnapshot
    ? t('profile.tunRuleKindsValue', {
        domainRules: supportSnapshot.tun.helperRulesDomainCount,
        ipCidrRules: supportSnapshot.tun.helperRulesIpCidrCount
      })
    : '-'
  const supportTunRuleReliability = supportSnapshot?.tun.helperRuleReliability
  const showTunRuleReliabilityWarning =
    supportSnapshot?.tun.enabled &&
    supportTunRuleReliability !== undefined &&
    supportTunRuleReliability !== 'reliable'
  const supportUdp = supportSnapshot?.udp
  const readinessSummary = supportSnapshot?.readinessSummary
  const readinessBadgeVariant =
    readinessSummary?.overallStatus === 'blocked' ? 'destructive' : 'outline'
  const topRecommendedActions = readinessSummary?.recommendedActions.slice(0, 3) ?? []
  const startupPreflightBlockers = startupPreflight?.blockingReasons.slice(0, 3) ?? []

  const onStartHelper = async (): Promise<void> => {
    setHelperBusy(true)
    setHelperError(null)
    try {
      setHelperSession(await startAmneziaHelper(id))
      await refreshHelperState()
      await refreshSupportState()
    } catch (e) {
      setHelperError(`${e}`)
    } finally {
      setHelperBusy(false)
    }
  }

  const onStopHelper = async (): Promise<void> => {
    setHelperBusy(true)
    setHelperError(null)
    try {
      setHelperSession(await stopAmneziaHelper(id))
      await refreshHelperState()
      await refreshSupportState()
    } catch (e) {
      setHelperError(`${e}`)
    } finally {
      setHelperBusy(false)
    }
  }

  const onTestConnectivity = async (): Promise<void> => {
    setConnectivityBusy(true)
    setHelperError(null)
    try {
      await validateAmneziaHelperConnectivity(id)
      await refreshHelperState()
      await refreshSupportState()
    } catch (e) {
      setHelperError(`${e}`)
    } finally {
      setConnectivityBusy(false)
    }
  }

  const onExportDiagnostics = async (): Promise<void> => {
    setSupportBusy(true)
    setSupportError(null)
    try {
      const result = await exportAmneziaHelperDiagnosticsBundle(id)
      setSupportSnapshot(result.bundle)
      setDiagnosticsExportPath(result.path)
    } catch (e) {
      setSupportError(`${e}`)
    } finally {
      setSupportBusy(false)
    }
  }

  const onCopySupportSummary = async (): Promise<void> => {
    if (!supportSnapshot) return
    setSupportBusy(true)
    setSupportError(null)
    setSupportSummaryCopied(false)
    try {
      await navigator.clipboard.writeText(JSON.stringify(supportSnapshot.summaryExport, null, 2))
      setSupportSummaryCopied(true)
    } catch (e) {
      setSupportError(`${e}`)
    } finally {
      setSupportBusy(false)
    }
  }

  const onAddHelperRule = async (): Promise<void> => {
    setHelperRulesBusy(true)
    setHelperRulesError(null)
    try {
      await addAmneziaHelperRule({
        packId: selectedRulePack?.id,
        type: ruleDraft.type,
        value: ruleDraft.value,
        note: ruleDraft.note
      })
      setRuleDraft(createEmptyRuleDraft())
      await refreshHelperRules()
    } catch (e) {
      setHelperRulesError(`${e}`)
    } finally {
      setHelperRulesBusy(false)
    }
  }

  const onAddHelperRulePack = async (): Promise<void> => {
    setHelperRulesBusy(true)
    setHelperRulesError(null)
    try {
      const pack = await addAmneziaHelperRulePack({
        name: packDraftName,
        enabled: true
      })
      setPackDraftName('')
      setSelectedRulePackId(pack.id)
      await refreshHelperRules()
    } catch (e) {
      setHelperRulesError(`${e}`)
    } finally {
      setHelperRulesBusy(false)
    }
  }

  const onToggleHelperRulePack = async (
    pack: AmneziaHelperRulePack,
    enabled: boolean
  ): Promise<void> => {
    setHelperRulesBusy(true)
    setHelperRulesError(null)
    try {
      await updateAmneziaHelperRulePack(pack.id, { enabled })
      await refreshHelperRules()
    } catch (e) {
      setHelperRulesError(`${e}`)
    } finally {
      setHelperRulesBusy(false)
    }
  }

  const onStartEditingRule = (rule: AmneziaHelperRule): void => {
    setEditingRuleId(rule.id)
    setEditingRuleDraft({
      type: rule.type,
      value: rule.value,
      note: rule.note ?? ''
    })
  }

  const onSaveEditingRule = async (rule: AmneziaHelperRule): Promise<void> => {
    setHelperRulesBusy(true)
    setHelperRulesError(null)
    try {
      await updateAmneziaHelperRule(rule.id, {
        type: editingRuleDraft.type,
        value: editingRuleDraft.value,
        note: editingRuleDraft.note
      })
      setEditingRuleId(null)
      await refreshHelperRules()
    } catch (e) {
      setHelperRulesError(`${e}`)
    } finally {
      setHelperRulesBusy(false)
    }
  }

  const onToggleHelperRule = async (rule: AmneziaHelperRule, enabled: boolean): Promise<void> => {
    setHelperRulesBusy(true)
    setHelperRulesError(null)
    try {
      await updateAmneziaHelperRule(rule.id, { enabled })
      await refreshHelperRules()
    } catch (e) {
      setHelperRulesError(`${e}`)
    } finally {
      setHelperRulesBusy(false)
    }
  }

  const onDeleteHelperRule = async (rule: AmneziaHelperRule): Promise<void> => {
    setHelperRulesBusy(true)
    setHelperRulesError(null)
    try {
      await removeAmneziaHelperRule(rule.id)
      if (editingRuleId === rule.id) setEditingRuleId(null)
      await refreshHelperRules()
    } catch (e) {
      setHelperRulesError(`${e}`)
    } finally {
      setHelperRulesBusy(false)
    }
  }

  const onBulkAddHelperRules = async (): Promise<void> => {
    setHelperRulesBusy(true)
    setHelperRulesError(null)
    setBulkRuleSummary(null)
    try {
      const result = await bulkAddAmneziaHelperRules({
        packId: selectedRulePack?.id,
        type: bulkRuleType,
        text: bulkRuleText
      })
      setBulkRuleSummary(formatBulkRuleSummary(t, result))
      if (result.summary.added > 0) {
        setBulkRuleText('')
        await refreshHelperRules()
      }
    } catch (e) {
      setHelperRulesError(`${e}`)
    } finally {
      setHelperRulesBusy(false)
    }
  }

  const onExportHelperRulePacks = async (): Promise<void> => {
    setHelperRulesBusy(true)
    setHelperRulesError(null)
    setImportExportSummary(null)
    try {
      setImportExportText(await exportAmneziaHelperRulePacks())
    } catch (e) {
      setHelperRulesError(`${e}`)
    } finally {
      setHelperRulesBusy(false)
    }
  }

  const onImportHelperRulePacks = async (): Promise<void> => {
    setHelperRulesBusy(true)
    setHelperRulesError(null)
    setImportExportSummary(null)
    try {
      const result = await importAmneziaHelperRulePacks(importExportText)
      setImportExportSummary(formatImportRuleSummary(t, result))
      if (result.summary.addedPacks > 0 || result.summary.addedRules > 0) {
        await refreshHelperRules()
      }
    } catch (e) {
      setHelperRulesError(`${e}`)
    } finally {
      setHelperRulesBusy(false)
    }
  }

  const onCreateRuleFromDiagnostic = async (): Promise<void> => {
    if (!diagnosticRuleDraft) return

    setHelperRulesBusy(true)
    setHelperRulesError(null)
    try {
      await addAmneziaHelperRule({
        packId: selectedRulePack?.id,
        type: diagnosticRuleDraft.type,
        value: diagnosticRuleDraft.value,
        note: t('profile.helperRuleFromDiagnostics')
      })
      await refreshHelperRules()
    } catch (e) {
      setHelperRulesError(`${e}`)
    } finally {
      setHelperRulesBusy(false)
    }
  }

  const onEvaluateRouting = async (): Promise<void> => {
    setRoutingDiagnosticBusy(true)
    setRoutingDiagnosticError(null)
    try {
      setRoutingDiagnosticResult(
        await evaluateAmneziaHelperRouting({
          value: routingDiagnosticInput
        })
      )
    } catch (e) {
      setRoutingDiagnosticError(`${e}`)
    } finally {
      setRoutingDiagnosticBusy(false)
    }
  }

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="w-140 sm:max-w-none" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t('profile.amneziaDetails')}</DialogTitle>
          <DialogDescription>{t('profile.amneziaDetailsDescription')}</DialogDescription>
        </DialogHeader>

        {!details && !error && (
          <div className="flex h-32 items-center justify-center">
            <Spinner className="size-5" />
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {details && (
          <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
            <div className="flex flex-wrap gap-1">
              <Badge variant="secondary">{t('profile.badgeImported')}</Badge>
              <Badge variant="secondary">{t('profile.badgeAmnezia')}</Badge>
              <Badge variant="outline">
                {getRuntimeSupportLabel(t, details.runtime.runtimeSupport)}
              </Badge>
              {details.validationIssues.length > 0 ? (
                <Badge variant="destructive">{t('profile.badgeInvalid')}</Badge>
              ) : (
                <Badge variant="outline">{t('profile.validityValid')}</Badge>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <DetailItem label={t('profile.sourceType')} value={details.source?.type ?? '-'} />
              <DetailItem label={t('profile.protocol')} value={details.profile?.protocol ?? '-'} />
              <DetailItem label={t('profile.endpoint')} value={endpoint} />
              <DetailItem label={t('profile.dns')} value={dns.length ? dns.join(', ') : '-'} />
              <DetailItem
                label={t('profile.runtimeSupport')}
                value={getRuntimeSupportLabel(t, details.runtime.runtimeSupport)}
              />
              <DetailItem
                label={t('profile.executionStatus')}
                value={getExecutionStatusLabel(t, details.runtime.executionStatus)}
              />
              <DetailItem
                label={t('profile.executionKind')}
                value={executionPlan?.kind ?? details.runtime.executionKind}
              />
              <DetailItem
                label={t('profile.runtimeAdapter')}
                value={executionPlan?.adapterId ?? '-'}
              />
              <DetailItem
                label={t('profile.desktopPlatform')}
                value={executionPlan?.platform ?? '-'}
              />
              <DetailItem
                label={t('profile.planStatus')}
                value={executionPlan ? getPlanStatusLabel(t, executionPlan.status) : '-'}
              />
              <DetailItem
                label={t('profile.decodedFormat')}
                value={details.profile?.metadata.decodedFormat ?? '-'}
              />
              <DetailItem
                label={t('profile.importedAt')}
                value={importedAt ? dayjs(importedAt).format('YYYY-MM-DD HH:mm:ss') : '-'}
              />
            </div>

            {executionPlan?.helper && (
              <div className="rounded-lg border border-stroke/50 bg-accent/20 p-3">
                <div className="mb-1 text-xs font-medium text-muted-foreground">
                  {t('profile.helperCommand')}
                </div>
                <div className="break-all font-mono text-xs">{helperCommand}</div>
              </div>
            )}

            <div className="rounded-lg border border-stroke/50 bg-accent/20 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    {t('profile.amneziaRoutingDiagnostics')}
                  </div>
                  <Badge
                    variant={
                      routingDiagnosticResult?.reasonCode === 'helper_rule_match'
                        ? 'outline'
                        : routingDiagnosticResult
                          ? 'secondary'
                          : 'outline'
                    }
                  >
                    {routingDiagnosticResult
                      ? getRoutingDiagnosticReasonLabel(t, routingDiagnosticResult.reasonCode)
                      : t('profile.routingDiagnosticNotEvaluated')}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                <Input
                  className="h-8 text-xs"
                  value={routingDiagnosticInput}
                  placeholder={t('profile.routingDiagnosticPlaceholder')}
                  disabled={routingDiagnosticBusy}
                  onChange={(event) => setRoutingDiagnosticInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && routingDiagnosticInput.trim()) {
                      void onEvaluateRouting()
                    }
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={routingDiagnosticBusy || !routingDiagnosticInput.trim()}
                  onClick={onEvaluateRouting}
                >
                  {t('profile.evaluateRouting')}
                </Button>
              </div>

              {routingDiagnosticError && (
                <div className="mt-3 text-xs text-destructive">{routingDiagnosticError}</div>
              )}

              {routingDiagnosticResult && (
                <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                  <RuntimeRow
                    label={t('profile.routingDiagnosticInput')}
                    value={
                      routingDiagnosticResult.input.domain ??
                      routingDiagnosticResult.input.ip ??
                      routingDiagnosticResult.input.host ??
                      routingDiagnosticResult.input.raw
                    }
                  />
                  <RuntimeRow
                    label={t('profile.routingDiagnosticMatched')}
                    value={formatBoolean(t, routingDiagnosticResult.matched)}
                  />
                  <RuntimeRow
                    label={t('profile.routingDiagnosticRule')}
                    value={
                      routingDiagnosticResult.matchedRuleType
                        ? `${routingDiagnosticResult.matchedRuleType},${routingDiagnosticResult.matchedRuleValue}`
                        : '-'
                    }
                  />
                  <RuntimeRow
                    label={t('profile.routingDiagnosticTarget')}
                    value={routingDiagnosticResult.resultingTarget?.groupName ?? '-'}
                  />
                  <RuntimeRow
                    label={t('profile.routingDiagnosticHelperInjected')}
                    value={formatBoolean(t, routingDiagnosticResult.helperInjected)}
                  />
                  <RuntimeRow
                    label={t('profile.routingDiagnosticHelperReady')}
                    value={formatBoolean(t, routingDiagnosticResult.helperReady)}
                  />
                </div>
              )}

              {routingDiagnosticResult && (
                <div className="mt-3 text-xs text-muted-foreground">
                  {routingDiagnosticResult.explanation}
                </div>
              )}

              {diagnosticRuleDraft && (
                <Button
                  className="mt-3"
                  size="sm"
                  variant="outline"
                  disabled={helperRulesBusy}
                  onClick={onCreateRuleFromDiagnostic}
                >
                  <Plus className="size-4" />
                  {t('profile.createRuleFromDiagnostics')}
                </Button>
              )}
            </div>

            <div className="rounded-lg border border-stroke/50 bg-accent/20 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    {t('profile.helperLifecycle')}
                  </div>
                  <Badge variant={helperStatus === 'failed' ? 'destructive' : 'outline'}>
                    {getHelperStatusLabel(t, helperStatus)}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onStartHelper}
                    disabled={!canStartHelper || helperBusy}
                  >
                    {t('profile.startHelperPrototype')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onStopHelper}
                    disabled={!canStopHelper || helperBusy}
                  >
                    {t('profile.stopHelperPrototype')}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                <RuntimeRow
                  label={t('profile.backendMode')}
                  value={getBackendModeLabel(t, helperSession?.backendMode)}
                />
                <RuntimeRow
                  label={t('profile.helperManagedByApp')}
                  value={formatBoolean(t, helperSession?.managedByApp ?? false)}
                />
                <RuntimeRow
                  label={t('profile.helperDesiredState')}
                  value={getHelperDesiredStateLabel(t, helperSession?.desiredState)}
                />
                <RuntimeRow
                  label={t('profile.helperRestartCount')}
                  value={(helperSession?.restartCount ?? 0).toString()}
                />
                <RuntimeRow
                  label={t('profile.helperLastExitReason')}
                  value={
                    helperSession?.lastExitReason
                      ? getHelperExitReasonLabel(t, helperSession.lastExitReason)
                      : '-'
                  }
                />
                <RuntimeRow
                  label={t('profile.helperBackendSource')}
                  value={getBackendPathSourceLabel(t, supportSnapshot?.backend.pathSource)}
                />
                <RuntimeRow
                  label={t('profile.helperCrashLoop')}
                  value={formatBoolean(t, helperSession?.crashLoopDetected ?? false)}
                />
                <RuntimeRow
                  label={t('profile.readiness')}
                  value={getReadinessLabel(t, helperReadiness)}
                />
                <RuntimeRow label={t('profile.localProxyEndpoint')} value={helperEndpoint} />
                <RuntimeRow
                  label={t('profile.configStatus')}
                  value={getConfigStatusLabel(t, helperSession?.configStatus)}
                />
                <RuntimeRow
                  label={t('profile.routingTarget')}
                  value={helperRoutingTarget?.groupName ?? 'AMNEZIA_HELPER'}
                />
                <RuntimeRow
                  label={t('profile.routingTargetStatus')}
                  value={getRoutingTargetStatusLabel(t, helperRoutingTarget?.status)}
                />
                <RuntimeRow
                  label={t('profile.routingOutbound')}
                  value={helperRoutingTarget?.outboundName ?? 'AMNEZIA_HELPER_PROXY'}
                />
                <RuntimeRow label={t('profile.routingEndpoint')} value={helperRoutingEndpoint} />
                <RuntimeRow
                  label={t('profile.sessionId')}
                  value={helperSession?.sessionId || '-'}
                />
                <RuntimeRow
                  label={t('profile.pid')}
                  value={helperSession?.pid?.toString() ?? '-'}
                />
                <RuntimeRow
                  label={t('profile.startedAt')}
                  value={formatTimestamp(helperSession?.startedAt)}
                />
                <RuntimeRow
                  label={t('profile.stoppedAt')}
                  value={formatTimestamp(helperSession?.stoppedAt)}
                />
              </div>

              <div className="mt-3 border-t border-stroke/50 pt-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="text-xs font-medium text-muted-foreground">
                      {t('profile.connectivityValidation')}
                    </div>
                    <Badge variant={connectivityStatus === 'failed' ? 'destructive' : 'outline'}>
                      {getConnectivityStatusLabel(t, connectivityStatus)}
                    </Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onTestConnectivity}
                    disabled={!canTestConnectivity || connectivityBusy}
                  >
                    {t('profile.testConnection')}
                  </Button>
                </div>

                {!canTestConnectivity && (
                  <div className="mb-3 text-xs text-muted-foreground">
                    {t('profile.connectivityUnavailableDescription')}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                  <RuntimeRow
                    label={t('profile.validationStage')}
                    value={getValidationStageLabel(t, connectivityStage)}
                  />
                  <RuntimeRow
                    label={t('profile.lastConnectivityCheck')}
                    value={formatTimestamp(helperSession?.lastConnectivityCheckAt)}
                  />
                  <RuntimeRow
                    label={t('profile.connectivityEndpoint')}
                    value={connectivityEndpoint}
                  />
                  <RuntimeRow
                    label={t('profile.connectivityLatency')}
                    value={connectivityLatency}
                  />
                  <RuntimeRow
                    label={t('profile.connectivityDuration')}
                    value={connectivityDuration}
                  />
                  <RuntimeRow
                    label={t('profile.connectivityDiagnosticCategory')}
                    value={
                      connectivityDiagnostic
                        ? getDiagnosticCategoryLabel(t, connectivityDiagnostic.category)
                        : '-'
                    }
                  />
                </div>

                {connectivityStatus === 'verified' && (
                  <div className="mt-3 text-xs text-muted-foreground">
                    {t('profile.connectivitySuccess')}
                  </div>
                )}

                {(connectivityDiagnostic || helperSession?.lastConnectivityError) && (
                  <div className="mt-3 text-xs text-destructive">
                    {connectivityDiagnostic?.message ?? helperSession?.lastConnectivityError}
                  </div>
                )}
              </div>

              <div className="mt-3 border-t border-stroke/50 pt-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="text-xs font-medium text-muted-foreground">
                      {t('profile.supportDiagnostics')}
                    </div>
                    <Badge variant={supportBadgeVariant}>
                      {getSupportSeverityLabel(t, supportSeverity)}
                    </Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onExportDiagnostics}
                    disabled={supportBusy}
                  >
                    <Download className="size-4" />
                    {t('profile.exportDiagnostics')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onCopySupportSummary}
                    disabled={supportBusy || !supportSnapshot}
                  >
                    <Copy className="size-4" />
                    {t('profile.copySupportSummary')}
                  </Button>
                </div>

                {readinessSummary && (
                  <div className="mb-3 rounded-md border border-stroke/50 bg-background/50 p-3 text-xs">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium">{t('profile.helperReadinessSummary')}</div>
                      <Badge variant={readinessBadgeVariant}>
                        {getReadinessOverallLabel(t, readinessSummary.overallStatus)}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <RuntimeRow
                        label={t('profile.helperReadinessHelper')}
                        value={getReadinessComponentLabel(t, readinessSummary.helperStatus)}
                      />
                      <RuntimeRow
                        label={t('profile.helperReadinessTun')}
                        value={getReadinessComponentLabel(t, readinessSummary.tunStatus)}
                      />
                      <RuntimeRow
                        label={t('profile.helperReadinessDnsRules')}
                        value={getReadinessComponentLabel(
                          t,
                          readinessSummary.dnsRuleReliabilityStatus
                        )}
                      />
                      <RuntimeRow
                        label={t('profile.helperReadinessUdp')}
                        value={getReadinessComponentLabel(t, readinessSummary.udpStatus)}
                      />
                      <RuntimeRow
                        label={t('profile.helperReadinessStability')}
                        value={getReadinessComponentLabel(t, readinessSummary.stabilityStatus)}
                      />
                      <RuntimeRow
                        label={t('profile.releaseReadiness')}
                        value={getReleaseReadinessLabel(t, readinessSummary.releaseStatus)}
                      />
                    </div>

                    {readinessSummary.topIssues.length > 0 && (
                      <div className="mt-3">
                        <div className="mb-1 font-medium">
                          {t('profile.helperReadinessTopIssues')}
                        </div>
                        <div className="space-y-1">
                          {readinessSummary.topIssues.slice(0, 3).map((issue) => (
                            <div key={issue.code} className="text-muted-foreground">
                              {issue.title}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {topRecommendedActions.length > 0 && (
                      <div className="mt-3">
                        <div className="mb-1 font-medium">
                          {t('profile.helperReadinessRecommendedActions')}
                        </div>
                        <div className="space-y-1">
                          {topRecommendedActions.map((action) => (
                            <div key={action.code} className="text-muted-foreground">
                              {action.message}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                  <RuntimeRow
                    label={t('profile.startupPreflight')}
                    value={getStartupPreflightLabel(t, startupPreflight)}
                  />
                  <RuntimeRow
                    label={t('profile.startupPreflightBackend')}
                    value={getStartupPreflightStatusLabel(t, startupPreflight?.backendStatus)}
                  />
                  <RuntimeRow
                    label={t('profile.startupPreflightProfile')}
                    value={getStartupPreflightStatusLabel(t, startupPreflight?.profileStatus)}
                  />
                  <RuntimeRow
                    label={t('profile.startupPreflightEndpoint')}
                    value={getStartupPreflightStatusLabel(t, startupPreflight?.endpointStatus)}
                  />
                  <RuntimeRow
                    label={t('profile.startupPreflightConfig')}
                    value={getStartupPreflightStatusLabel(t, startupPreflight?.configStatus)}
                  />
                  <RuntimeRow
                    label={t('profile.startupPreflightTunBypass')}
                    value={getStartupTunBypassStatusLabel(t, startupPreflight?.tunBypassStatus)}
                  />
                  <RuntimeRow
                    label={t('profile.desktopPlatform')}
                    value={
                      supportSnapshot
                        ? `${supportSnapshot.platform.platform}/${supportSnapshot.platform.arch}`
                        : '-'
                    }
                  />
                  <RuntimeRow
                    label={t('profile.backendState')}
                    value={getSupportBackendKindLabel(t, supportBackendState)}
                  />
                  <RuntimeRow
                    label={t('profile.helperVersion')}
                    value={supportSnapshot?.backend.helperVersion ?? '-'}
                  />
                  <RuntimeRow label={t('profile.helperChecksum')} value={supportHelperChecksum} />
                  <RuntimeRow
                    label={t('profile.releaseReadiness')}
                    value={getReleaseReadinessLabel(t, supportSummary?.releaseReadiness.status)}
                  />
                  <RuntimeRow
                    label={t('profile.diagnosticsGeneratedAt')}
                    value={formatTimestamp(supportSnapshot?.generatedAt)}
                  />
                  <RuntimeRow label={t('profile.supportRuleSummary')} value={supportRuleSummary} />
                  <RuntimeRow
                    label={t('profile.supportStatusCode')}
                    value={supportPrimaryStatus?.code ?? '-'}
                  />
                  <RuntimeRow
                    label={t('profile.tunState')}
                    value={formatBoolean(t, supportSnapshot?.tun.enabled ?? false)}
                  />
                  <RuntimeRow
                    label={t('profile.tunBypassState')}
                    value={
                      supportSnapshot?.tun.helperBypassActive
                        ? t('profile.tunBypassActive')
                        : t('profile.tunBypassInactive')
                    }
                  />
                  <RuntimeRow
                    label={t('profile.tunBypassIps')}
                    value={String(supportSnapshot?.tun.helperBypassIpsCount ?? 0)}
                  />
                  <RuntimeRow
                    label={t('profile.tunBypassResolution')}
                    value={supportSnapshot?.tun.helperBypassResolutionStatus ?? '-'}
                  />
                  <RuntimeRow
                    label={t('profile.directTunBypass')}
                    value={
                      supportSnapshot?.tun.directExcludeActive
                        ? t('profile.tunBypassActive')
                        : t('profile.tunBypassInactive')
                    }
                  />
                  <RuntimeRow
                    label={t('profile.directTunBypassRules')}
                    value={String(supportSnapshot?.tun.directExcludeRuleCount ?? 0)}
                  />
                  <RuntimeRow
                    label={t('profile.directTunBypassIps')}
                    value={String(supportSnapshot?.tun.directExcludeResolvedAddressCount ?? 0)}
                  />
                  <RuntimeRow
                    label={t('profile.directTunBypassStatus')}
                    value={supportSnapshot?.tun.directExcludeOverallStatus ?? '-'}
                  />
                  <RuntimeRow
                    label={t('profile.learnedProcessBypass')}
                    value={
                      supportSnapshot?.tun.learnedBypassActive
                        ? t('profile.tunBypassActive')
                        : t('profile.tunBypassInactive')
                    }
                  />
                  <RuntimeRow
                    label={t('profile.learnedProcessBypassEntries')}
                    value={String(supportSnapshot?.tun.learnedBypassEntryCount ?? 0)}
                  />
                  <RuntimeRow
                    label={t('profile.learnedProcessBypassStatus')}
                    value={supportSnapshot?.tun.learnedBypassOverallStatus ?? '-'}
                  />
                  <RuntimeRow
                    label={t('profile.nativeProcessBypass')}
                    value={
                      supportSnapshot?.tun.nativeProcessBypassActive
                        ? t('profile.tunBypassActive')
                        : t('profile.tunBypassInactive')
                    }
                  />
                  <RuntimeRow
                    label={t('profile.nativeProcessBypassStatus')}
                    value={supportSnapshot?.tun.nativeProcessBypassStatus ?? '-'}
                  />
                  <RuntimeRow
                    label={t('profile.nativeProcessBypassPlatform')}
                    value={supportSnapshot?.tun.nativeProcessBypassPlatformMode ?? '-'}
                  />
                  <RuntimeRow
                    label={t('profile.nativeProcessBypassPrerequisites')}
                    value={supportSnapshot?.tun.nativeProcessBypassPrerequisiteStatus ?? '-'}
                  />
                  {supportSnapshot?.tun.nativeProcessBypassPlatformMode === 'windows_wfp_service' ||
                  supportSnapshot?.tun.nativeProcessBypassPlatformMode === 'windows_scaffold' ? (
                    <>
                      <RuntimeRow
                        label={t('profile.nativeProcessBypassWindowsService')}
                        value={
                          supportSnapshot?.tun.nativeProcessBypassWindowsServiceAvailable
                            ? t('profile.tunBypassActive')
                            : t('profile.tunBypassInactive')
                        }
                      />
                      <RuntimeRow
                        label={t('profile.nativeProcessBypassWindowsController')}
                        value={
                          supportSnapshot?.tun.nativeProcessBypassWindowsControllerAvailable
                            ? t('profile.tunBypassActive')
                            : t('profile.tunBypassInactive')
                        }
                      />
                    </>
                  ) : null}
                  <RuntimeRow
                    label={t('profile.nativeProcessBypassFallback')}
                    value={
                      supportSnapshot?.tun.nativeProcessBypassFallbackReason ??
                      (supportSnapshot?.tun.nativeProcessBypassFallbackOnly
                        ? t('profile.tunBypassActive')
                        : t('profile.tunBypassInactive'))
                    }
                  />
                  <RuntimeRow
                    label={t('profile.nativeProcessBypassPids')}
                    value={String(supportSnapshot?.tun.nativeProcessBypassTrackedPidCount ?? 0)}
                  />
                  <RuntimeRow
                    label={t('profile.nativeProcessBypassReconcile')}
                    value={
                      supportSnapshot?.tun.nativeProcessBypassReconcileActive
                        ? t('profile.tunBypassActive')
                        : t('profile.tunBypassInactive')
                    }
                  />
                  <RuntimeRow
                    label={t('profile.nativeProcessBypassNewPids')}
                    value={String(supportSnapshot?.tun.nativeProcessBypassNewlyBoundPidCount ?? 0)}
                  />
                  <RuntimeRow
                    label={t('profile.nativeProcessBypassStalePids')}
                    value={String(supportSnapshot?.tun.nativeProcessBypassDeadPidCleanupCount ?? 0)}
                  />
                  <RuntimeRow
                    label={t('profile.processDirectBypassMode')}
                    value={supportSnapshot?.tun.processDirectEffectiveBypassMode ?? '-'}
                  />
                  <RuntimeRow
                    label={t('profile.tunDnsHijack')}
                    value={formatBoolean(t, supportSnapshot?.tun.dnsHijackEnabled ?? false)}
                  />
                  <RuntimeRow
                    label={t('profile.tunDnsMode')}
                    value={supportSnapshot?.tun.dnsEnhancedMode ?? '-'}
                  />
                  <RuntimeRow label={t('profile.tunRuleKinds')} value={supportTunRuleSummary} />
                  <RuntimeRow
                    label={t('profile.helperRuleReliability')}
                    value={getHelperRuleReliabilityLabel(t, supportTunRuleReliability)}
                  />
                  <RuntimeRow
                    label={t('profile.udpSupport')}
                    value={getUdpSupportLabel(t, supportUdp?.udpSupport)}
                  />
                  <RuntimeRow
                    label={t('profile.udpValidated')}
                    value={formatBoolean(t, supportUdp?.udpValidated ?? false)}
                  />
                  <RuntimeRow
                    label={t('profile.udpAdvertised')}
                    value={formatBoolean(t, supportUdp?.runtimeAdvertisesUdp ?? false)}
                  />
                  <RuntimeRow
                    label={t('profile.udpReason')}
                    value={supportUdp?.udpReasonCode ?? '-'}
                  />
                </div>

                {startupPreflightBlockers.length > 0 && (
                  <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs">
                    <div className="font-medium">{t('profile.startupPreflightBlockers')}</div>
                    <div className="mt-1 space-y-1 text-muted-foreground">
                      {startupPreflightBlockers.map((reason) => (
                        <div key={`${reason.stage}:${reason.code}`}>{reason.message}</div>
                      ))}
                    </div>
                  </div>
                )}

                {showTunRuleReliabilityWarning && (
                  <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs">
                    <div className="font-medium">{t('profile.helperRuleReliabilityWarning')}</div>
                    <div className="mt-1 text-muted-foreground">
                      {supportSnapshot?.tun.helperRuleReliabilityExplanation}
                    </div>
                  </div>
                )}

                {supportSnapshot?.tun.directExcludeEnabled &&
                  supportSnapshot.tun.directExcludeWarnings.length > 0 && (
                    <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs">
                      <div className="font-medium">{t('profile.directTunBypassWarning')}</div>
                      <div className="mt-1 space-y-1 text-muted-foreground">
                        {supportSnapshot.tun.directExcludeWarnings.slice(0, 3).map((warning) => (
                          <div key={warning}>{warning}</div>
                        ))}
                      </div>
                    </div>
                  )}

                {supportSnapshot?.tun.learnedBypassEnabled &&
                  supportSnapshot.tun.learnedBypassWarnings.length > 0 && (
                    <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs">
                      <div className="font-medium">{t('profile.learnedProcessBypassWarning')}</div>
                      <div className="mt-1 space-y-1 text-muted-foreground">
                        {supportSnapshot.tun.learnedBypassWarnings.slice(0, 3).map((warning) => (
                          <div key={warning}>{warning}</div>
                        ))}
                      </div>
                    </div>
                  )}

                {(supportSnapshot?.tun.bypassCapabilityWarnings?.length ?? 0) > 0 && (
                  <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs">
                    <div className="font-medium">{t('profile.bypassCapabilityWarning')}</div>
                    <div className="mt-1 space-y-1 text-muted-foreground">
                      {supportSnapshot?.tun.bypassCapabilityWarnings?.slice(0, 3).map((warning) => (
                        <div key={warning}>{warning}</div>
                      ))}
                    </div>
                  </div>
                )}

                {supportUdp && !supportUdp.runtimeAdvertisesUdp && (
                  <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs">
                    <div className="font-medium">{t('profile.udpTcpOnlyWarning')}</div>
                    <div className="mt-1 text-muted-foreground">{supportUdp.udpExplanation}</div>
                  </div>
                )}

                {supportPrimaryStatus && (
                  <div className="mt-3 rounded-md border border-stroke/50 bg-background/50 p-2 text-xs">
                    <div className="font-medium">{supportPrimaryStatus.title}</div>
                    <div className="mt-1 text-muted-foreground">{supportPrimaryStatus.message}</div>
                  </div>
                )}

                {supportError && (
                  <div className="mt-3 text-xs text-destructive">{supportError}</div>
                )}

                {diagnosticsExportPath && (
                  <div className="mt-3 truncate text-xs text-muted-foreground">
                    {t('profile.diagnosticsExportedTo')}: {diagnosticsExportPath}
                  </div>
                )}

                {supportSummaryCopied && (
                  <div className="mt-3 text-xs text-muted-foreground">
                    {t('profile.supportSummaryCopied')}
                  </div>
                )}
              </div>

              {(helperError || helperSession?.lastError) && (
                <div className="mt-3 text-xs text-destructive">
                  {helperError || helperSession?.lastError}
                </div>
              )}

              {helperSession?.configError && (
                <div className="mt-3 text-xs text-destructive">{helperSession.configError}</div>
              )}

              {helperRoutingTarget?.reason && helperRoutingTarget.status !== 'injected' && (
                <div className="mt-3 text-xs text-muted-foreground">
                  {t('profile.routingTargetReason')}: {helperRoutingTarget.reason}
                </div>
              )}

              {helperSession?.startupDiagnostics.length ? (
                <div className="mt-3 flex flex-col gap-1.5">
                  <div className="text-xs font-medium text-muted-foreground">
                    {t('profile.startupDiagnostics')}
                  </div>
                  <Textarea
                    readOnly
                    className="max-h-28 min-h-20 resize-none font-mono text-xs"
                    value={helperSession.startupDiagnostics.join('\n')}
                  />
                </div>
              ) : null}

              <div className="mt-3 flex flex-col gap-1.5">
                <div className="text-xs font-medium text-muted-foreground">
                  {t('profile.helperLogs')}
                </div>
                <Textarea
                  readOnly
                  className="max-h-36 min-h-24 resize-none font-mono text-xs"
                  value={formatHelperLogs(helperLogs)}
                />
              </div>
            </div>

            <div className="rounded-lg border border-stroke/50 bg-accent/20 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    {t('profile.amneziaHelperRules')}
                  </div>
                  <Badge variant={helperRulesActive ? 'outline' : 'secondary'}>
                    {helperRulesActive
                      ? t('profile.helperRulesActive')
                      : t('profile.helperRulesInactive')}
                  </Badge>
                </div>
                <div className="flex gap-1">
                  <Badge variant="secondary">
                    {helperRulePacks.length} {t('profile.helperRulePacks')}
                  </Badge>
                  <Badge variant="secondary">
                    {helperRules.length} {t('profile.helperRulesCount')}
                  </Badge>
                </div>
              </div>

              {!helperRulesActive && (
                <div className="mb-3 text-xs text-muted-foreground">
                  {t('profile.helperRulesInactiveDescription')}
                </div>
              )}

              <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_180px]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-2 size-4 text-muted-foreground" />
                  <Input
                    className="h-8 pl-8 text-xs"
                    value={helperRuleSearch}
                    placeholder={t('profile.helperRuleSearchPlaceholder')}
                    disabled={helperRulesBusy}
                    onChange={(event) => setHelperRuleSearch(event.target.value)}
                  />
                </div>
                <Select
                  value={selectedRulePack?.id ?? selectedRulePackId}
                  onValueChange={setSelectedRulePackId}
                  disabled={helperRulesBusy || helperRulePacks.length === 0}
                >
                  <SelectTrigger size="sm" className="h-8 w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {helperRulePacks.map((pack) => (
                      <SelectItem key={pack.id} value={pack.id}>
                        {pack.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                <Input
                  className="h-8 text-xs"
                  value={packDraftName}
                  placeholder={t('profile.helperRulePackNamePlaceholder')}
                  disabled={helperRulesBusy}
                  onChange={(event) => setPackDraftName(event.target.value)}
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={helperRulesBusy || !packDraftName.trim()}
                  onClick={onAddHelperRulePack}
                >
                  <Plus className="size-4" />
                  {t('profile.addHelperRulePack')}
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[150px_1fr_1fr_auto]">
                <HelperRuleTypeSelect
                  value={ruleDraft.type}
                  disabled={helperRulesBusy}
                  onChange={(type) => setRuleDraft((prev) => ({ ...prev, type }))}
                />
                <Input
                  className="h-8 text-xs"
                  value={ruleDraft.value}
                  placeholder={t('profile.helperRuleValuePlaceholder')}
                  disabled={helperRulesBusy}
                  onChange={(event) =>
                    setRuleDraft((prev) => ({ ...prev, value: event.target.value }))
                  }
                />
                <Input
                  className="h-8 text-xs"
                  value={ruleDraft.note}
                  placeholder={t('profile.helperRuleNotePlaceholder')}
                  disabled={helperRulesBusy}
                  onChange={(event) =>
                    setRuleDraft((prev) => ({ ...prev, note: event.target.value }))
                  }
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={helperRulesBusy || !selectedRulePack || !ruleDraft.value.trim()}
                  onClick={onAddHelperRule}
                >
                  <Plus className="size-4" />
                  {t('profile.addHelperRule')}
                </Button>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[150px_1fr_auto]">
                <HelperRuleTypeSelect
                  value={bulkRuleType}
                  disabled={helperRulesBusy}
                  onChange={setBulkRuleType}
                />
                <Textarea
                  className="max-h-28 min-h-20 resize-none font-mono text-xs"
                  value={bulkRuleText}
                  placeholder={t('profile.bulkHelperRulesPlaceholder')}
                  disabled={helperRulesBusy}
                  onChange={(event) => setBulkRuleText(event.target.value)}
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={helperRulesBusy || !selectedRulePack || !bulkRuleText.trim()}
                  onClick={onBulkAddHelperRules}
                >
                  <Plus className="size-4" />
                  {t('profile.bulkAddHelperRules')}
                </Button>
              </div>

              {bulkRuleSummary && (
                <div className="mt-2 text-xs text-muted-foreground">{bulkRuleSummary}</div>
              )}

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
                <Textarea
                  className="max-h-32 min-h-20 resize-none font-mono text-xs"
                  value={importExportText}
                  placeholder={t('profile.helperRuleImportExportPlaceholder')}
                  disabled={helperRulesBusy}
                  onChange={(event) => setImportExportText(event.target.value)}
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={helperRulesBusy}
                  onClick={onExportHelperRulePacks}
                >
                  <Download className="size-4" />
                  {t('profile.exportHelperRulePacks')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={helperRulesBusy || !importExportText.trim()}
                  onClick={onImportHelperRulePacks}
                >
                  <Upload className="size-4" />
                  {t('profile.importHelperRulePacks')}
                </Button>
              </div>

              {importExportSummary && (
                <div className="mt-2 text-xs text-muted-foreground">{importExportSummary}</div>
              )}

              {helperRulesError && (
                <div className="mt-3 text-xs text-destructive">{helperRulesError}</div>
              )}

              <div className="mt-3 flex flex-col gap-2">
                {helperRules.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-stroke/60 px-3 py-4 text-center text-xs text-muted-foreground">
                    {t('profile.noHelperRules')}
                  </div>
                ) : (
                  visibleHelperRulePacks.map((pack) => (
                    <div key={pack.id} className="rounded-lg border border-stroke/50 px-3 py-2">
                      <div className="mb-2 flex min-w-0 items-center gap-2">
                        <Switch
                          size="sm"
                          checked={pack.enabled}
                          disabled={helperRulesBusy}
                          onCheckedChange={(enabled) =>
                            onToggleHelperRulePack(pack, Boolean(enabled))
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <span className="truncate text-xs font-medium" title={pack.name}>
                              {pack.name}
                            </span>
                            {!pack.enabled && (
                              <Badge variant="secondary">
                                {t('profile.helperRulePackDisabled')}
                              </Badge>
                            )}
                            <Badge variant="outline">
                              {pack.rules.length} {t('profile.helperRulesCount')}
                            </Badge>
                          </div>
                          {pack.note && (
                            <div className="mt-1 truncate text-xs text-muted-foreground">
                              {pack.note}
                            </div>
                          )}
                        </div>
                      </div>

                      {pack.rules.length === 0 ? (
                        <div className="rounded-md border border-dashed border-stroke/60 px-3 py-3 text-center text-xs text-muted-foreground">
                          {t('profile.noHelperRulesInPack')}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {pack.rules.map((rule) => {
                            const isEditing = editingRuleId === rule.id

                            return (
                              <div
                                key={rule.id}
                                className="rounded-md border border-stroke/40 px-3 py-2"
                              >
                                {isEditing ? (
                                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[150px_1fr_1fr_auto_auto]">
                                    <HelperRuleTypeSelect
                                      value={editingRuleDraft.type}
                                      disabled={helperRulesBusy}
                                      onChange={(type) =>
                                        setEditingRuleDraft((prev) => ({ ...prev, type }))
                                      }
                                    />
                                    <Input
                                      className="h-8 text-xs"
                                      value={editingRuleDraft.value}
                                      disabled={helperRulesBusy}
                                      onChange={(event) =>
                                        setEditingRuleDraft((prev) => ({
                                          ...prev,
                                          value: event.target.value
                                        }))
                                      }
                                    />
                                    <Input
                                      className="h-8 text-xs"
                                      value={editingRuleDraft.note}
                                      disabled={helperRulesBusy}
                                      onChange={(event) =>
                                        setEditingRuleDraft((prev) => ({
                                          ...prev,
                                          note: event.target.value
                                        }))
                                      }
                                    />
                                    <Button
                                      size="icon-sm"
                                      variant="ghost"
                                      title={t('common.save')}
                                      disabled={helperRulesBusy || !editingRuleDraft.value.trim()}
                                      onClick={() => onSaveEditingRule(rule)}
                                    >
                                      <Save className="size-4" />
                                    </Button>
                                    <Button
                                      size="icon-sm"
                                      variant="ghost"
                                      title={t('common.cancel')}
                                      disabled={helperRulesBusy}
                                      onClick={() => setEditingRuleId(null)}
                                    >
                                      <X className="size-4" />
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="flex min-w-0 items-center gap-3">
                                    <Switch
                                      size="sm"
                                      checked={rule.enabled}
                                      disabled={helperRulesBusy}
                                      onCheckedChange={(enabled) =>
                                        onToggleHelperRule(rule, Boolean(enabled))
                                      }
                                    />
                                    <div className="min-w-0 flex-1">
                                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                        <Badge variant="outline">{rule.type}</Badge>
                                        <span
                                          className="truncate font-mono text-xs font-medium"
                                          title={rule.value}
                                        >
                                          {rule.value}
                                        </span>
                                        {!rule.enabled && (
                                          <Badge variant="secondary">
                                            {t('profile.helperRuleDisabled')}
                                          </Badge>
                                        )}
                                      </div>
                                      {rule.note && (
                                        <div className="mt-1 truncate text-xs text-muted-foreground">
                                          {rule.note}
                                        </div>
                                      )}
                                    </div>
                                    <Button
                                      size="icon-sm"
                                      variant="ghost"
                                      title={t('common.edit')}
                                      disabled={helperRulesBusy}
                                      onClick={() => onStartEditingRule(rule)}
                                    >
                                      <Pencil className="size-4" />
                                    </Button>
                                    <Button
                                      size="icon-sm"
                                      variant="ghost"
                                      title={t('common.delete')}
                                      disabled={helperRulesBusy}
                                      onClick={() => onDeleteHelperRule(rule)}
                                    >
                                      <Trash2 className="size-4" />
                                    </Button>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {executionPlan?.compatibility.blockers.length ? (
              <RuntimeMessages
                title={t('profile.runtimeBlockers')}
                tone="danger"
                items={executionPlan.compatibility.blockers}
              />
            ) : null}

            {executionPlan?.compatibility.warnings.length ? (
              <RuntimeMessages
                title={t('profile.runtimeWarnings')}
                tone="warning"
                items={executionPlan.compatibility.warnings}
              />
            ) : null}

            {details.validationIssues.length > 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <div className="mb-2 text-xs font-medium text-destructive">
                  {t('profile.validationIssues')}
                </div>
                <div className="flex flex-col gap-1 text-xs text-destructive">
                  {details.validationIssues.map((issue) => (
                    <div key={`${issue.path}-${issue.code}`}>
                      {issue.path}: {issue.message}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <div className="text-xs font-medium text-muted-foreground">
                {t('profile.rawImportSource')}
              </div>
              <Textarea
                readOnly
                className="max-h-40 min-h-24 resize-none font-mono text-xs"
                value={details.source?.raw ?? ''}
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

const RuntimeRow: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  return (
    <div className="flex min-w-0 justify-between gap-2">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="truncate font-medium" title={value}>
        {value}
      </span>
    </div>
  )
}

const RuntimeMessages: React.FC<{
  title: string
  tone: 'danger' | 'warning'
  items: string[]
}> = ({ title, tone, items }) => {
  const className =
    tone === 'danger'
      ? 'border-destructive/30 bg-destructive/5 text-destructive'
      : 'border-warning/30 bg-warning/5 text-warning'

  return (
    <div className={`rounded-lg border p-3 ${className}`}>
      <div className="mb-2 text-xs font-medium">{title}</div>
      <div className="flex flex-col gap-1 text-xs">
        {items.map((item) => (
          <div key={item}>{item}</div>
        ))}
      </div>
    </div>
  )
}

const DetailItem: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  return (
    <div className="rounded-lg border border-stroke/50 bg-accent/20 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-medium" title={value}>
        {value}
      </div>
    </div>
  )
}

const HelperRuleTypeSelect: React.FC<{
  value: AmneziaHelperRuleType
  disabled: boolean
  onChange: (value: AmneziaHelperRuleType) => void
}> = ({ value, disabled, onChange }) => {
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(nextValue) => onChange(nextValue as AmneziaHelperRuleType)}
    >
      <SelectTrigger size="sm" className="h-8 w-full text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {helperRuleTypes.map((type) => (
          <SelectItem key={type} value={type}>
            {type}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
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

function getExecutionStatusLabel(
  t: ReturnType<typeof useTranslation>['t'],
  status: ProfileExecutionStatus
): string {
  switch (status) {
    case 'ready_for_runtime':
      return t('profile.executionReadyForRuntime')
    case 'dry_run_available':
      return t('profile.executionDryRunAvailable')
    case 'requires_helper':
      return t('profile.executionRequiresHelper')
    case 'error':
      return t('profile.executionError')
    case 'not_supported':
    default:
      return t('profile.executionNotSupported')
  }
}

function getPlanStatusLabel(
  t: ReturnType<typeof useTranslation>['t'],
  status: RuntimePlanStatus
): string {
  switch (status) {
    case 'ready':
      return t('profile.planReady')
    case 'dry_run':
      return t('profile.planDryRun')
    case 'unsupported':
      return t('profile.planUnsupported')
  }
}

function getHelperStatusLabel(
  t: ReturnType<typeof useTranslation>['t'],
  status: AmneziaHelperSessionStatus
): string {
  switch (status) {
    case 'idle':
      return t('profile.helperStatusIdle')
    case 'starting':
      return t('profile.helperStatusStarting')
    case 'running':
      return t('profile.helperStatusRunning')
    case 'restarting':
      return t('profile.helperStatusRestarting')
    case 'stopping':
      return t('profile.helperStatusStopping')
    case 'stopped':
      return t('profile.helperStatusStopped')
    case 'failed':
      return t('profile.helperStatusFailed')
  }
}

function getHelperDesiredStateLabel(
  t: ReturnType<typeof useTranslation>['t'],
  state: AmneziaHelperDesiredState | undefined
): string {
  switch (state) {
    case 'idle':
      return t('profile.helperDesiredStateIdle')
    case 'running':
      return t('profile.helperDesiredStateRunning')
    case 'stopped':
      return t('profile.helperDesiredStateStopped')
    default:
      return '-'
  }
}

function getHelperExitReasonLabel(
  t: ReturnType<typeof useTranslation>['t'],
  reason: AmneziaHelperExitReason
): string {
  switch (reason) {
    case 'requested_stop':
      return t('profile.helperExitRequestedStop')
    case 'app_shutdown':
      return t('profile.helperExitAppShutdown')
    case 'profile_changed':
      return t('profile.helperExitProfileChanged')
    case 'runtime_disabled':
      return t('profile.helperExitRuntimeDisabled')
    case 'startup_conditions_invalid':
      return t('profile.helperExitStartupConditionsInvalid')
    case 'unexpected_exit':
      return t('profile.helperExitUnexpected')
    case 'startup_failed':
      return t('profile.helperExitStartupFailed')
    case 'crash_loop':
      return t('profile.helperExitCrashLoop')
  }
}

function getBackendPathSourceLabel(
  t: ReturnType<typeof useTranslation>['t'],
  source: AmneziaHelperBackendSupportSnapshot['pathSource'] | undefined
): string {
  switch (source) {
    case 'bundled':
      return t('profile.helperBackendSourceBundled')
    case 'override':
      return t('profile.helperBackendSourceOverride')
    case 'development':
      return t('profile.helperBackendSourceDevelopment')
    default:
      return '-'
  }
}

function getReadinessLabel(
  t: ReturnType<typeof useTranslation>['t'],
  status: AmneziaHelperReadinessStatus
): string {
  switch (status) {
    case 'unknown':
      return t('profile.readinessUnknown')
    case 'checking':
      return t('profile.readinessChecking')
    case 'ready':
      return t('profile.readinessReady')
    case 'failed':
      return t('profile.readinessFailed')
  }
}

function getBackendModeLabel(
  t: ReturnType<typeof useTranslation>['t'],
  mode?: AmneziaHelperBackendMode
): string {
  switch (mode) {
    case 'production':
      return t('profile.backendModeProduction')
    case 'proxy-prototype':
      return t('profile.backendModeProxyPrototype')
    case 'stub':
      return t('profile.backendModeStub')
    default:
      return '-'
  }
}

function getSupportSeverityLabel(
  t: ReturnType<typeof useTranslation>['t'],
  severity: AmneziaHelperSupportSeverity
): string {
  switch (severity) {
    case 'info':
      return t('profile.supportSeverityInfo')
    case 'warning':
      return t('profile.supportSeverityWarning')
    case 'blocker':
      return t('profile.supportSeverityBlocker')
  }
}

function getReleaseReadinessLabel(
  t: ReturnType<typeof useTranslation>['t'],
  status?: AmneziaHelperReleaseReadinessSummary['status']
): string {
  switch (status) {
    case 'supported':
      return t('profile.releaseReadinessSupported')
    case 'warning':
      return t('profile.releaseReadinessWarning')
    case 'blocked':
      return t('profile.releaseReadinessBlocked')
    default:
      return '-'
  }
}

function getReadinessOverallLabel(
  t: ReturnType<typeof useTranslation>['t'],
  status: AmneziaHelperReadinessOverallStatus
): string {
  switch (status) {
    case 'ready':
      return t('profile.helperReadinessReady')
    case 'ready_with_warnings':
      return t('profile.helperReadinessReadyWithWarnings')
    case 'blocked':
      return t('profile.helperReadinessBlocked')
    case 'unknown':
      return t('profile.helperReadinessUnknown')
  }
}

function getReadinessComponentLabel(
  t: ReturnType<typeof useTranslation>['t'],
  status: AmneziaHelperReadinessComponentStatus
): string {
  switch (status) {
    case 'ready':
      return t('profile.helperReadinessComponentReady')
    case 'warning':
      return t('profile.helperReadinessComponentWarning')
    case 'blocked':
      return t('profile.helperReadinessComponentBlocked')
    case 'unknown':
      return t('profile.helperReadinessComponentUnknown')
    case 'not_applicable':
      return t('profile.helperReadinessComponentNotApplicable')
  }
}

function getHelperRuleReliabilityLabel(
  t: ReturnType<typeof useTranslation>['t'],
  reliability?: AmneziaHelperRuleReliability
): string {
  switch (reliability) {
    case 'reliable':
      return t('profile.helperRuleReliabilityReliable')
    case 'degraded':
      return t('profile.helperRuleReliabilityDegraded')
    case 'unlikely':
      return t('profile.helperRuleReliabilityUnlikely')
    case 'blocked':
      return t('profile.helperRuleReliabilityBlocked')
    default:
      return '-'
  }
}

function getUdpSupportLabel(
  t: ReturnType<typeof useTranslation>['t'],
  support?: AmneziaHelperUdpSupport
): string {
  switch (support) {
    case 'supported':
      return t('profile.udpSupportSupported')
    case 'unsupported':
      return t('profile.udpSupportUnsupported')
    case 'unknown':
      return t('profile.udpSupportUnknown')
    default:
      return '-'
  }
}

function getStartupPreflightLabel(
  t: ReturnType<typeof useTranslation>['t'],
  preflight?: AmneziaHelperStartupPreflightResult
): string {
  if (!preflight) return t('profile.startupPreflightUnknown')
  return preflight.canStart
    ? t('profile.startupPreflightAllowed')
    : t('profile.startupPreflightBlocked')
}

function getStartupPreflightStatusLabel(
  t: ReturnType<typeof useTranslation>['t'],
  status?: AmneziaHelperStartupPreflightStatus
): string {
  switch (status) {
    case 'ok':
      return t('profile.startupPreflightStatusOk')
    case 'warning':
      return t('profile.startupPreflightStatusWarning')
    case 'blocked':
      return t('profile.startupPreflightStatusBlocked')
    case 'unknown':
    default:
      return t('profile.startupPreflightStatusUnknown')
  }
}

function getStartupTunBypassStatusLabel(
  t: ReturnType<typeof useTranslation>['t'],
  status?: AmneziaHelperStartupPreflightTunBypassStatus
): string {
  switch (status) {
    case 'not_required':
      return t('profile.startupPreflightTunBypassNotRequired')
    case 'resolved':
      return t('profile.startupPreflightTunBypassResolved')
    case 'failed':
      return t('profile.startupPreflightTunBypassFailed')
    case 'unknown':
    default:
      return t('profile.startupPreflightTunBypassUnknown')
  }
}

function getSupportBackendKindLabel(
  t: ReturnType<typeof useTranslation>['t'],
  kind: AmneziaHelperBackendSupportSnapshot['kind'] | 'unavailable'
): string {
  switch (kind) {
    case 'production':
      return t('profile.backendModeProduction')
    case 'prototype':
      return t('profile.backendModeProxyPrototype')
    case 'stub':
      return t('profile.backendModeStub')
    case 'unavailable':
    default:
      return t('profile.backendStateUnavailable')
  }
}

function getConfigStatusLabel(
  t: ReturnType<typeof useTranslation>['t'],
  status?: AmneziaHelperConfigStatus
): string {
  switch (status) {
    case 'not_generated':
      return t('profile.configNotGenerated')
    case 'generated':
      return t('profile.configGenerated')
    case 'failed':
      return t('profile.configFailed')
    default:
      return '-'
  }
}

function getConnectivityStatusLabel(
  t: ReturnType<typeof useTranslation>['t'],
  status: AmneziaHelperConnectivityStatus
): string {
  switch (status) {
    case 'checking':
      return t('profile.connectivityStatusChecking')
    case 'verified':
      return t('profile.connectivityStatusVerified')
    case 'failed':
      return t('profile.connectivityStatusFailed')
    case 'unknown':
    default:
      return t('profile.connectivityStatusUnknown')
  }
}

function getValidationStageLabel(
  t: ReturnType<typeof useTranslation>['t'],
  stage: AmneziaHelperValidationStage
): string {
  switch (stage) {
    case 'tcp_connect':
      return t('profile.validationStageTcpConnect')
    case 'socks5_handshake':
      return t('profile.validationStageSocks5Handshake')
    case 'upstream_request':
      return t('profile.validationStageUpstreamRequest')
    case 'not_started':
    default:
      return t('profile.validationStageNotStarted')
  }
}

function getDiagnosticCategoryLabel(
  t: ReturnType<typeof useTranslation>['t'],
  category: AmneziaHelperDiagnosticCategory
): string {
  switch (category) {
    case 'backend_unavailable':
      return t('profile.diagnosticBackendUnavailable')
    case 'backend_permission_denied':
      return t('profile.diagnosticBackendPermissionDenied')
    case 'backend_not_executable':
      return t('profile.diagnosticBackendNotExecutable')
    case 'backend_spawn_failure':
      return t('profile.diagnosticBackendSpawnFailure')
    case 'unsupported_platform':
      return t('profile.diagnosticUnsupportedPlatform')
    case 'unsupported_arch':
      return t('profile.diagnosticUnsupportedArch')
    case 'backend_arch_mismatch':
      return t('profile.diagnosticBackendArchMismatch')
    case 'config_generation_failure':
      return t('profile.diagnosticConfigGenerationFailure')
    case 'tun_bypass_resolution_failure':
      return t('profile.diagnosticTunBypassResolutionFailure')
    case 'startup_timeout':
      return t('profile.diagnosticStartupTimeout')
    case 'endpoint_unreachable':
      return t('profile.diagnosticEndpointUnreachable')
    case 'proxy_handshake_failure':
      return t('profile.diagnosticProxyHandshakeFailure')
    case 'upstream_request_failure':
      return t('profile.diagnosticUpstreamRequestFailure')
    case 'validation_timeout':
      return t('profile.diagnosticValidationTimeout')
  }
}

function getRoutingDiagnosticReasonLabel(
  t: ReturnType<typeof useTranslation>['t'],
  reason: AmneziaHelperRoutingDiagnosticReason
): string {
  switch (reason) {
    case 'helper_rule_match':
      return t('profile.routingDiagnosticReasonRuleMatch')
    case 'helper_not_injected':
      return t('profile.routingDiagnosticReasonHelperNotInjected')
    case 'helper_not_ready':
      return t('profile.routingDiagnosticReasonHelperNotReady')
    case 'no_rule_match':
      return t('profile.routingDiagnosticReasonNoRuleMatch')
    case 'invalid_input':
      return t('profile.routingDiagnosticReasonInvalidInput')
  }
}

function getDiagnosticRuleDraft(
  result: AmneziaHelperRoutingDiagnosticResult
): HelperRuleDraft | null {
  if (result.matched || result.reasonCode === 'invalid_input') return null

  if (result.input.domain) {
    return {
      type: 'DOMAIN',
      value: result.input.domain,
      note: ''
    }
  }

  if (result.input.ip) {
    return {
      type: 'IP-CIDR',
      value: `${result.input.ip}/32`,
      note: ''
    }
  }

  return null
}

function formatBulkRuleSummary(
  t: ReturnType<typeof useTranslation>['t'],
  result: AmneziaHelperRuleBulkResult
): string {
  return `${t('profile.summaryAdded')}: ${result.summary.added}, ${t('profile.summarySkipped')}: ${result.summary.skipped}, ${t('profile.summaryInvalid')}: ${result.summary.invalid}`
}

function formatImportRuleSummary(
  t: ReturnType<typeof useTranslation>['t'],
  result: AmneziaHelperRulePackImportResult
): string {
  return `${t('profile.summaryAddedPacks')}: ${result.summary.addedPacks}, ${t('profile.summaryMergedPacks')}: ${result.summary.mergedPacks}, ${t('profile.summaryAdded')}: ${result.summary.addedRules}, ${t('profile.summarySkipped')}: ${result.summary.skippedRules}, ${t('profile.summaryInvalid')}: ${result.summary.invalidRules}`
}

function formatBoolean(t: ReturnType<typeof useTranslation>['t'], value: boolean): string {
  return value ? t('profile.booleanYes') : t('profile.booleanNo')
}

function getRoutingTargetStatusLabel(
  t: ReturnType<typeof useTranslation>['t'],
  status?: AmneziaHelperRoutingTargetStatus
): string {
  switch (status) {
    case 'injected':
      return t('profile.routingTargetInjected')
    case 'unavailable':
      return t('profile.routingTargetUnavailable')
    case 'not_injected':
    default:
      return t('profile.routingTargetNotInjected')
  }
}

function formatTimestamp(value?: number): string {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'
}

function formatHelperLogs(logs: AmneziaHelperLogEntry[]): string {
  return logs
    .slice(-80)
    .map((log) => `${dayjs(log.at).format('HH:mm:ss')} ${log.stream}: ${log.message}`)
    .join('\n')
}

export default AmneziaProfileDetailsModal
