# Goblin Exchange — Design (v1)

WoW Auction House market tracker. EU commodities price history, candles, top movers, alerts.
Portfolio goal: a market-data pipeline (snapshot ingestion → time-series → OHLC → alerts) that maps to FX/fintech work.

## v1 scope
- EU region only
- Commodities only (region-wide; one API call per hour covers all of EU)
- Item page: candle chart (hourly/daily OHLC), current price, quantity listed, 24h/7d change
- Market overview: top risers/fallers, most listed items
- Item search by name
- v1.5: watchlist + price alerts, delivered through n8n (see Alerts)

## Stack
- Backend: NestJS 12 (TypeScript, CommonJS), Postgres + Prisma 7, Redis + BullMQ (jobs)
  - Prisma 7, not 8: 8 is a pre-1.0 rewrite (contract file, new query API); 7 is the stable, widely used line
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
- ItemsModule — item name, quality, icon URL and item class/subclass, cached from Blizzard's item and item-media endpoints (background job for items with missing metadata; rate-limited)
- REST API — controllers live in their feature modules (ItemsModule, MarketModule), Nest convention; served under /api, OpenAPI docs at /docs
- AlertsModule (v1.5) — evaluate watchlist rules after each snapshot, hand fired alerts to n8n

## Alerts (v1.5)
- Rules: per item, e.g. "market price below X", "above X", "moved more than N% in 24h"
- Evaluation stays in NestJS: runs after each ingestion job, against the new item_price_hourly rows. Business logic stays typed and unit-tested
- Delivery goes to n8n: Nest POSTs a signed (HMAC) alert event to an n8n webhook, and n8n fans it out (Discord, email via the existing SMTP credential)
  - Why: n8n already runs on the VPS with notification credentials, and channels can change without redeploying the API. Nest owns *what* fires; n8n owns *where it goes* (like a Camel route with pluggable endpoints)
  - The call stays on the internal Docker network (`http://n8n:5678/webhook/...`); no public Caddy route is needed
- De-duplication: a rule fires once, then re-arms only after the condition clears (no hourly spam)

## Frontend (v1.1 redesign)
Goal: feels like the in-game auction house browser, with an original, modern look (no copied game UI art).
- Home = browse screen: a prominent search box, a category sidebar (item class: Trade Goods, Consumables, ...), and a results table
  - Results columns: icon, name (quality colour), price as gold/silver/copper coins, quantity listed, 24h change, 7-day sparkline; sortable
  - Empty state (no search yet) = market pulse: top risers and fallers with icons and sparklines, plus most-listed items
- Item page: icon + name header, current price, 24h/7d change, lowest listing, quantity, candle/line chart (hourly/daily)
- Data freshness: header shows "Data from 14:05 · 23 min ago" (amber after 90 min = missed snapshot). Only GET /api/market/status polls (every 2 min); a newer snapshot invalidates all other queries
  - Latency is bounded by Blizzard: ~hourly snapshots + our 15-min poll = new listings show up after 15–75 min; listings bought between snapshots are never seen. This is an hourly-bar tracker, not a live order book
- API additions: a browse endpoint (search + category filter + sort, returning price, change and sparkline points per row); icons and quality on movers and most-listed

## Data model
- item: id (Blizzard item id), name, icon, quality (name/icon/quality filled in later by ItemsModule)
- snapshot: id, region, fetched_at, last_modified, auction_count ((region, last_modified) unique → idempotency)
- item_price_hourly: one row per (snapshot, item): captured_at, min price, market price (avg of cheapest ~15% quantity), total quantity, listing count
  - Keyed per snapshot, not per clock hour: Blizzard publishes "about hourly" with drift, so two snapshots can land in the same hour
- Daily/hourly OHLC: computed at query time from item_price_hourly (UTC buckets, indexed by item + time)
  - A pre-computed item_price_daily table is deferred until we prune old hourly rows
- Prices are BigInt copper (1 gold = 10,000 copper): never floats, and the gold cap (10^11 copper) exceeds a 32-bit int
- Raw auctions are not kept long-term (only latest snapshot, for v2 features)

## Open decisions (decide once Blizzard API keys work)
- Sidebar categories: keep the commodity-only list, build it from the item classes actually present in commodity data (preferred), or show the full in-game list with realm-only categories greyed out as "coming in v2"
- Verify the hard-coded class/subclass ids in `apps/api/src/items/categories.ts` against GET /data/wow/item-class/index

## v2 ideas
- Estimated sales: listings that disappear between snapshots before expiry → probably sold
- Realm (non-commodity) auctions, crafting profit calculator, US region
- Multiple game versions with a version switch in the UI (Retail / Classic / WoW Forever, the level-60 Classic-style version with enhanced graphics)
  - Same API key; the version is picked by namespace (e.g. `dynamic-eu` for retail, `dynamic-classic-eu` / `dynamic-classic1x-eu` for Classic). WoW Forever's namespace and AH endpoint still need checking
  - Classic-style auction houses are per connected realm (and per faction), not region-wide: needs a realm (and faction) picker, and one ingestion job per realm group, so watch the 1 GB VPS
  - Data model: snapshot gets `game_version`, `connected_realm_id` and `auction_house_id` (faction) next to `region`; candles, movers and alerts are then scoped by them. Stream parser, candles and charts stay the same
  - Plan: finish and deploy retail v1 first; keep step-2 changes compatible with adding these columns later


## Timeline (~2 weeks)
- Days 1–2: repo, Docker, Blizzard OAuth, first commodities fetch
- Days 3–5: ingestion pipeline, schema, hourly job
- Days 6–8: candles, top movers, REST API
- Days 9–12: frontend with charts
- Days 13–14: deploy + Discord alerts
