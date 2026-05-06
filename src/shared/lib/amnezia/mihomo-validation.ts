export function isAmneziaWgUnsupportedFailure(output: string | undefined | null): boolean {
  if (!output) return false
  const lower = output.toLowerCase()
  return (
    lower.includes('unknown field amnezia-wg-option') ||
    lower.includes('unknown field "amnezia-wg-option"') ||
    lower.includes("unknown field 'amnezia-wg-option'") ||
    lower.includes('unsupported wireguard option') ||
    lower.includes('unsupported amnezia-wg-option') ||
    lower.includes('unknown wireguard option')
  )
}
