import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { seedDigimonDb } from "./e2e/fixtures/seed";

/**
 * The price scraper skips cards it priced recently.
 *
 * Not an optimisation — it's what makes a full pass survivable. Pricing every
 * card is ~4400 requests at 700ms apiece, over an hour, and anything that
 * restarts the process inside that window throws the whole hour away and
 * starts from the first card again. That is exactly what happened on the NAS:
 * three consecutive runs died mid-stage because a deploy recreated the
 * container, and the log shows them starting and simply stopping.
 *
 * With a freshness window the next run continues from what's left, so an
 * interrupted run costs the tail rather than the whole thing.
 *
 * Every card here is seeded as freshly priced, so a correct run makes NO
 * network requests at all — which is also what keeps this test offline.
 */
const ROOT = process.cwd();
let dir: string;

function priceEverything(dbPath: string, ageHours: number) {
  const db = new Database(dbPath);
  // Both tables the scraper writes (migrations 10 and 12). The fixture stops
  // at the pre-migration schema and the scraper opens the file directly, so
  // nothing else creates them here.
  db.exec(`
    CREATE TABLE IF NOT EXISTS external_listings (
      source TEXT NOT NULL, card_id TEXT NOT NULL, variant_type TEXT NOT NULL,
      illustrator TEXT NOT NULL, price_yen INTEGER NOT NULL,
      in_stock INTEGER NOT NULL DEFAULT 1,
      fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (source, card_id, variant_type, illustrator)
    );
    CREATE TABLE IF NOT EXISTS external_prices (
      source TEXT NOT NULL, card_id TEXT NOT NULL, variant_type TEXT NOT NULL,
      price_yen INTEGER NOT NULL, in_stock INTEGER NOT NULL DEFAULT 1,
      fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (source, card_id, variant_type)
    )`);
  const ins = db.prepare(
    `INSERT OR REPLACE INTO external_prices
       (source, card_id, variant_type, price_yen, fetched_at)
     VALUES ('cardrush', ?, 'base', 100, datetime('now', ?))`,
  );
  const cards = db.prepare(`SELECT id FROM cards`).all() as { id: string }[];
  for (const c of cards) ins.run(c.id, `-${ageHours} hours`);
  db.close();
  return cards.length;
}

async function run(args: string[]): Promise<string> {
  const { stdout } = await promisify(execFile)(
    "npx",
    ["tsx", "scripts/scrape-cardrush-prices.ts", ...args],
    { cwd: ROOT, encoding: "utf8", env: { ...process.env, CDB_DATA_DIR: dir } },
  );
  return stdout;
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cdb-price-"));
  seedDigimonDb(path.join(dir, "digimon.db"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("price freshness window", () => {
  it("skips everything priced in the last few hours", async () => {
    const n = priceEverything(path.join(dir, "digimon.db"), 1);
    const out = await run([]);
    expect(out).toContain(`Skipping ${n} card(s)`);
    expect(out).toContain("Scope: 0 code(s)");
  }, 120_000);

  it("re-checks a price that has gone stale", async () => {
    // Older than the default 72h window.
    priceEverything(path.join(dir, "digimon.db"), 100);
    const out = await run(["--only=BT1-084"]);
    // --only is an explicit request for one card and bypasses the window.
    expect(out).toContain("Scope: 1 code(s)");
  }, 120_000);

  it("--force re-checks everything", async () => {
    const n = priceEverything(path.join(dir, "digimon.db"), 1);
    const out = await run(["--force", "--dry-run"]);
    expect(out).not.toContain("Skipping");
    expect(out).toContain(`Scope: ${n} code(s)`);
  }, 180_000);
});
