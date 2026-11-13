import { useQuery } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router'
import { Change } from '../components/Change'
import { Money } from '../components/Money'
import { PriceChart } from '../components/PriceChart'
import { ErrorMessage, Loading } from '../components/Status'
import { api, ApiError, type CandleInterval } from '../lib/api'
import { formatQuantity } from '../lib/money'

/** One item: latest prices, 24h/7d change, and a candle chart (hourly or daily). */
export function ItemPage() {
  const id = Number(useParams().id)
  const [params, setParams] = useSearchParams()
  const interval: CandleInterval = params.get('interval') === 'hour' ? 'hour' : 'day'

  const summary = useQuery({
    queryKey: ['item', id],
    queryFn: ({ signal }) => api.itemSummary(id, signal),
    enabled: Number.isInteger(id) && id > 0,
  })
  const candles = useQuery({
    queryKey: ['candles', id, interval],
    queryFn: ({ signal }) => api.candles(id, interval, signal),
    enabled: summary.isSuccess,
  })

  if (!Number.isInteger(id) || id <= 0) return <NotFound />
  if (summary.isPending) return <Loading />
  if (summary.isError) {
    return summary.error instanceof ApiError && summary.error.status === 404 ? (
      <NotFound />
    ) : (
      <ErrorMessage error={summary.error} />
    )
  }

  const item = summary.data
  return (
    <>
      <div className="page-title">
        <h1>{item.name ?? `Item #${item.itemId}`}</h1>
        <span className="muted">
          Updated {new Date(item.capturedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
        </span>
      </div>

      <dl className="stats">
        <div>
          <dt>Market price</dt>
          <dd className="big">
            <Money copper={item.marketPrice} />
          </dd>
        </div>
        <div>
          <dt>24h</dt>
          <dd className="big">
            <Change percent={item.change24hPercent} />
          </dd>
        </div>
        <div>
          <dt>7d</dt>
          <dd className="big">
            <Change percent={item.change7dPercent} />
          </dd>
        </div>
        <div>
          <dt>Lowest listing</dt>
          <dd>
            <Money copper={item.minPrice} />
          </dd>
        </div>
        <div>
          <dt>Listed</dt>
          <dd>
            {formatQuantity(item.totalQuantity)} in {item.listingCount.toLocaleString('en-US')} listings
          </dd>
        </div>
      </dl>

      <section className="card">
        <div className="card-header">
          <h2>Price</h2>
          <div className="toggle" role="group" aria-label="Candle interval">
            {(['hour', 'day'] as const).map((i) => (
              <button key={i} aria-pressed={i === interval} onClick={() => setParams({ interval: i })}>
                {i === 'hour' ? 'Hourly · 7 days' : 'Daily · 90 days'}
              </button>
            ))}
          </div>
        </div>
        {candles.isPending && <Loading />}
        {candles.isError && <ErrorMessage error={candles.error} />}
        {candles.data && <PriceChart candles={candles.data.candles} interval={candles.data.interval} />}
      </section>
    </>
  )
}

function NotFound() {
  return (
    <div className="status">
      <h1>No price data</h1>
      <p className="muted">
        This item has no listings in our snapshots. <Link to="/">Back to the market overview</Link>
      </p>
    </div>
  )
}
