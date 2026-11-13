import { Link } from 'react-router'

/** An item name coloured by quality, linking to its page. Falls back to the id while names are unknown. */
export function ItemName({ id, name, quality }: { id: number; name: string | null; quality?: string | null }) {
  return (
    <Link to={`/items/${id}`} className={`item-name quality-${(quality ?? 'common').toLowerCase()}`}>
      {name ?? `Item #${id}`}
    </Link>
  )
}
