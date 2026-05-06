import BasePage from '@renderer/components/base/base-page'
import RuleItem from '@renderer/components/rules/rule-item'
import EditRulesModal from '@renderer/components/profiles/edit-rules-modal'
import React, { useEffect, useMemo, useState } from 'react'
import yaml from 'js-yaml'
import useSWR from 'swr'
import { Separator } from '@renderer/components/ui/separator'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Textarea } from '@renderer/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { useUnifiedUiBundle } from '@renderer/hooks/use-unified-ui-bundle'
import { useGroups } from '@renderer/hooks/use-groups'
import { includesIgnoreCase } from '@renderer/utils/includes'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { getRuleStr, mihomoHotReloadConfig, setRuleStr } from '@renderer/utils/ipc'
import {
  createUnifiedRuleSavePlan,
  normalizeUnifiedRuleType,
  resolveDefaultRuleOwnerId,
  UnifiedRuleItem,
  UnifiedRuleOwner,
  UnifiedStatusLevel,
  UnifiedUiBundle
} from '../../../core/ui/unified-ui'
import {
  createKoalaRuBundleRule,
  isKoalaRuBundleRuleString,
  KOALA_RU_BUNDLE_RULE_PROVIDER_NAME
} from '../../../core/routing/mihomo-rule-provider-presets'
import {
  createEmptyUnifiedRulePatchFile,
  createUnifiedRulesForDisplay,
  appendUnifiedManagedRule,
  dedupeUnifiedRulePatchFile,
  duplicateUnifiedManagedRulesToOwner,
  duplicateUnifiedManagedRuleToOwner,
  getSelectableUnifiedRuleIds,
  importUnifiedRulesToPatch,
  isUnifiedManagedRuleSelectable,
  mapRulePatchesToUnifiedRules,
  moveUnifiedManagedRule,
  normalizeUnifiedRulePatchFile,
  removeUnifiedManagedRules,
  removeUnifiedManagedRule,
  replaceUnifiedManagedRule,
  serializeUnifiedRulesExportDocument,
  setUnifiedManagedRulesEnabled,
  setUnifiedManagedRuleEnabled,
  UnifiedRulePatchFile
} from '../../../core/ui/unified-rule-management'
import {
  AppWindow,
  ArrowDown,
  ArrowUp,
  Ban,
  CircleHelp,
  Copy,
  Database,
  Download,
  Globe2,
  ListChecks,
  Network,
  Pencil,
  Plus,
  ShieldCheck,
  ShieldOff,
  SlidersHorizontal,
  Save,
  Trash2,
  Upload,
  X
} from 'lucide-react'
import { toast } from 'sonner'

const unifiedRuleTypes = [
  'DOMAIN-SUFFIX',
  'DOMAIN',
  'DOMAIN-KEYWORD',
  'IP-CIDR',
  'PROCESS-NAME',
  'RULE-SET',
  'MATCH'
] as const

const commonMihomoTargets = ['PROXY', 'DIRECT', 'REJECT', 'REJECT-DROP', 'PASS', 'COMPATIBLE']

