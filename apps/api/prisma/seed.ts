/**
 * Dev-only seed: fake EU commodity history, so the UI has something to show
 * before real Blizzard data exists. Run with `npm run db:seed`.
 *
 * - 30 made-up items with ids in a reserved range (990_000_001+), so they can't
 *   collide with real Blizzard item ids.
 * - One snapshot per hour for the last 21 days, prices following a random walk.
 * - Deterministic (seeded PRNG): every run produces the same data.
 *
 * Refuses to run if the database already has snapshots, unless --force.
 * Before ingesting real data, wipe it: `npx prisma migrate reset` (in apps/api).
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client';

config({ path: ['.env', '../../.env'], quiet: true });

const REGION = 'eu';
const DAYS = 21;
const FIRST_ITEM_ID = 990_000_001;
const COPPER_PER_GOLD = 10_000;

/** name, quality, starting price in gold, typical listed quantity */
const ITEMS: [string, string, number, number][] = [
  ['Emberleaf', 'COMMON', 12, 180_000],
  ['Duskthorn', 'COMMON', 8.5, 240_000],
  ['Moonpetal', 'COMMON', 21, 95_000],
  ['Gloomcap Spore', 'COMMON', 4.2, 410_000],
  ['Starsilver Ore', 'COMMON', 18, 150_000],
  ['Ironvein Ore', 'COMMON', 6.8, 320_000],
  ['Cinderite Ore', 'UNCOMMON', 44, 38_000],
  ['Gloomhide Leather', 'COMMON', 9.9, 200_000],
  ['Stormscale', 'UNCOMMON', 31, 52_000],
  ['Wyrmbone Fragment', 'RARE', 260, 4_100],
  ['Weavecloth Bolt', 'COMMON', 3.1, 520_000],
  ['Spellthread Spool', 'UNCOMMON', 57, 21_000],
  ['Arcane Dust', 'COMMON', 2.4, 900_000],
  ['Resonant Shard', 'UNCOMMON', 38, 64_000],
  ['Prismatic Crystal', 'RARE', 410, 2_600],
  ['Riverfin Snapper', 'COMMON', 5.6, 140_000],
  ['Deepwater Eel', 'COMMON', 11, 77_000],
  ['Glowfang Steak', 'COMMON', 7.3, 110_000],
  ['Sunroot Tuber', 'COMMON', 1.8, 610_000],
  ['Frostberry', 'COMMON', 2.9, 380_000],
  ['Alchemical Catalyst', 'UNCOMMON', 72, 15_000],
  ['Elixir Base', 'COMMON', 14, 160_000],
  ['Flux Powder', 'COMMON', 0.9, 1_200_000],
  ['Tempered Ingot', 'UNCOMMON', 95, 9_800],
  ['Voidstone', 'RARE', 1_350, 700],
  ['Ley Crystal', 'UNCOMMON', 120, 6_400],
  ['Runic Ink', 'COMMON', 16, 88_000],
  ['Gilded Parchment', 'COMMON', 6.1, 130_000],
  ['Titan Resin', 'UNCOMMON', 48, 27_000],
  ['Phoenix Ash', 'RARE', 2_900, 260],
];

/** Small deterministic PRNG (mulberry32), so seeds are reproducible. */
function prng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Roughly normal noise (sum of uniforms), mean 0, sd ~1. */
function gaussian(random: () => number): number {
  let sum = 0;
  for (let i = 0; i < 6; i++) sum += random();
  return (sum - 3) / Math.sqrt(0.5);
}

async function main() {
  const force = process.argv.includes('--force');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const existing = await prisma.snapshot.count();
    if (existing > 0 && !force) {
      console.error(
        `Database already has ${existing} snapshots; not seeding. Use --force to add seed data anyway, ` +
          'or wipe first with `npx prisma migrate reset` (in apps/api).',
      );
      process.exitCode = 1;
      return;
    }

    const random = prng(42);
    await prisma.item.createMany({
      data: ITEMS.map(([name, quality], i) => ({ id: FIRST_ITEM_ID + i, name, quality })),
      skipDuplicates: true,
    });

    // Per item: current price (gold), hourly volatility, and a slow drift that flips now and then.
    const state = ITEMS.map(([, , startGold]) => ({
      price: startGold,
      volatility: 0.004 + random() * 0.012,
      drift: (random() - 0.5) * 0.002,
    }));

    const hours = DAYS * 24;
    const lastHour = new Date();
    lastHour.setUTCMinutes(5, 0, 0); // Blizzard-ish: a few minutes past the hour
    let created = 0;

    for (let h = hours - 1; h >= 0; h--) {
      const capturedAt = new Date(lastHour.getTime() - h * 3_600_000);
      // Skip a few hours, like real snapshots that drift or go missing.
      if (random() < 0.03) continue;

      const prices = ITEMS.map(([, , , baseQuantity], i) => {
        const s = state[i];
        if (random() < 0.01) s.drift = (random() - 0.5) * 0.004; // occasional trend change
        const shock = random() < 0.004 ? (random() - 0.4) * 0.5 : 0; // rare spike/crash
        s.price = Math.max(0.01, s.price * (1 + s.drift + s.volatility * gaussian(random) + shock));

        const dailyCycle = 1 + 0.25 * Math.sin(((capturedAt.getUTCHours() - 6) / 24) * 2 * Math.PI);
        const totalQuantity = Math.max(1, Math.round(baseQuantity * dailyCycle * (0.85 + random() * 0.3)));
        const marketPrice = BigInt(Math.round(s.price * COPPER_PER_GOLD));
        const minPrice = (marketPrice * BigInt(970 + Math.floor(random() * 25))) / 1000n;
        return {
          itemId: FIRST_ITEM_ID + i,
          capturedAt,
          minPrice,
          marketPrice,
          totalQuantity,
          listingCount: Math.max(1, Math.round(totalQuantity / (40 + random() * 160))),
        };
      });

      await prisma.snapshot.create({
        data: {
          region: REGION,
          lastModified: capturedAt,
          auctionCount: prices.reduce((sum, p) => sum + p.listingCount, 0),
          prices: { createMany: { data: prices } },
        },
      });
      created++;
    }

    console.log(`Seeded ${ITEMS.length} items and ${created} hourly snapshots (${DAYS} days, region ${REGION}).`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
