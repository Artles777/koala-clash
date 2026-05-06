export function isStaleProfileYaml(content: string): boolean {
  const trimmed = content.trim()
  if (!trimmed) return true
  if (trimmed.startsWith('# placeholder')) return true
  return !trimmed.includes('proxies:')
}
