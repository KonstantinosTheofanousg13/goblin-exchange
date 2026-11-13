# @goblin-exchange/web

React + Vite frontend for Goblin Exchange: market overview (risers, fallers, most listed) and item pages with candle charts.

## Run locally

From the repo root:

```bash
docker compose up -d                       # Postgres + Redis
npm run db:seed -w @goblin-exchange/api    # optional: fake history while there is no real data
npm run dev:api                            # NestJS on :3000
npm run dev:web                            # Vite on :5173, proxies /api to :3000
```

Open http://localhost:5173.

## Notes

- **Prices** arrive from the API as copper strings and are formatted with BigInt (`src/lib/money.ts`), never through floats. Only the chart converts to a float, for plotting.
- **Data fetching**: TanStack Query (caching, loading/error states, no retries on 4xx).
- **Routing**: React Router 8 (data mode). The item page is lazy-loaded so the chart library isn't in the initial bundle.
- **Charts**: [TradingView Lightweight Charts](https://www.tradingview.com/lightweight-charts/); its attribution logo stays on as the licence asks.
- **Tests**: `npm test -w @goblin-exchange/web` (Vitest).
