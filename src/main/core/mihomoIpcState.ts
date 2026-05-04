let activeMihomoIpcPath: string | undefined

export function setActiveMihomoIpcPath(ipcPath: string): void {
  activeMihomoIpcPath = ipcPath
}

export function getActiveMihomoIpcPath(): string | undefined {
  return activeMihomoIpcPath
}

export function clearActiveMihomoIpcPath(ipcPath?: string): void {
  if (!ipcPath || activeMihomoIpcPath === ipcPath) {
    activeMihomoIpcPath = undefined
  }
}

export function shouldRestartCoreForMihomoIpcChange(
  activeIpcPath: string | null | undefined,
  expectedIpcPath: string
): boolean {
  return !!activeIpcPath && activeIpcPath !== expectedIpcPath
}
