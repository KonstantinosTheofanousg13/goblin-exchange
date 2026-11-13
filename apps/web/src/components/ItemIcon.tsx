/**
 * An item icon framed in its quality colour. Until ItemsModule stores real icon
 * URLs from Blizzard, it falls back to the item's initials on a generated tile.
 */
export function ItemIcon({
  name,
  icon,
  quality,
  size = 'md',
}: {
  name: string | null
  icon?: string | null
  quality?: string | null
  size?: 'md' | 'lg'
}) {
  const q = (quality ?? 'common').toLowerCase()
  return (
    <span className={`item-icon ${size} frame-${q}`} aria-hidden="true">
      {icon ? <img src={icon} alt="" loading="lazy" /> : <span className="initials">{initials(name)}</span>}
    </span>
  )
}

function initials(name: string | null): string {
  if (!name) return '?'
  const words = name.split(/\s+/).filter(Boolean)
  return words
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}
