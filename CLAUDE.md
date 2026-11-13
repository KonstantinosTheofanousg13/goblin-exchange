# CLAUDE.md

Goblin Exchange: a WoW Auction House market tracker for EU commodities (price history, candles, top movers, alerts). Full design: [docs/DESIGN.md](docs/DESIGN.md).

## About me
- Backend developer with 4 years of Java / Apache Camel / Maven / Docker / K8s.
- Learning Node.js / NestJS / TypeScript for a backend role at FXpro (forex broker).
- This repo is a portfolio project. The market-data pipeline (snapshot ingestion → time series → OHLC → alerts) is meant to map to FX/fintech work.

## How to work with me
- **Always explain the why** behind decisions, not just the what.
- **Use Java → Node mappings** where they help:
  - Spring DI → Nest DI (modules, providers, `@Injectable`)
  - Maven → npm (pom.xml → package.json, multi-module → workspaces)
  - JUnit / Mockito → Jest
  - JPA / Hibernate → Prisma
  - Camel routes → Node streams / events / BullMQ jobs
- **Work one step at a time.** Finish and explain one step before starting the next.
- **Run git, docker and npm commands (including tests) without asking.** Ask before other commands, and before opening a PR.

## Decisions already made (don't re-litigate)
- v1 scope: EU region + commodities only.
- Backend: NestJS 12 with CommonJS + Jest (the most common setup in industry).
- Frontend: React + Vite. NestJS is the only server.
- Monorepo: npm workspaces with `apps/api` (`@goblin-exchange/api`) and `apps/web`. Dependencies are hoisted to the root `node_modules`, so run `npm install` from the repo root only.
- No `@nestjs/observe` (ignore that section of `apps/api/AGENTS.md`).
- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`, `refactor:`).
- Never commit secrets. Blizzard API credentials go in `.env`, which must be gitignored.
