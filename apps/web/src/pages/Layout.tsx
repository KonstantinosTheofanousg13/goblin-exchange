import { Link, Outlet } from 'react-router'
import { DataFreshness } from '../components/DataFreshness'

export function Layout() {
  return (
    <div className="app">
      <header className="header">
        <Link to="/" className="brand">
          <img src="/favicon.svg" alt="" width={30} height={30} />
          <span>Goblin Exchange</span>
        </Link>
        <span className="header-right">
          <DataFreshness />
          <span className="region">EU · Commodities</span>
        </span>
      </header>
      <main className="main">
        <Outlet />
      </main>
      <footer className="footer muted">
        Prices are the average of the cheapest 15% of listed quantity, from Blizzard&apos;s
        auction house data. Not affiliated with Blizzard Entertainment.
      </footer>
    </div>
  )
}
