import {
  AmneziaHelperRoutingDiagnosticInput,
  AmneziaHelperRoutingDiagnosticResult,
  evaluateAmneziaHelperRoutingDiagnostic
} from '../../core/routing/amnezia-helper-routing-diagnostics'
import { getAmneziaHelperRules } from './amneziaHelperRules'
import {
  getActiveAmneziaHelperRoutingTarget,
  getLastAmneziaHelperRoutingTarget
} from '../runtime/amnezia-helper-routing-state'

export async function evaluateAmneziaHelperRouting(
  input: AmneziaHelperRoutingDiagnosticInput
): Promise<AmneziaHelperRoutingDiagnosticResult> {
  const [rules] = await Promise.all([getAmneziaHelperRules()])
  const target = getLastAmneziaHelperRoutingTarget() ?? getActiveAmneziaHelperRoutingTarget()

  return evaluateAmneziaHelperRoutingDiagnostic({
    input,
    rules,
    target
  })
}
