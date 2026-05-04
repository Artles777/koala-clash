import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  getUnifiedRuleBypassLabelKey,
  getUnifiedRuleBypassPresentation
} from '../src/core/ui/unified-rule-bypass'
import { getUnifiedRuleDisplayTarget, type UnifiedRuleItem } from '../src/core/ui/unified-ui'

function directRule(type: string): Pick<UnifiedRuleItem, 'type' | 'target'> {
  return { type, target: 'DIRECT' }
}

describe('unified rule bypass presentation', () => {
  it('maps bypass modes to stable user-facing label keys', () => {
    assert.equal(getUnifiedRuleBypassLabelKey('true_bypass'), 'pages.rules.bypassTrue')
    assert.equal(getUnifiedRuleBypassLabelKey('partial_bypass'), 'pages.rules.bypassPartial')
    assert.equal(getUnifiedRuleBypassLabelKey('learned_bypass'), 'pages.rules.bypassLearned')
    assert.equal(getUnifiedRuleBypassLabelKey('direct_only'), 'pages.rules.bypassDirectOnly')
    assert.equal(getUnifiedRuleBypassLabelKey('fallback_only'), 'pages.rules.bypassFallbackOnly')
    assert.equal(getUnifiedRuleBypassLabelKey('unsupported'), 'pages.rules.bypassUnsupported')
  })

  it('does not add bypass badges for non-DIRECT rules', () => {
    const presentation = getUnifiedRuleBypassPresentation(
      { type: 'PROCESS-NAME', target: 'PROXY' },
      { tunEnabled: true }
    )

    assert.equal(presentation, undefined)
  })

  it('shows Linux native PROCESS-NAME bypass when the native data plane is active', () => {
    const presentation = getUnifiedRuleBypassPresentation(directRule('PROCESS-NAME'), {
      tunEnabled: true,
      nativeProcessBypassActive: true,
      nativeProcessBypassNativeDataPlaneActive: true,
      nativeProcessBypassPlatformMode: 'linux_native',
      processDirectEffectiveBypassMode: 'true_bypass'
    })

    assert.equal(presentation?.mode, 'true_bypass')
    assert.equal(presentation?.hintKey, 'pages.rules.bypassHintProcessLinuxActive')
  })

  it('shows Windows PROCESS-NAME fallback until the service data plane is active', () => {
    const presentation = getUnifiedRuleBypassPresentation(directRule('PROCESS-NAME'), {
      tunEnabled: true,
      nativeProcessBypassPlatformMode: 'windows_wfp_service',
      nativeProcessBypassWindowsControllerAvailable: true,
      nativeProcessBypassWindowsServiceAvailable: true,
      nativeProcessBypassNativeDataPlaneActive: false,
      processDirectEffectiveBypassMode: 'direct_only'
    })

    assert.equal(presentation?.mode, 'fallback_only')
    assert.equal(presentation?.hintKey, 'pages.rules.bypassHintProcessWindowsDataplaneInactive')
  })

  it('shows macOS PROCESS-NAME fallback-only state without claiming native bypass', () => {
    const presentation = getUnifiedRuleBypassPresentation(directRule('PROCESS-NAME'), {
      tunEnabled: true,
      nativeProcessBypassPlatformMode: 'macos_fallback_only',
      nativeProcessBypassMacosControllerAvailable: false,
      processDirectEffectiveBypassMode: 'direct_only'
    })

    assert.equal(presentation?.mode, 'fallback_only')
    assert.equal(presentation?.hintKey, 'pages.rules.bypassHintProcessMacosFallback')
  })

  it('shows learned PROCESS-NAME bypass when observed IPs are active', () => {
    const presentation = getUnifiedRuleBypassPresentation(directRule('PROCESS-NAME'), {
      tunEnabled: true,
      learnedBypassActive: true,
      learnedBypassOverallStatus: 'active',
      processDirectEffectiveBypassMode: 'learned_bypass'
    })

    assert.equal(presentation?.mode, 'learned_bypass')
    assert.equal(presentation?.hintKey, 'pages.rules.bypassHintProcessLearnedActive')
  })

  it('shows IP-CIDR as true bypass even when other direct exclude rules are partial', () => {
    const presentation = getUnifiedRuleBypassPresentation(directRule('IP-CIDR'), {
      tunEnabled: true,
      directTunBypassActive: true,
      directTunBypassStatus: 'partial',
      directExcludeOverallStatus: 'partial'
    })

    assert.equal(presentation?.mode, 'true_bypass')
    assert.equal(presentation?.hintKey, 'pages.rules.bypassHintAddressExcluded')
  })

  it('shows DOMAIN-SUFFIX as partial bypass when runtime direct excludes are active', () => {
    const presentation = getUnifiedRuleBypassPresentation(directRule('DOMAIN-SUFFIX'), {
      tunEnabled: true,
      directTunBypassActive: true,
      directTunBypassStatus: 'resolved',
      directExcludeOverallStatus: 'active'
    })

    assert.equal(presentation?.mode, 'partial_bypass')
    assert.equal(presentation?.hintKey, 'pages.rules.bypassHintDomainSuffixPartial')
  })

  it('keeps owner/action display mapping unchanged for VPN PROXY rules', () => {
    assert.equal(getUnifiedRuleDisplayTarget('amnezia', 'PROXY'), 'VPN / PROXY')
    assert.equal(getUnifiedRuleDisplayTarget('mihomo', 'PROXY'), 'PROXY')
  })
})
