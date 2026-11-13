import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../lib/api'

/** Item search with a debounced dropdown. Enter opens the highlighted result. */
export function SearchBox() {
  const [text, setText] = useState('')
  const [term, setTerm] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const navigate = useNavigate()
  const listId = useId()

  // Wait for a pause in typing before querying the API.
  useEffect(() => {
    const timer = setTimeout(() => setTerm(text.trim()), 250)
    return () => clearTimeout(timer)
  }, [text])

  const results = useQuery({
    queryKey: ['search', term],
    queryFn: ({ signal }) => api.searchItems(term, signal),
    enabled: term.length >= 2,
    staleTime: 60_000,
  })
  const items = term.length >= 2 ? (results.data ?? []) : []

  function go(id: number) {
    setOpen(false)
    setText('')
    navigate(`/items/${id}`)
  }

  return (
    <div className="search">
      <input
        type="search"
        placeholder="Search items…"
        aria-label="Search items"
        role="combobox"
        aria-expanded={open && items.length > 0}
        aria-controls={listId}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setOpen(true)
          setActive(0)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((i) => Math.min(i + 1, items.length - 1))
          if (e.key === 'ArrowUp') setActive((i) => Math.max(i - 1, 0))
          if (e.key === 'Enter' && items[active]) go(items[active].id)
          if (e.key === 'Escape') setOpen(false)
        }}
      />
      {open && term.length >= 2 && (
        <ul className="search-results" id={listId} role="listbox">
          {items.map((item, i) => (
            <li
              key={item.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : undefined}
              onMouseDown={() => go(item.id)}
              onMouseEnter={() => setActive(i)}
            >
              <span className={`quality-${(item.quality ?? 'common').toLowerCase()}`}>{item.name}</span>
            </li>
          ))}
          {results.isSuccess && items.length === 0 && <li className="muted">No items found</li>}
        </ul>
      )}
    </div>
  )
}