const Rules: React.FC = () => {
  const { t } = useTranslation()
  const [filter, setFilter] = useState('')
  const [showRulesEditor, setShowRulesEditor] = useState(false)
  const [selectedOwnerId, setSelectedOwnerId] = useState('')
  const [newRuleType, setNewRuleType] = useState<string>('DOMAIN-SUFFIX')
  const [newRuleValue, setNewRuleValue] = useState('')
  const [newRuleTarget, setNewRuleTarget] = useState('PROXY')
  const [editingRule, setEditingRule] = useState<UnifiedRuleItem | undefined>()
  const [profileFilter, setProfileFilter] = useState('all')
  const [actionFilter, setActionFilter] = useState('all')
  const [duplicateOwnerId, setDuplicateOwnerId] = useState('')
  const [selectedRuleIds, setSelectedRuleIds] = useState<string[]>([])
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [showQuickAddAdvanced, setShowQuickAddAdvanced] = useState(false)
  const [showAdvancedManagement, setShowAdvancedManagement] = useState(false)
  const [bulkImportText, setBulkImportText] = useState('')
  const [bulkImportSummary, setBulkImportSummary] = useState('')
  const [rulesBusy, setRulesBusy] = useState(false)
  const navigate = useNavigate()
  const { groups } = useGroups()
  const { bundle, mutateMihomoRules } = useUnifiedUiBundle()
  const ruleOwnerProfileIds = useMemo(
    () => bundle.ruleOwners.map((owner) => owner.ownerProfileId).sort(),
    [bundle.ruleOwners]
  )
  const { data: rulePatches = {}, mutate: mutateRulePatches } = useSWR<
    Record<string, UnifiedRulePatchFile>
  >(
    ruleOwnerProfileIds.length > 0 ? ['unified-rule-patches', ruleOwnerProfileIds.join('|')] : null,
    () => readRulePatches(ruleOwnerProfileIds)
  )

  const selectedOwner = useMemo(
    () => bundle.ruleOwners.find((owner) => owner.id === selectedOwnerId),
    [bundle.ruleOwners, selectedOwnerId]
  )
  const defaultOwnerId = useMemo(
    () => resolveDefaultRuleOwnerId(bundle.ruleOwners, selectedOwnerId),
    [bundle.ruleOwners, selectedOwnerId]
  )

  useEffect(() => {
    if (!defaultOwnerId) {
      if (selectedOwnerId) setSelectedOwnerId('')
      return
    }
    if (!selectedOwner) {
      setSelectedOwnerId(defaultOwnerId)
    }
  }, [defaultOwnerId, selectedOwner, selectedOwnerId])

  useEffect(() => {
    if (duplicateOwnerId && !bundle.ruleOwners.some((owner) => owner.id === duplicateOwnerId)) {
      setDuplicateOwnerId('')
    }
  }, [bundle.ruleOwners, duplicateOwnerId])

  const targetOptions = useMemo<string[]>(() => {
    const groupNames =
      groups?.map((group) => group.name).filter((name): name is string => Boolean(name?.trim())) ??
      []
    const mihomoTargets = [...new Set([...commonMihomoTargets, ...groupNames])]
    return mihomoTargets.filter((target) => target.trim().length > 0)
  }, [groups])

  useEffect(() => {
    if (targetOptions.length === 0) return
    if (!targetOptions.some((target) => target === newRuleTarget)) {
      setNewRuleTarget(targetOptions[0])
    }
  }, [newRuleTarget, targetOptions])

  const managedRules = useMemo(
    () => mapRulePatchesToUnifiedRules(bundle.ruleOwners, rulePatches),
    [bundle.ruleOwners, rulePatches]
  )
  const allDisplayRules = useMemo(
    () => createUnifiedRulesForDisplay({ runtimeRules: bundle.allRules, managedRules }),
    [bundle.allRules, managedRules]
  )
  const visibleRules = useMemo(() => {
    return allDisplayRules.filter((rule) => {
      if (profileFilter !== 'all' && rule.ownerProfileId !== profileFilter) return false
      if (actionFilter !== 'all' && rule.target !== actionFilter) return false
      return true
    })
  }, [actionFilter, allDisplayRules, profileFilter])

  const filteredRules = useMemo(() => {
    if (filter === '') return visibleRules
    return visibleRules.filter((rule) => {
      const displayValue = getRuleDisplayValue(t, rule)
      return (
        includesIgnoreCase(displayValue, filter) ||
        includesIgnoreCase(rule.value, filter) ||
        includesIgnoreCase(rule.type, filter) ||
        includesIgnoreCase(rule.target, filter) ||
        includesIgnoreCase(rule.ownerProfileName, filter) ||
        includesIgnoreCase(rule.packName, filter) ||
        includesIgnoreCase(rule.note, filter)
      )
    })
  }, [filter, t, visibleRules])

  const ownerUnavailable = !selectedOwner || !selectedOwner.canEditRules
  const normalizedNewRuleType = normalizeUnifiedRuleType(newRuleType)
  const ruleRequiresValue = normalizedNewRuleType !== 'MATCH'
  const duplicateRule = useMemo(() => {
    const value = ruleRequiresValue ? newRuleValue.trim() : ''
    if (ruleRequiresValue && !value) return false
    return allDisplayRules.some(
      (rule) =>
        rule.id !== editingRule?.id &&
        rule.ownerProfileId === selectedOwner?.ownerProfileId &&
        normalizeUnifiedRuleType(rule.type) === normalizedNewRuleType &&
        rule.value === value &&
        rule.target === newRuleTarget
    )
  }, [
    allDisplayRules,
    editingRule?.id,
    newRuleTarget,
    newRuleType,
    newRuleValue,
    normalizedNewRuleType,
    ruleRequiresValue,
    selectedOwner?.ownerProfileId
  ])
  const canAddRule =
    !rulesBusy &&
    (!ruleRequiresValue || !!newRuleValue.trim()) &&
    !ownerUnavailable &&
    !duplicateRule
  const quickRuleActions = [
    {
      target: 'PROXY',
      label: t('pages.rules.quickActionProxy'),
      description: t('pages.rules.quickActionProxyDescription'),
      icon: <ShieldCheck className="size-4" />
    },
    {
      target: 'DIRECT',
      label: t('pages.rules.quickActionDirect'),
      description: t('pages.rules.quickActionDirectDescription'),
      icon: <ShieldOff className="size-4" />
    },
    {
      target: 'REJECT',
      label: t('pages.rules.quickActionReject'),
      description: t('pages.rules.quickActionRejectDescription'),
      icon: <Ban className="size-4" />
    }
  ]
  const quickTargetKinds = [
    {
      type: 'DOMAIN-SUFFIX',
      label: t('pages.rules.quickTargetSite'),
      description: t('pages.rules.quickTargetSiteDescription'),
      icon: <Globe2 className="size-4" />
    },
    {
      type: 'IP-CIDR',
      label: t('pages.rules.quickTargetIp'),
      description: t('pages.rules.quickTargetIpDescription'),
      icon: <Network className="size-4" />
    },
    {
      type: 'PROCESS-NAME',
      label: t('pages.rules.quickTargetApp'),
      description: t('pages.rules.quickTargetAppDescription'),
      icon: <AppWindow className="size-4" />
    },
    {
      type: 'MATCH',
      label: t('pages.rules.quickTargetAll'),
      description: t('pages.rules.quickTargetAllDescription'),
      icon: <ListChecks className="size-4" />
    }
  ]
  const quickRuleValuePlaceholder =
    normalizedNewRuleType === 'DOMAIN-SUFFIX' || normalizedNewRuleType === 'DOMAIN'
      ? t('pages.rules.quickValuePlaceholderSite')
      : normalizedNewRuleType === 'IP-CIDR'
        ? t('pages.rules.quickValuePlaceholderIp')
        : normalizedNewRuleType === 'PROCESS-NAME'
          ? t('pages.rules.quickValuePlaceholderApp')
          : ruleRequiresValue
            ? t('pages.rules.quickValuePlaceholderSite')
            : t('pages.rules.matchRuleValuePlaceholder')
  const advancedRuleEditorProfileId = selectedOwner?.ownerProfileId
  const duplicateOwner = useMemo(
    () => bundle.ruleOwners.find((owner) => owner.id === duplicateOwnerId),
    [bundle.ruleOwners, duplicateOwnerId]
  )
  const actionFilterOptions = useMemo(
    () => [
      ...new Set(allDisplayRules.map((rule) => rule.target).filter((target) => target.trim()))
    ],
    [allDisplayRules]
  )
  const filteredManagedRules = useMemo(
    () => filteredRules.filter(isUnifiedManagedRuleSelectable),
    [filteredRules]
  )
  const selectedOwnerManagedRules = useMemo(
    () =>
      selectedOwner
        ? allDisplayRules.filter(
            (rule) =>
              rule.ownerProfileId === selectedOwner.ownerProfileId &&
              isUnifiedManagedRuleSelectable(rule)
          )
        : [],
    [allDisplayRules, selectedOwner]
  )
  const selectedRuleIdSet = useMemo(() => new Set(selectedRuleIds), [selectedRuleIds])
  const selectedRules = useMemo(
    () =>
      allDisplayRules.filter(
        (rule) => selectedRuleIdSet.has(rule.id) && isUnifiedManagedRuleSelectable(rule)
      ),
    [allDisplayRules, selectedRuleIdSet]
  )
  const selectableFilteredRuleIds = useMemo(
    () => getSelectableUnifiedRuleIds(filteredRules),
    [filteredRules]
  )
  const allFilteredManagedRulesSelected =
    selectableFilteredRuleIds.length > 0 &&
    selectableFilteredRuleIds.every((ruleId) => selectedRuleIdSet.has(ruleId))

  useEffect(() => {
    const availableRuleIds = new Set(allDisplayRules.map((rule) => rule.id))
    setSelectedRuleIds((current) => {
      const next = current.filter((ruleId) => availableRuleIds.has(ruleId))
      return next.length === current.length ? current : next
    })
  }, [allDisplayRules])

  useEffect(() => {
    if (showRulesEditor && !advancedRuleEditorProfileId) {
      setShowRulesEditor(false)
    }
  }, [advancedRuleEditorProfileId, showRulesEditor])

  const handleAddRule = async (): Promise<void> => {
    const value = ruleRequiresValue ? newRuleValue.trim() : ''
    if ((ruleRequiresValue && !value) || rulesBusy) return

    if (duplicateRule) {
      toast.error(t('pages.rules.duplicateRule'))
      return
    }

    if (ownerUnavailable || !selectedOwner) {
      toast.error(t('pages.rules.ruleOwnerUnavailable'))
      return
    }

    setRulesBusy(true)
    try {
      const draft = {
        type: newRuleType,
        value,
        target: newRuleTarget
      }

      if (editingRule) {
        await updateManagedRule(editingRule, draft)
        toast.success(t('pages.rules.ruleUpdated', { name: selectedOwner.ownerProfileName }))
      } else {
        const plan = createUnifiedRuleSavePlan({
          owner: selectedOwner,
          ...draft
        })
        const added = await appendProfileRule(plan.ownerProfileId, plan.serializedRule)
        if (!added) {
          toast.error(t('pages.rules.duplicateRule'))
          await refreshRuleState()
          return
        }
        toast.success(t(plan.successMessageKey, { name: plan.ownerProfileName }))
      }
      await mihomoHotReloadConfig()
      mutateMihomoRules()
      await refreshRuleState()
      setNewRuleValue('')
      setEditingRule(undefined)
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setRulesBusy(false)
    }
  }

  const handleAddRuBundle = async (): Promise<void> => {
    if (rulesBusy) return

    if (ownerUnavailable || !selectedOwner) {
      toast.error(t('pages.rules.ruleOwnerUnavailable'))
      return
    }

    setRulesBusy(true)
    try {
      const rule = createKoalaRuBundleRule()
      const added = await appendProfileRule(selectedOwner.ownerProfileId, rule)
      if (!added) {
        toast.error(t('pages.rules.duplicateRule'))
        await refreshRuleState()
        return
      }
      toast.success(
        t('pages.rules.ruBundleAdded', {
          name: selectedOwner.ownerProfileName
        })
      )
      await mihomoHotReloadConfig()
      mutateMihomoRules()
      await refreshRuleState()
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setRulesBusy(false)
    }
  }

  const refreshRuleState = async (): Promise<void> => {
    await mutateRulePatches()
  }

  const handleStartEditRule = (rule: UnifiedRuleItem): void => {
    if (!rule.editable || !rule.ownerProfileId) return
    setEditingRule(rule)
    setSelectedOwnerId(`${rule.ownerType}:${rule.ownerProfileId}`)
    setNewRuleType(rule.type)
    setNewRuleValue(rule.value)
    setNewRuleTarget(rule.target)
  }

  const handleCancelEdit = (): void => {
    setEditingRule(undefined)
    setNewRuleValue('')
    setNewRuleTarget('PROXY')
  }

  const handleDeleteRule = async (rule: UnifiedRuleItem): Promise<void> => {
    if (!rule.ownerProfileId || !rule.managedPatchSection || rule.managedPatchIndex === undefined)
      return
    setRulesBusy(true)
    try {
      const patch = getOwnerPatch(rule.ownerProfileId)
      const next = removeUnifiedManagedRule(patch, rule.managedPatchSection, rule.managedPatchIndex)
      await writeProfileRulePatch(rule.ownerProfileId, next)
      await mihomoHotReloadConfig()
      mutateMihomoRules()
      await refreshRuleState()
      toast.success(t('pages.rules.ruleDeleted'))
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setRulesBusy(false)
    }
  }

  const handleToggleRule = async (rule: UnifiedRuleItem): Promise<void> => {
    if (!rule.ownerProfileId || !rule.managedPatchSection || rule.managedPatchIndex === undefined)
      return
    setRulesBusy(true)
    try {
      const patch = getOwnerPatch(rule.ownerProfileId)
      const next = setUnifiedManagedRuleEnabled(
        patch,
        rule.managedPatchSection,
        rule.managedPatchIndex,
        !rule.enabled
      )
      await writeProfileRulePatch(rule.ownerProfileId, next)
      await mihomoHotReloadConfig()
      mutateMihomoRules()
      await refreshRuleState()
      toast.success(rule.enabled ? t('pages.rules.ruleDisabled') : t('pages.rules.ruleEnabled'))
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setRulesBusy(false)
    }
  }

  const handleDuplicateRule = async (rule: UnifiedRuleItem): Promise<void> => {
    if (
      !rule.ownerProfileId ||
      !rule.managedPatchSection ||
      rule.managedPatchIndex === undefined ||
      !duplicateOwner
    ) {
      return
    }

    setRulesBusy(true)
    try {
      const sourcePatch = getOwnerPatch(rule.ownerProfileId)
      const targetPatch = getOwnerPatch(duplicateOwner.ownerProfileId)
      const nextTargetPatch = duplicateUnifiedManagedRuleToOwner({
        sourcePatch,
        sourceSection: rule.managedPatchSection,
        sourceIndex: rule.managedPatchIndex,
        targetPatch
      })
      await writeProfileRulePatch(duplicateOwner.ownerProfileId, nextTargetPatch)
      await mihomoHotReloadConfig()
      mutateMihomoRules()
      await refreshRuleState()
      toast.success(t('pages.rules.ruleDuplicated', { name: duplicateOwner.ownerProfileName }))
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setRulesBusy(false)
    }
  }

  const handleMoveRule = async (rule: UnifiedRuleItem, direction: 'up' | 'down'): Promise<void> => {
    if (!isUnifiedManagedRuleSelectable(rule)) return

    setRulesBusy(true)
    try {
      const patch = getOwnerPatch(rule.ownerProfileId)
      const next = moveUnifiedManagedRule(
        patch,
        rule.managedPatchSection,
        rule.managedPatchIndex,
        direction
      )
      await writeProfileRulePatch(rule.ownerProfileId, next)
      await mihomoHotReloadConfig()
      mutateMihomoRules()
      await refreshRuleState()
      toast.success(t('pages.rules.ruleMoved'))
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setRulesBusy(false)
    }
  }

  const handleToggleRuleSelection = (rule: UnifiedRuleItem, selected: boolean): void => {
    if (!isUnifiedManagedRuleSelectable(rule)) return
    setSelectedRuleIds((current) => {
      if (selected) return current.includes(rule.id) ? current : [...current, rule.id]
      return current.filter((ruleId) => ruleId !== rule.id)
    })
  }

  const handleSelectAllFilteredRules = (): void => {
    setSelectedRuleIds((current) => {
      const next = new Set(current)
      selectableFilteredRuleIds.forEach((ruleId) => next.add(ruleId))
      return [...next]
    })
  }

  const handleClearSelection = (): void => {
    setSelectedRuleIds([])
  }

  const handleBulkSetEnabled = async (enabled: boolean): Promise<void> => {
    if (rulesBusy || selectedRules.length === 0) return
    setRulesBusy(true)
    try {
      for (const [profileId, rules] of groupManagedRulesByProfileId(selectedRules)) {
        const next = setUnifiedManagedRulesEnabled(getOwnerPatch(profileId), rules, enabled)
        await writeProfileRulePatch(profileId, next)
      }
      await mihomoHotReloadConfig()
      mutateMihomoRules()
      await refreshRuleState()
      toast.success(
        enabled
          ? t('pages.rules.bulkRulesEnabled', { count: selectedRules.length })
          : t('pages.rules.bulkRulesDisabled', { count: selectedRules.length })
      )
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setRulesBusy(false)
    }
  }

  const handleBulkDelete = async (): Promise<void> => {
    if (rulesBusy || selectedRules.length === 0) return
    setRulesBusy(true)
    try {
      for (const [profileId, rules] of groupManagedRulesByProfileId(selectedRules)) {
        const next = removeUnifiedManagedRules(getOwnerPatch(profileId), rules)
        await writeProfileRulePatch(profileId, next)
      }
      await mihomoHotReloadConfig()
      mutateMihomoRules()
      await refreshRuleState()
      toast.success(t('pages.rules.bulkRulesDeleted', { count: selectedRules.length }))
      setSelectedRuleIds([])
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setRulesBusy(false)
    }
  }

  const handleBulkDuplicate = async (): Promise<void> => {
    if (rulesBusy || selectedRules.length === 0 || !duplicateOwner) return
    setRulesBusy(true)
    try {
      const result = duplicateUnifiedManagedRulesToOwner({
        targetPatch: getOwnerPatch(duplicateOwner.ownerProfileId),
        rules: selectedRules
      })
      if (result.added > 0) {
        await writeProfileRulePatch(duplicateOwner.ownerProfileId, result.patch)
        await mihomoHotReloadConfig()
        mutateMihomoRules()
        await refreshRuleState()
      }
      toast.success(
        t('pages.rules.bulkRulesDuplicated', {
          name: duplicateOwner.ownerProfileName,
          added: result.added,
          skipped: result.skippedDuplicate,
          invalid: result.invalid.length
        })
      )
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setRulesBusy(false)
    }
  }

  const handleBulkImport = async (): Promise<void> => {
    if (rulesBusy || ownerUnavailable || !selectedOwner || !bulkImportText.trim()) return
    setRulesBusy(true)
    try {
      const result = importUnifiedRulesToPatch({
        patch: getOwnerPatch(selectedOwner.ownerProfileId),
        type: newRuleType,
        target: newRuleTarget,
        text: bulkImportText
      })
      if (result.added > 0) {
        await writeProfileRulePatch(selectedOwner.ownerProfileId, result.patch)
        await mihomoHotReloadConfig()
        mutateMihomoRules()
        await refreshRuleState()
        setBulkImportText('')
      }
      const summary = t('pages.rules.bulkImportSummary', {
        added: result.added,
        skipped: result.skippedDuplicate,
        invalid: result.invalid.length
      })
      setBulkImportSummary(summary)
      toast.success(summary)
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setRulesBusy(false)
    }
  }

  const handleExportRules = async (rules: UnifiedRuleItem[]): Promise<void> => {
    const exportableRules = rules.filter(isUnifiedManagedRuleSelectable)
    if (exportableRules.length === 0) {
      toast.error(t('pages.rules.noExportableRules'))
      return
    }

    try {
      await copyTextToClipboard(serializeUnifiedRulesExportDocument(exportableRules))
      toast.success(t('pages.rules.rulesExported', { count: exportableRules.length }))
    } catch (e) {
      toast.error(`${e}`)
    }
  }

  const updateManagedRule = async (
    rule: UnifiedRuleItem,
    draft: { type: string; value: string; target: string }
  ): Promise<void> => {
    if (!rule.ownerProfileId || !rule.managedPatchSection || rule.managedPatchIndex === undefined) {
      throw new Error(t('pages.rules.readOnlyRule'))
    }
    const patch = getOwnerPatch(rule.ownerProfileId)
    const next = replaceUnifiedManagedRule(
      patch,
      rule.managedPatchSection,
      rule.managedPatchIndex,
      draft
    )
    await writeProfileRulePatch(rule.ownerProfileId, next)
  }

  const getOwnerPatch = (profileId: string): UnifiedRulePatchFile => {
    return rulePatches[profileId] ?? createEmptyUnifiedRulePatchFile()
  }

  const canMoveRule = (rule: UnifiedRuleItem, direction: 'up' | 'down'): boolean => {
    if (!isUnifiedManagedRuleSelectable(rule)) return false
    const sectionRules = getOwnerPatch(rule.ownerProfileId)[rule.managedPatchSection]
    const currentRule = sectionRules[rule.managedPatchIndex]
    if (!currentRule || isTerminalManagedRuleString(currentRule)) return false
    const targetIndex = direction === 'up' ? rule.managedPatchIndex - 1 : rule.managedPatchIndex + 1
    const targetRule = sectionRules[targetIndex]
    if (targetRule && isTerminalManagedRuleString(targetRule)) return false
    return direction === 'up'
      ? rule.managedPatchIndex > 0
      : rule.managedPatchIndex < sectionRules.length - 1
  }

  return (
    <BasePage
      title={t('pages.rules.title')}
      header={
        <>
          {advancedRuleEditorProfileId && (
            <Button
              size="icon-sm"
              variant="ghost"
              className="app-nodrag"
              title={t('pages.rules.advancedMihomoRuleEditor')}
              onClick={() => setShowRulesEditor(true)}
            >
              <Pencil className="size-4" />
            </Button>
          )}
          <Button
            size="icon-sm"
            variant="ghost"
            className="app-nodrag"
            title={t('pages.resources.title')}
            onClick={() => navigate('/resources')}
          >
            <Database className="text-lg" />
          </Button>
        </>
      }
    >
      {showRulesEditor && advancedRuleEditorProfileId && (
        <EditRulesModal
          id={advancedRuleEditorProfileId}
          onClose={() => {
            setShowRulesEditor(false)
            mutateMihomoRules()
            void refreshRuleState()
          }}
        />
      )}

      <div className="flex flex-col gap-2 px-2 pb-2">
        <div className="rounded-lg border border-border bg-card/40 p-2">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('pages.rules.sectionOverview')}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <RuleCountBadges rules={allDisplayRules} />
            </div>
            <UnifiedStatusBadges bundle={bundle} />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card/40 p-2">
          <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-sm font-medium">{t('pages.rules.quickAddTitle')}</div>
              <div className="text-xs text-muted-foreground">
                {t('pages.rules.quickAddDescription')}
              </div>
            </div>
            <Select
              value={selectedOwnerId}
              onValueChange={setSelectedOwnerId}
              disabled={Boolean(editingRule)}
            >
              <SelectTrigger size="sm" className="w-56">
                <SelectValue placeholder={t('pages.rules.selectRuleOwner')} />
              </SelectTrigger>
              <SelectContent position="popper" align="end">
                {bundle.ruleOwners.map((owner) => (
                  <SelectItem key={owner.id} value={owner.id}>
                    {getOwnerLabel(t, owner)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]">
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">
                {t('pages.rules.quickActionQuestion')}
              </div>
              <div className="grid gap-1.5 sm:grid-cols-3 lg:grid-cols-1">
                {quickRuleActions.map((action) => (
                  <Button
                    key={action.target}
                    type="button"
                    variant={newRuleTarget === action.target ? 'default' : 'outline'}
                    className="h-auto justify-start gap-2 px-2 py-1.5 text-left"
                    onClick={() => setNewRuleTarget(action.target)}
                  >
                    {action.icon}
                    <span className="min-w-0">
                      <span className="block text-xs font-medium">{action.label}</span>
                      <span className="block truncate text-[11px] opacity-80">
                        {action.description}
                      </span>
                    </span>
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">
                  {t('pages.rules.quickTargetQuestion')}
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
                  {quickTargetKinds.map((target) => (
                    <Button
                      key={target.type}
                      type="button"
                      variant={normalizedNewRuleType === target.type ? 'default' : 'outline'}
                      className="h-auto justify-start gap-2 px-2 py-1.5 text-left"
                      onClick={() => {
                        setNewRuleType(target.type)
                        if (normalizeUnifiedRuleType(target.type) === 'MATCH') setNewRuleValue('')
                      }}
                    >
                      {target.icon}
                      <span className="min-w-0">
                        <span className="block text-xs font-medium">{target.label}</span>
                        <span className="block truncate text-[11px] opacity-80">
                          {target.description}
                        </span>
                      </span>
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  className="h-8 flex-1 text-sm"
                  value={newRuleValue}
                  placeholder={quickRuleValuePlaceholder}
                  disabled={!ruleRequiresValue}
                  onChange={(e) => setNewRuleValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddRule()
                    }
                  }}
                />
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={!canAddRule}
                  onClick={handleAddRule}
                >
                  {editingRule ? <Save className="size-4" /> : <Plus className="size-4" />}
                  {editingRule ? t('pages.rules.saveRule') : t('pages.rules.addRule')}
                </Button>
                {editingRule && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={handleCancelEdit}
                  >
                    <X className="size-4" />
                    {t('common.cancel')}
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-stroke-power-on/50 bg-gradient-to-br from-gradient-start-power-on/15 to-gradient-end-power-on/15 text-foreground shadow-sm hover:bg-gradient-start-power-on/20"
              disabled={rulesBusy || ownerUnavailable}
              title={KOALA_RU_BUNDLE_RULE_PROVIDER_NAME}
              onClick={handleAddRuBundle}
            >
              <Upload className="size-4" />
              {t('pages.rules.addRuBundle')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-muted-foreground"
              onClick={() => setShowQuickAddAdvanced((value) => !value)}
            >
              <SlidersHorizontal className="size-4" />
              {showQuickAddAdvanced
                ? t('pages.rules.hideAdvancedOptions')
                : t('pages.rules.showAdvancedOptions')}
            </Button>
            {selectedOwner && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="h-5 w-5 shrink-0 text-muted-foreground"
                    title={t('pages.rules.ruleHelp')}
                  >
                    <CircleHelp className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-80">
                  <div className="space-y-1 text-xs">
                    <div>{t('pages.rules.mihomoOwnerHelp')}</div>
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {showQuickAddAdvanced && (
            <div className="mt-2 grid gap-2 rounded-md border border-border/70 bg-card/30 p-2 sm:grid-cols-2 lg:grid-cols-3">
              <Select
                value={newRuleType}
                onValueChange={(value) => {
                  setNewRuleType(value)
                  if (normalizeUnifiedRuleType(value) === 'MATCH') setNewRuleValue('')
                }}
              >
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  {unifiedRuleTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={newRuleTarget} onValueChange={setNewRuleTarget}>
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  {targetOptions.map((target) => (
                    <SelectItem key={target} value={target}>
                      {target}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={selectedOwnerId}
                onValueChange={setSelectedOwnerId}
                disabled={Boolean(editingRule)}
              >
                <SelectTrigger size="sm">
                  <SelectValue placeholder={t('pages.rules.selectRuleOwner')} />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  {bundle.ruleOwners.map((owner) => (
                    <SelectItem key={owner.id} value={owner.id}>
                      {getOwnerLabel(t, owner)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {(duplicateRule || ownerUnavailable) && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              {duplicateRule && (
                <span className="text-xs text-warning">{t('pages.rules.duplicateRule')}</span>
              )}
              {ownerUnavailable && (
                <span className="text-xs text-warning">
                  {t('pages.rules.ruleOwnerUnavailable')}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card/30 p-2">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">{t('pages.rules.manageRulesTitle')}</div>
              <div className="text-xs text-muted-foreground">
                {t('pages.rules.manageRulesDescription')}
              </div>
            </div>
            <Badge variant="outline" className="rounded-sm">
              {filteredRules.length}/{allDisplayRules.length}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="h-8 min-w-60 flex-1 text-sm"
              value={filter}
              placeholder={t('common.filter')}
              onChange={(e) => setFilter(e.target.value)}
            />
            <Select value={profileFilter} onValueChange={setProfileFilter}>
              <SelectTrigger size="sm" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectItem value="all">{t('pages.rules.allProfiles')}</SelectItem>
                {bundle.ruleOwners.map((owner) => (
                  <SelectItem key={owner.id} value={owner.ownerProfileId}>
                    {getOwnerLabel(t, owner)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger size="sm" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectItem value="all">{t('pages.rules.allActions')}</SelectItem>
                {actionFilterOptions.map((target) => (
                  <SelectItem key={target} value={target}>
                    {target}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5"
              onClick={() => setShowAdvancedManagement((value) => !value)}
            >
              <SlidersHorizontal className="size-4" />
              {showAdvancedManagement
                ? t('pages.rules.hideAdvancedManagement')
                : t('pages.rules.showAdvancedManagement')}
            </Button>
            <span className="text-xs text-muted-foreground">
              {t('pages.rules.bulkEditableHint')}
            </span>
          </div>

          {showAdvancedManagement && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-border/70 bg-card/30 p-2">
              <Button
                size="sm"
                variant="outline"
                disabled={selectableFilteredRuleIds.length === 0}
                onClick={
                  allFilteredManagedRulesSelected
                    ? handleClearSelection
                    : handleSelectAllFilteredRules
                }
              >
                {allFilteredManagedRulesSelected
                  ? t('pages.rules.clearSelection')
                  : t('pages.rules.selectFiltered')}
              </Button>
              <Select value={duplicateOwnerId} onValueChange={setDuplicateOwnerId}>
                <SelectTrigger size="sm" className="w-52">
                  <SelectValue placeholder={t('pages.rules.duplicateTarget')} />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  {bundle.ruleOwners.map((owner) => (
                    <SelectItem key={owner.id} value={owner.id}>
                      {getOwnerLabel(t, owner)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setShowBulkImport((value) => !value)}
              >
                <Upload className="size-4" />
                {t('pages.rules.bulkImport')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={filteredManagedRules.length === 0}
                onClick={() => handleExportRules(filteredManagedRules)}
              >
                <Download className="size-4" />
                {t('pages.rules.exportFiltered')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={selectedOwnerManagedRules.length === 0}
                onClick={() => handleExportRules(selectedOwnerManagedRules)}
              >
                <Download className="size-4" />
                {t('pages.rules.exportOwner')}
              </Button>
            </div>
          )}
        </div>

        {showBulkImport && (
          <div className="rounded-lg border border-border bg-card/40 p-2">
            <div className="mb-2 text-xs text-muted-foreground">
              {t('pages.rules.bulkImportOwnerHint', {
                name: selectedOwner ? getOwnerLabel(t, selectedOwner) : '-',
                action: newRuleTarget
              })}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <Textarea
                className="min-h-20 flex-1 text-sm"
                value={bulkImportText}
                placeholder={t('pages.rules.bulkImportPlaceholder')}
                onChange={(e) => setBulkImportText(e.target.value)}
              />
              <Button
                size="sm"
                className="gap-1.5"
                disabled={rulesBusy || ownerUnavailable || !selectedOwner || !bulkImportText.trim()}
                onClick={handleBulkImport}
              >
                <Upload className="size-4" />
                {t('pages.rules.bulkImportApply')}
              </Button>
            </div>
            {bulkImportSummary && (
              <div className="mt-2 text-xs text-muted-foreground">{bulkImportSummary}</div>
            )}
          </div>
        )}

        {selectedRules.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/40 p-2">
            <span className="text-xs font-medium">
              {t('pages.rules.selectedRules', { count: selectedRules.length })}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={rulesBusy}
              onClick={() => handleBulkSetEnabled(true)}
            >
              {t('pages.rules.enableSelected')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={rulesBusy}
              onClick={() => handleBulkSetEnabled(false)}
            >
              {t('pages.rules.disableSelected')}
            </Button>
            <Select value={duplicateOwnerId} onValueChange={setDuplicateOwnerId}>
              <SelectTrigger size="sm" className="w-52">
                <SelectValue placeholder={t('pages.rules.duplicateTarget')} />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                {bundle.ruleOwners.map((owner) => (
                  <SelectItem key={owner.id} value={owner.id}>
                    {getOwnerLabel(t, owner)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              disabled={rulesBusy || !duplicateOwner}
              onClick={handleBulkDuplicate}
            >
              {t('pages.rules.duplicateSelected')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={rulesBusy}
              onClick={() => handleExportRules(selectedRules)}
            >
              {t('pages.rules.exportSelected')}
            </Button>
            <Button size="sm" variant="destructive" disabled={rulesBusy} onClick={handleBulkDelete}>
              {t('pages.rules.deleteSelected')}
            </Button>
            <Button size="sm" variant="ghost" disabled={rulesBusy} onClick={handleClearSelection}>
              {t('pages.rules.clearSelection')}
            </Button>
          </div>
        )}
      </div>
      <Separator className="mx-2" />
      <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t('pages.rules.sectionList')}
      </div>
      <div className="mt-px">
        {filteredRules.map((rule, i) => (
          <RuleItem
            key={rule.id}
            index={i}
            type={rule.type}
            payload={getRuleDisplayValue(t, rule)}
            proxy={rule.target}
            size={rule.size}
            enabled={rule.enabled}
            note={rule.note}
            scopeLabel={rule.ownerProfileName}
            disabledLabel={t('pages.rules.ruleDisabled')}
            actions={
              rule.editable && rule.managedPatchSection !== undefined ? (
                <>
                  <Checkbox
                    checked={selectedRuleIdSet.has(rule.id)}
                    disabled={rulesBusy}
                    title={t('pages.rules.selectRule')}
                    onCheckedChange={(checked) => handleToggleRuleSelection(rule, checked === true)}
                  />
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    disabled={rulesBusy || !canMoveRule(rule, 'up')}
                    title={t('pages.rules.moveRuleUp')}
                    onClick={() => handleMoveRule(rule, 'up')}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    disabled={rulesBusy || !canMoveRule(rule, 'down')}
                    title={t('pages.rules.moveRuleDown')}
                    onClick={() => handleMoveRule(rule, 'down')}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    disabled={rulesBusy}
                    title={t('pages.rules.editRule')}
                    onClick={() => handleStartEditRule(rule)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={rulesBusy}
                    onClick={() => handleToggleRule(rule)}
                  >
                    {rule.enabled ? t('pages.rules.disableRule') : t('pages.rules.enableRule')}
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    disabled={
                      rulesBusy ||
                      !duplicateOwner ||
                      duplicateOwner.ownerProfileId === rule.ownerProfileId
                    }
                    title={t('pages.rules.duplicateRuleToProfile')}
                    onClick={() => handleDuplicateRule(rule)}
                  >
                    <Copy className="size-4" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    disabled={rulesBusy}
                    title={t('pages.rules.deleteRule')}
                    onClick={() => handleDeleteRule(rule)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </>
              ) : undefined
            }
          />
        ))}
      </div>
    </BasePage>
  )
}

function RuleCountBadges({ rules }: { rules: UnifiedRuleItem[] }): React.ReactElement {
  const { t } = useTranslation()
  return (
    <Badge variant="secondary" className="rounded-sm">
      {t('pages.rules.scopeMihomo')}: {rules.length}
    </Badge>
  )
}

function UnifiedStatusBadges({ bundle }: { bundle: UnifiedUiBundle }): React.ReactElement {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge
        variant={getStatusBadgeVariant(bundle.connectionStatus.mihomoStatus)}
        className="rounded-sm"
      >
        {t('pages.rules.scopeMihomo')}: {getStatusLabel(t, bundle.connectionStatus.mihomoStatus)}
      </Badge>
      <Badge
        variant={getStatusBadgeVariant(bundle.connectionStatus.tunStatus)}
        className="rounded-sm"
      >
        TUN: {getStatusLabel(t, bundle.connectionStatus.tunStatus)}
      </Badge>
    </div>
  )
}

function getStatusBadgeVariant(
  status: UnifiedStatusLevel
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'blocked') return 'destructive'
  if (status === 'warning') return 'outline'
  if (status === 'ready') return 'default'
  return 'secondary'
}

function getStatusLabel(
  t: ReturnType<typeof useTranslation>['t'],
  status: UnifiedStatusLevel
): string {
  switch (status) {
    case 'ready':
      return t('pages.rules.unifiedStatusReady')
    case 'warning':
      return t('pages.rules.unifiedStatusWarning')
    case 'blocked':
      return t('pages.rules.unifiedStatusBlocked')
    case 'unknown':
      return t('pages.rules.unifiedStatusUnknown')
  }
}

function getOwnerLabel(t: ReturnType<typeof useTranslation>['t'], owner: UnifiedRuleOwner): string {
  const ownerTypeLabel = t('pages.rules.ownerMihomo')
  const currentSuffix = owner.isCurrent ? ` · ${t('pages.rules.currentOwner')}` : ''
  return `${ownerTypeLabel}: ${owner.ownerProfileName}${currentSuffix}`
}

function getRuleDisplayValue(
  t: ReturnType<typeof useTranslation>['t'],
  rule: UnifiedRuleItem
): string {
  if (normalizeUnifiedRuleType(rule.type) === 'MATCH') {
    return t('pages.rules.matchRuleDisplayValue')
  }

  return rule.value
}

function isTerminalManagedRuleString(rule: string): boolean {
  const [type] = rule.split(',').map((part) => part.trim())
  return isKoalaRuBundleRuleString(rule) || normalizeUnifiedRuleType(type ?? '') === 'MATCH'
}

async function appendProfileRule(profileId: string, serializedRule: string): Promise<boolean> {
  const rulePatch = await readProfileRulePatch(profileId)
  const result = appendUnifiedManagedRule(rulePatch, serializedRule)
  await writeProfileRulePatch(profileId, result.patch)
  return result.added
}

function groupManagedRulesByProfileId(rules: UnifiedRuleItem[]): Map<string, UnifiedRuleItem[]> {
  const grouped = new Map<string, UnifiedRuleItem[]>()
  for (const rule of rules) {
    if (!isUnifiedManagedRuleSelectable(rule)) continue
    const current = grouped.get(rule.ownerProfileId) ?? []
    current.push(rule)
    grouped.set(rule.ownerProfileId, current)
  }
  return grouped
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    throw new Error('Clipboard API is unavailable')
  }
  await navigator.clipboard.writeText(text)
}

async function readRulePatches(
  profileIds: string[]
): Promise<Record<string, UnifiedRulePatchFile>> {
  const entries = await Promise.all(
    profileIds.map(async (profileId) => [profileId, await readProfileRulePatch(profileId)] as const)
  )
  return Object.fromEntries(entries)
}

async function readProfileRulePatch(profileId: string): Promise<UnifiedRulePatchFile> {
  try {
    const content = await getRuleStr(profileId)
    const parsed = yaml.load(content)
    return normalizeUnifiedRulePatchFile(parsed)
  } catch {
    // No per-profile rule patch exists yet.
  }

  return createEmptyUnifiedRulePatchFile()
}

async function writeProfileRulePatch(
  profileId: string,
  rulePatch: UnifiedRulePatchFile
): Promise<void> {
  const normalizedPatch = dedupeUnifiedRulePatchFile(rulePatch)
  await setRuleStr(
    profileId,
    yaml.dump({
      prepend: normalizedPatch.prepend,
      append: normalizedPatch.append,
      delete: normalizedPatch.delete,
      disabled: normalizedPatch.disabled
    })
  )
}

export default Rules
