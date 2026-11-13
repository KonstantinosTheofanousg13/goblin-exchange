import { useQuery } from '@tanstack/react-query'
import { useEffect, useEffectEvent, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Change } from '../components/Change'
import { ItemIcon } from '../components/ItemIcon'
import { ItemName } from '../components/ItemName'
import { Money } from '../components/Money'
import { Sparkline } from '../components/Sparkline'
import { ErrorMessage, Loading } from '../components/Status'
import { api, type ItemFilter, type ItemSearchResult, type MoverWindow } from '../lib/api'
import { formatQuantity } from '../lib/money'

type View = 'pulse' | 'risers' | 'fallers' | 'listed'

const VIEWS: { id: View; label: string; icon: string }[] = [
  { id: 'pulse', label: 'Market pulse', icon: '◆' },
  { id: 'risers', label: 'Top risers', icon: '▲' },
  { id: 'fallers', label: 'Top fallers', icon: '▼' },
  { id: 'listed', label: 'Most listed', icon: '≡' },
]

/**
 * Home page, modelled on the in-game auction house browser: a search box on top,
 * a sidebar of views on the left and a results panel on the right.
 * All state (search text, category, view, window) lives in the URL, so the back button
 * returns from an item page to the same results, and any view can be linked.
 */
export function BrowsePage() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const view = (VIEWS.find((v) => v.id === params.get('view'))?.id ?? 'pulse') as View
  const window: MoverWindow = params.get('window') === '7d' ? '7d' : '24h'
  const classId = intParam(params.get('cat'))
  const subclassId = classId === undefined ? undefined : intParam(params.get('sub'))
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: ({ signal }) => api.categories(signal),
    staleTime: Infinity, // static list: fetch once per visit
  })
  const category = categories.data?.find((c) => c.classId === classId)
  const subcategory = category?.subcategories.find((s) => s.subclassId === subclassId)
  const browsing = query.length >= 2 || classId !== undefined

  function update(changes: Record<string, string | null>, replace = false) {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    setParams(next, { replace })
  }

  return (
    <section className="ah">
      <header className="ah-bar">
        <SearchInput value={query} onSearch={(q) => update({ q: q || null }, true)} />
        <div className="toggle" role="group" aria-label="Time window">
          {(['24h', '7d'] as const).map((w) => (
            <button key={w} aria-pressed={w === window} onClick={() => update({ window: w })}>
              {w}
            </button>
          ))}
        </div>
      </header>

      <div className="ah-body">
        <nav className="ah-sidebar" aria-label="Market views and categories">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              className={`ah-nav view-${v.id}`}
              aria-current={!browsing && v.id === view ? 'page' : undefined}
              onClick={() => update({ view: v.id === 'pulse' ? null : v.id, q: null, cat: null, sub: null })}
            >
              <span className="ah-nav-icon">{v.icon}</span>
              {v.label}
            </button>
          ))}

          <h2 className="ah-sidebar-heading">Categories</h2>
          {categories.isError && <p className="muted ah-sidebar-note">Categories unavailable.</p>}
          {categories.data?.map((c) => {
            const open = c.classId === classId
            return (
              <div key={c.classId} className="ah-category">
                <button
                  className="ah-nav ah-cat"
                  aria-expanded={c.subcategories.length > 0 ? open : undefined}
                  aria-current={open && subclassId === undefined ? 'page' : undefined}
                  // Keeps the search text: like in-game, a search runs inside the chosen category.
                  onClick={() => update({ cat: String(c.classId), sub: null, view: null })}
                >
                  {c.name}
                  {c.subcategories.length > 0 && <span className="ah-chevron">{open ? '▾' : '▸'}</span>}
                </button>
                {open &&
                  c.subcategories.map((s) => (
                    <button
                      key={s.subclassId}
                      className="ah-nav ah-subcat"
                      aria-current={s.subclassId === subclassId ? 'page' : undefined}
                      onClick={() => update({ cat: String(c.classId), sub: String(s.subclassId), view: null })}
                    >
                      {s.name}
                    </button>
                  ))}
              </div>
            )
          })}
        </nav>

        <div className="ah-content">
          {browsing ? (
            <ItemResults
              search={query.length >= 2 ? query : undefined}
              classId={classId}
              subclassId={subclassId}
              title={[category?.name, subcategory?.name].filter(Boolean).join(' › ')}
            />
          ) : query.length === 1 ? (
            <p className="muted status">Type at least 2 letters.</p>
          ) : view === 'pulse' ? (
            <div className="pulse">
              <MoversPanel title="Top risers" window={window} direction="up" limit={5} />
              <MoversPanel title="Top fallers" window={window} direction="down" limit={5} />
              <ListedPanel limit={5} />
            </div>
          ) : view === 'listed' ? (
            <ListedPanel />
          ) : (
            <MoversPanel
              title={view === 'risers' ? 'Top risers' : 'Top fallers'}
              window={window}
              direction={view === 'risers' ? 'up' : 'down'}
            />
          )}
        </div>
      </div>
    </section>
  )
}

