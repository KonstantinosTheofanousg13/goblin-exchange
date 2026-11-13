import { Link, Outlet } from 'react-router'
import { SearchBox } from '../components/SearchBox'

export function Layout() {
  return (
    <div className="app">
      <header className="header">
        <Link to="/" className="brand">
          <img src="/favicon.svg" alt="" width={28} height={28} />
          <span>Goblin Exchange</span>
        </Link>
        <span className="region">EU commodities</span>
        <SearchBox />
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
