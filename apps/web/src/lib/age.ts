/** "just now", "12 min ago", "3 h ago", "2 days ago": for showing how old the data is. */
export function formatAge(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours} h ago`
  return `${Math.floor(hours / 24)} days ago`
}
