/**
 * Find cards present on the official Digimon CDN but missing from our DB,
 * and insert minimal rows (code + image_url only).
 *
 * Strategy:
 *  - For each "set prefix" in the DB (BT1..BT25, EX1.., ST1.., etc.), probe
 *    codes from -001 to -120. If the image exists and the code is not in our
 *    DB, insert a minimal cards row.
 *  - Also runs the alt-art probe (_P1.._P5) for newly added codes inline.
 *
 * Run with:
 *   npx tsx scripts/fill-missing-digimon-cards.ts
 */

import Database from "better-sqlite3";
import path from "node:path";

const DB_PATH = path.join(
  process.cwd(),
  "data",
  "digimon.db",
);
const BASE = "https://world.digimoncard.com/images/cardlist/card";
const CONCURRENCY = 16;
const MAX_NUM = 130; // probe -001 to -130 per set prefix
const MAX_PARALLEL = 5;
const UA = "card-deck-builder/0.1 (fill-missing)";

async function head(url: string, timeoutMs = 8000): Promise<number> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      method: "HEAD",
      headers: { "user-agent": UA },
      signal: ac.signal,
    });
    return r.status;
  } catch {
    return 0;
  } finally {
    clearTimeout(t);
  }
}

async function pool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await worker(items[i], i);
        done++;
        onProgress?.(done, items.length);
      }
    }),
  );
  return results;
}

function pad3(n: number) {
  return String(n).padStart(3, "0");
}

async function main() {
  const db = new Database(DB_PATH);

  // Ensure card_images table exists (mirrors the migration in connection.ts)
  db.exec(`
    CREATE TABLE IF NOT EXISTS card_images (
      code TEXT NOT NULL,
      variant TEXT NOT NULL,
      image_url TEXT NOT NULL,
      checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (code, variant)
    )
  `);

  // Discover set prefixes present in the DB
  const prefixes = (
    db
      .prepare(
        `SELECT DISTINCT substr(code, 1, instr(code, '-') - 1) AS pfx
         FROM cards WHERE code LIKE '%-%' ORDER BY pfx`,
      )
      .all() as { pfx: string }[]
  )
    .map((r) => r.pfx)
    .filter(Boolean);
  console.log(`Found ${prefixes.length} set prefixes in DB:`, prefixes.join(", "));

  // Existing codes set
  const existing = new Set(
    (
      db.prepare("SELECT code FROM cards").all() as { code: string }[]
    ).map((r) => r.code),
  );
  console.log(`DB currently has ${existing.size} cards.`);

  // Candidates: every prefix × every number 1..MAX_NUM
  type Candidate = { code: string };
  const candidates: Candidate[] = [];
  for (const pfx of prefixes) {
    for (let i = 1; i <= MAX_NUM; i++) {
      candidates.push({ code: `${pfx}-${pad3(i)}` });
    }
  }
  // Filter to only codes NOT in our DB (no point probing those we have)
  const toProbe = candidates.filter((c) => !existing.has(c.code));
  console.log(
    `Will probe ${toProbe.length} candidate codes ` +
    `(skipping ${candidates.length - toProbe.length} already in DB).`,
  );

  const insertCard = db.prepare(
    `INSERT INTO cards (id, code, name, card_type, color, image_url, set_names)
     VALUES (?, ?, '', '', NULL, ?, '')
     ON CONFLICT(id) DO NOTHING`,
  );
  const insertImage = db.prepare(
    `INSERT INTO card_images (code, variant, image_url) VALUES (?, ?, ?)
     ON CONFLICT(code, variant) DO UPDATE SET
       image_url = excluded.image_url, checked_at = CURRENT_TIMESTAMP`,
  );

  let cardsAdded = 0;
  let imagesAdded = 0;
  const startedAt = Date.now();

  await pool(toProbe, CONCURRENCY, async ({ code }) => {
    const baseUrl = `${BASE}/${code}.png`;
    const status = await head(baseUrl);
    if (status !== 200) return null;

    // Found a card not in DB. Insert minimal row + base image variant.
    const tx = db.transaction(() => {
      insertCard.run(code, code, baseUrl);
      insertImage.run(code, "", baseUrl);
    });
    tx();
    cardsAdded++;
    imagesAdded++;

    // Probe alt arts for this new code
    for (let i = 1; i <= MAX_PARALLEL; i++) {
      const v = `_P${i}`;
      const u = `${BASE}/${code}${v}.png`;
      const s = await head(u);
      if (s !== 200) break;
      insertImage.run(code, v, u);
      imagesAdded++;
    }
    return code;
  }, (done, total) => {
    if (done % 200 === 0 || done === total) {
      const elapsed = Date.now() - startedAt;
      const rate = done / (elapsed / 1000);
      process.stdout.write(
        `\r  ${done}/${total} (${((done / total) * 100).toFixed(1)}%) ` +
        `· ${rate.toFixed(1)} req/s · added cards=${cardsAdded} images=${imagesAdded}    `,
      );
    }
  });

  process.stdout.write("\n");
  const elapsed = (Date.now() - startedAt) / 1000;
  console.log(`Done in ${elapsed.toFixed(0)}s.`);
  console.log(`  cards added: ${cardsAdded}`);
  console.log(`  images added (base + alt arts): ${imagesAdded}`);

  // Show what we added per set
  const breakdown = db
    .prepare(
      `SELECT substr(code, 1, instr(code, '-') - 1) as pfx, COUNT(*) as n
       FROM cards WHERE name = '' GROUP BY pfx ORDER BY pfx`,
    )
    .all() as { pfx: string; n: number }[];
  if (breakdown.length) {
    console.log("\nMinimal rows per set (code + image only):");
    for (const b of breakdown) console.log(`  ${b.pfx}: ${b.n}`);
  }

  db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
