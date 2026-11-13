# Goblin Exchange

World of Warcraft Auction House market tracker for the EU region.
Ingests hourly commodity snapshots from the Blizzard API, builds price history and OHLC candles, and surfaces top movers and price alerts.

- `apps/api` — NestJS backend (ingestion, market data, REST API)
- `apps/web` — React + Vite frontend (charts)

See [docs/DESIGN.md](docs/DESIGN.md) for the design.
