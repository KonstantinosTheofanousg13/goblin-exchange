import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { copperToGold } from '../lib/money'
import { sparklinePoints } from '../lib/sparkline'

const WIDTH = 96
const HEIGHT = 28

/**
 * A 7-day mini price chart for one item, coloured by direction.
 * It reuses the item page's hourly candles query (same React Query key), so
 * opening the item afterwards is instant. One request per row is a stopgap:
 * the planned browse endpoint will return sparkline points with each row.
 */
export function Sparkline({ itemId }: { itemId: number }) {
  const candles = useQuery({
    queryKey: ['candles', itemId, 'hour'],
    queryFn: ({ signal }) => api.candles(itemId, 'hour', signal),
  })

  const closes = candles.data?.candles.map((c) => copperToGold(c.close)) ?? []
  const points = sparklinePoints(closes, WIDTH, HEIGHT)
  const tone = closes.length < 2 ? 'flat' : closes[closes.length - 1] >= closes[0] ? 'up' : 'down'

  return (
    <svg className={`sparkline ${tone}`} width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
      {points && <polyline points={points} fill="none" strokeWidth="1.5" strokeLinejoin="round" />}
    </svg>
  )
}
