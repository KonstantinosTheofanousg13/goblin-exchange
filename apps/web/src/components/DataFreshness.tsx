import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { formatAge } from '../lib/age'

/** Blizzard publishes about hourly; older than this means a snapshot was missed. */
const STALE_AFTER_MS = 90 * 60_000

/**
 * "Data from 14:05 · 23 min ago" in the header, so users know how old prices are.
 *
 * It also drives auto-refresh: only this tiny status call polls (every 2 minutes,
 * while the tab is visible). When it sees a newer snapshot, it invalidates every
 * other query, so prices, movers and sparklines reload once, only when new data exists.
 */
export function DataFreshness() {
  const queryClient = useQueryClient()
  const status = useQuery({
    queryKey: ['status'],
    queryFn: ({ signal }) => api.status(signal),
    refetchInterval: 2 * 60_000,
    staleTime: 0,
  })
  const snapshotAt = status.data?.snapshotAt ?? null

  // New snapshot since the last poll: refresh everything else.
  const previous = useRef(snapshotAt)
  useEffect(() => {
    if (previous.current && snapshotAt && snapshotAt !== previous.current) {
      void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'status' })
    }
    previous.current = snapshotAt
  }, [snapshotAt, queryClient])

  // Re-render every 30s so "x min ago" keeps counting.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  if (!status.data) return null
  if (!snapshotAt) return <span className="freshness muted">No data yet</span>

  const taken = new Date(snapshotAt)
  const age = now - taken.getTime()
  const time = taken.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  return (
    <span
      className={`freshness ${age > STALE_AFTER_MS ? 'stale' : ''}`}
      title="Blizzard publishes an auction house snapshot about once an hour; we check for a new one every 15 minutes."
    >
      <span className="freshness-dot" aria-hidden="true" />
      Data from {time} · {formatAge(Math.max(0, age))}
    </span>
  )
}
