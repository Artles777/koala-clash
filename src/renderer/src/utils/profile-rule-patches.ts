import yaml from 'js-yaml'
import { getRuleStr, setRuleStr } from './ipc'
import { createKoalaRuBundleRule } from '../../../core/routing/mihomo-rule-provider-presets'
import {
  appendUnifiedManagedRule,
  createEmptyUnifiedRulePatchFile,
  dedupeUnifiedRulePatchFile,
  normalizeUnifiedRulePatchFile,
  UnifiedRulePatchFile
} from '../../../core/ui/unified-rule-management'

export async function appendRuBundleToProfile(
  profileId: string,
  target: 'DIRECT' | 'PROXY' | 'REJECT' = 'DIRECT'
): Promise<boolean> {
  const patch = await readProfileRulePatch(profileId)
  const result = appendUnifiedManagedRule(patch, createKoalaRuBundleRule(target))
  await writeProfileRulePatch(profileId, result.patch)
  return result.added
}

async function readProfileRulePatch(profileId: string): Promise<UnifiedRulePatchFile> {
  try {
    const content = await getRuleStr(profileId)
    const parsed = yaml.load(content)
    return normalizeUnifiedRulePatchFile(parsed)
  } catch {
    // Profile has no app-managed rule patch yet.
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
