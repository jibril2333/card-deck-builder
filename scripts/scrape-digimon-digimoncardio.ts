/**
 * Pull Digimon card metadata from digimoncard.io's public JSON API.
 *
 * Why this exists: the primary scraper (`scrape-digimon-metadata.ts`) uses the
 * official Bandai EN site (world.digimoncard.com), which doesn't carry sets
 * that are only out in JP/CN yet (e.g. EX-12). digimoncard.io's community DB
 * does have them, with full metadata, so this is the fallback source for those
 * sets. The whole existing card seed originally came from digimoncard.io too,
 * so the field mapping matches what's already in the DB.
 *
 * Usage:
 *   npx tsx scripts/scrape-digimon-digimoncardio.ts --set=EX12
 *   npx tsx scripts/scrape-digimon-digimoncardio.ts --set=EX12 --dry-run
 */

import Database from "better-sqlite3";
import path from "node:path";
import {
  fetchCatalogue,
  toCardRow,
  UPSERT_CARD_SQL,
} from "../src/lib/scraper/digimoncardio";

// CDB_DATA_DIR lets a run target a COPY of the DB while the prod container
// keeps serving the real one (see AGENTS.md).
const DB_PATH = path.join(
  process.env.CDB_DATA_DIR ?? path.join(process.cwd(), "data.nosync"),
  "digimon.db",
);

function arg(flag: string): string | null {
  for (const a of process.argv.slice(2)) {
    if (a === flag) return "";
    if (a.startsWith(`${flag}=`)) return a.slice(flag.length + 1);
  }
  return null;
}

async function main() {
  const set = (arg("--set") || "").toUpperCase().trim();
  const dryRun = process.argv.includes("--dry-run");
  if (!set) {
    console.error("usage: --set=EX12 [--dry-run]");
    process.exit(2);
  }

  console.log(`Fetching ${set} from digimoncard.io …`);
  const all = await fetchCatalogue(set);

  // The `n` search can fuzzy-match; keep only this set's base prints.
  const cards = all.filter((c) => c.id?.startsWith(`${set}-`));
  console.log(`  got ${all.length} rows, ${cards.length} are ${set}-* cards`);
  if (cards.length === 0) {
    console.log("  nothing to write.");
    return;
  }

  const rows = cards.map(toCardRow);

  if (dryRun) {
    for (const r of rows) {
      console.log(
        `  ${r.code.padEnd(10)} ${r.card_type.padEnd(9)} ${r.color.padEnd(7)} ${r.name}`,
      );
    }
    console.log(`  (dry-run, ${rows.length} cards, no DB writes)`);
    return;
  }

  const db = new Database(DB_PATH);
  try {
    const existing = new Set(
      (db.prepare("SELECT code FROM cards").all() as { code: string }[]).map(
        (r) => r.code,
      ),
    );
    const ins = db.prepare(UPSERT_CARD_SQL);
    let inserted = 0;
    let updated = 0;
    const tx = db.transaction((list: typeof rows) => {
      for (const r of list) {
        if (existing.has(r.code)) updated++;
        else inserted++;
        ins.run(r);
      }
    });
    tx(rows);
    console.log(`  ✓ wrote ${rows.length} (inserted=${inserted}, updated=${updated})`);
  } finally {
    db.close();
  }
}

main().catch((e) => {
  console.error("ERROR:", (e as Error).message);
  process.exit(1);
});