/** Debounced search input: the URL (and the API call) updates after a pause in typing. */
function SearchInput({ value, onSearch }: { value: string; onSearch: (q: string) => void }) {
  const [text, setText] = useState(value)
  // The URL changed from outside (back button, sidebar click): show its text.
  // Adjusting state during render is React's recommended alternative to a syncing effect.
  // The trim check keeps a trailing space the user is still typing.
  const [syncedValue, setSyncedValue] = useState(value)
  if (value !== syncedValue) {
    setSyncedValue(value)
    if (value !== text.trim()) setText(value)
  }

  // Always calls the latest onSearch without making it an effect dependency.
  const search = useEffectEvent(onSearch)

  useEffect(() => {
    const trimmed = text.trim()
    if (trimmed === value) return
    const timer = setTimeout(() => search(trimmed), 250)
    return () => clearTimeout(timer)
  }, [text, value])

  return (
    <label className="ah-search">
      <span className="ah-search-icon" aria-hidden="true">
        ⌕
      </span>
      <input
        type="search"
        placeholder="Search commodities… (e.g. ore, herb, potion)"
        aria-label="Search items"
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </label>
  )
}

/** Items matching a search term and/or a category. `title` is the category path, if any. */
function ItemResults({ title, ...filter }: ItemFilter & { title: string }) {
  const results = useQuery({
    queryKey: ['items', filter],
    queryFn: ({ signal }) => api.searchItems(filter, signal),
  })

  const heading = filter.search
    ? `Results for “${filter.search}”${title ? ` in ${title}` : ''}`
    : title || 'Category'

  if (results.isPending) return <Loading />
  if (results.isError) return <ErrorMessage error={results.error} />
  if (results.data.length === 0) {
    return (
      <p className="muted status">
        {filter.search ? `No items match “${filter.search}”${title ? ` in ${title}` : ''}.` : `No items in ${heading} yet.`}
      </p>
    )
  }

  return (
    <Panel title={heading} count={results.data.length}>
      <ItemTable head={['Price', '24h', 'Listed', '7 days']}>
        {results.data.map((item) => (
          <SearchRow key={item.id} item={item} />
        ))}
      </ItemTable>
    </Panel>
  )
}

/**
 * One search hit. Search returns only id/name/quality, so each row loads its
 * own price summary (shared with the item page's cache). The planned browse
 * endpoint will return prices with the search results in one call.
 */
function SearchRow({ item }: { item: ItemSearchResult }) {
  const summary = useQuery({
    queryKey: ['item', item.id],
    queryFn: ({ signal }) => api.itemSummary(item.id, signal),
  })
  const s = summary.data
  return (
    <ItemRow id={item.id} name={item.name} icon={item.icon} quality={item.quality}>
      <td className="num">{s ? <Money copper={s.marketPrice} /> : <Dash />}</td>
      <td className="num">{s ? <Change percent={s.change24hPercent} /> : <Dash />}</td>
      <td className="num">{s ? formatQuantity(s.totalQuantity) : <Dash />}</td>
      <td className="spark-cell">
        <Sparkline itemId={item.id} />
      </td>
    </ItemRow>
  )
}

