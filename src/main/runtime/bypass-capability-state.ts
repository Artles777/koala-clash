import type { BypassCapabilityReport } from '../../core/routing/bypass-capabilities'

let lastBypassCapabilityReport: BypassCapabilityReport | undefined

export function updateBypassCapabilityState(report: BypassCapabilityReport | undefined): void {
  lastBypassCapabilityReport = report ? cloneReport(report) : undefined
}

export function getLastBypassCapabilityReport(): BypassCapabilityReport | undefined {
  return cloneReport(lastBypassCapabilityReport)
}

function cloneReport(
  report: BypassCapabilityReport | undefined
): BypassCapabilityReport | undefined {
  if (!report) return undefined
  return {
    ...report,
    nativeProcessBypass: {
      ...report.nativeProcessBypass,
      diagnostics: [...report.nativeProcessBypass.diagnostics],
      activeProcesses: [...report.nativeProcessBypass.activeProcesses]
    },
    rules: report.rules.map((rule) => ({ ...rule })),
    summary: { ...report.summary },
    warnings: [...report.warnings]
  }
}
