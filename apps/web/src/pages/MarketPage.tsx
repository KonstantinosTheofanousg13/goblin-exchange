import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { Change } from '../components/Change'
import { ItemName } from '../components/ItemName'
import { Money } from '../components/Money'
import { ErrorMessage, Loading } from '../components/Status'
import { api, type MoverWindow } from '../lib/api'
import { formatQuantity } from '../lib/money'

/** Market overview: biggest risers and fallers, and the most listed items. */
export function MarketPage() {
  const [params, setParams] = useSearchParams()
  const window: MoverWindow = params.get('window') === '7d' ? '7d' : '24h'

  return (
    <>
      <div className="page-title">
        <h1>Market overview</h1>
        <div className="toggle" role="group" aria-label="Time window">
          {(['24h', '7d'] as const).map((w) => (
            <button key={w} aria-pressed={w === window} onClick={() => setParams({ window: w })}>
              {w}
            </button>
          ))}
        </div>
      </div>
      <div className="grid">
        <Movers title="Top risers" window={window} direction="up" />
        <Movers title="Top fallers" window={window} direction="down" />
        <MostListed />
      </div>
    </>
  )
}

function Movers({ title, window, direction }: { title: string; window: MoverWindow; direction: 'up' | 'down' }) {
  const movers = useQuery({
    queryKey: ['movers', window, direction],
    queryFn: ({ signal }) => api.movers(window, direction, signal),
  })

  return (
    <section className="card">
      <h2>
        {title} <span className="muted">({window})</span>
      </h2>
      {movers.isPending && <Loading />}
      {movers.isError && <ErrorMessage error={movers.error} />}
      {movers.data?.length === 0 && <p className="muted">Not enough history yet.</p>}
      {movers.data && movers.data.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th className="num">Price</th>
              <th className="num">Change</th>
            </tr>
          </thead>
          <tbody>
            {movers.data.map((m) => (
              <tr key={m.itemId}>
                <td>
                  <ItemName id={m.itemId} name={m.name} />
                </td>
                <td className="num">
                  <Money copper={m.currentPrice} />
                </td>
                <td className="num">
                  <Change percent={m.changePercent} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function MostListed() {
  const listed = useQuery({ queryKey: ['most-listed'], queryFn: ({ signal }) => api.mostListed(signal) })

  return (
    <section className="card">
      <h2>Most listed</h2>
      {listed.isPending && <Loading />}
      {listed.isError && <ErrorMessage error={listed.error} />}
      {listed.data?.length === 0 && <p className="muted">No snapshots yet.</p>}
      {listed.data && listed.data.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th className="num">Price</th>
              <th className="num">Listed</th>
            </tr>
          </thead>
          <tbody>
            {listed.data.map((item) => (
              <tr key={item.itemId}>
                <td>
                  <ItemName id={item.itemId} name={item.name} />
                </td>
                <td className="num">
                  <Money copper={item.marketPrice} />
                </td>
                <td className="num">{formatQuantity(item.totalQuantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