function MoversPanel({
  title,
  window,
  direction,
  limit = 10,
}: {
  title: string
  window: MoverWindow
  direction: 'up' | 'down'
  limit?: number
}) {
  const movers = useQuery({
    queryKey: ['movers', window, direction],
    queryFn: ({ signal }) => api.movers(window, direction, signal),
  })

  return (
    <Panel title={title} badge={window} tone={direction}>
      {movers.isPending && <Loading />}
      {movers.isError && <ErrorMessage error={movers.error} />}
      {movers.data?.length === 0 && <p className="muted status">Not enough history yet.</p>}
      {movers.data && movers.data.length > 0 && (
        <ItemTable head={['Price', 'Change', '7 days']}>
          {movers.data.slice(0, limit).map((m) => (
            <ItemRow key={m.itemId} id={m.itemId} name={m.name}>
              <td className="num">
                <Money copper={m.currentPrice} />
              </td>
              <td className="num">
                <Change percent={m.changePercent} />
              </td>
              <td className="spark-cell">
                <Sparkline itemId={m.itemId} />
              </td>
            </ItemRow>
          ))}
        </ItemTable>
      )}
    </Panel>
  )
}

function ListedPanel({ limit = 10 }: { limit?: number }) {
  const listed = useQuery({ queryKey: ['most-listed'], queryFn: ({ signal }) => api.mostListed(signal) })

  return (
    <Panel title="Most listed">
      {listed.isPending && <Loading />}
      {listed.isError && <ErrorMessage error={listed.error} />}
      {listed.data?.length === 0 && <p className="muted status">No snapshots yet.</p>}
      {listed.data && listed.data.length > 0 && (
        <ItemTable head={['Price', 'Listed', '7 days']}>
          {listed.data.slice(0, limit).map((item) => (
            <ItemRow key={item.itemId} id={item.itemId} name={item.name}>
              <td className="num">
                <Money copper={item.marketPrice} />
              </td>
              <td className="num">{formatQuantity(item.totalQuantity)}</td>
              <td className="spark-cell">
                <Sparkline itemId={item.itemId} />
              </td>
            </ItemRow>
          ))}
        </ItemTable>
      )}
    </Panel>
  )
}

// ---- Building blocks ----

function Panel({
  title,
  badge,
  count,
  tone,
  children,
}: {
  title: string
  badge?: string
  count?: number
  tone?: 'up' | 'down'
  children: ReactNode
}) {
  return (
    <section className={`panel ${tone ? `panel-${tone}` : ''}`}>
      <h2 className="panel-title">
        {title}
        {badge && <span className="badge">{badge}</span>}
        {count !== undefined && <span className="muted panel-count">{count} items</span>}
      </h2>
      {children}
    </section>
  )
}

function ItemTable({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <table className="item-table">
      <thead>
        <tr>
          <th>Item</th>
          {head.map((h) => (
            <th key={h} className={h === '7 days' ? 'spark-cell' : 'num'}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  )
}

/** A clickable row: the whole row opens the item; the name stays a real link for keyboard and screen readers. */
function ItemRow({
  id,
  name,
  icon,
  quality,
  children,
}: {
  id: number
  name: string | null
  icon?: string | null
  quality?: string | null
  children: ReactNode
}) {
  const navigate = useNavigate()
  return (
    <tr className="item-row" onClick={() => navigate(`/items/${id}`)}>
      <td>
        <span className="item-cell">
          <ItemIcon name={name} icon={icon} quality={quality} />
          <ItemName id={id} name={name} quality={quality} />
        </span>
      </td>
      {children}
    </tr>
  )
}

const Dash = () => <span className="muted">…</span>

/** A non-negative integer URL param, or undefined if missing or malformed. */
function intParam(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value)) return undefined
  return Number(value)
}
