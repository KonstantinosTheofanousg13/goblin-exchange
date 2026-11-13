# Goblin Exchange — Design (v1)

WoW Auction House market tracker. EU commodities price history, candles, top movers, alerts.
Portfolio goal: a market-data pipeline (snapshot ingestion → time-series → OHLC → alerts) that maps to FX/fintech work.

## v1 scope
- EU region only
- Commodities only (region-wide; one API call per hour covers all of EU)
- Item page: candle chart (hourly/daily OHLC), current price, quantity listed, 24h/7d change
- Market overview: top risers/fallers, most listed items
- Item search by name
- v1.5: watchlist + price alerts via Discord bot

## Stack
- Backend: NestJS (TypeScript), Postgres + Prisma, Redis + BullMQ (jobs)
- Frontend: React + Vite, TradingView Lightweight Charts
- Infra: Docker Compose, GitHub Actions CI, Hetzner VPS later
- Repo: monorepo with npm workspaces — apps/api, apps/web

## Data source (Blizzard API)
- Commodities endpoint, refreshed about hourly; each listing: auction id, item id, quantity, unit price, time left
- Large payload → stream-parse, never load fully into memory
- Use Last-Modified header to skip snapshots already processed
- Auth: OAuth client credentials, token cached until expiry

## Modules (modular monolith)
- BlizzardModule — OAuth token cache, HTTP client with retries/backoff
- IngestionModule — hourly job: fetch → stream-parse → per-item aggregates → batch insert; idempotent per snapshot
- MarketModule — hourly → daily OHLC rollups, top movers
- ItemsModule — item name/icon/quality cached from Blizzard item endpoint
- ApiModule — REST endpoints for the frontend
- AlertsModule (v1.5) — evaluate watchlists after each snapshot, notify Discord

## Data model (draft)
- item: id, name, icon, quality
- snapshot: id, region, fetched_at, last_modified (unique → idempotency)
- item_price_hourly: item, hour, min price, market price (avg of cheapest ~15% quantity), total quantity, listing count
- item_price_daily: OHLC rolled up from hourly
- Raw auctions are not kept long-term (only latest snapshot, for v2 features)

## v2 ideas
- Estimated sales: listings that disappear between snapshots before expiry → probably sold
- Realm (non-commodity) auctions, crafting profit calculator, US region

## Timeline (~2 weeks)
- Days 1–2: repo, Docker, Blizzard OAuth, first commodities fetch
- Days 3–5: ingestion pipeline, schema, hourly job
- Days 6–8: candles, top movers, REST API
- Days 9–12: frontend with charts
- Days 13–14: deploy + Discord alerts
