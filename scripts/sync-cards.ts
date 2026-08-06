/**
 * Discover and import cards we don't have yet.
 *
 * Every other card scraper needs to be TOLD which set to fetch
 * (`--set=EX12`), which means a new set only lands in the app once someone
 * notices it exists — BT26 had been out for a while with zero cards in the DB
 * before this script was written. This one asks digimoncard.io for its whole
 * catalogue (an empty `n=` query returns all ~9.7k rows in a single response —
 * no cap, no pagination), diffs it against `cards`, and reports/imports
 * whatever is new. Run it on a schedule and new sets import themselves.
 *
 * Two safety properties matter here:
 *
 *   - NEVER DELETES. Cards missing from the API are never removed. Our TOKEN
 *     cards (BT22-TOKEN, TOKEN01, …) don't exist upstream at all, and a
 *     transient API hiccup returning a short list must never wipe the DB.
 *   - WHITELISTED. The API also serves the 1999-era Bandai card games (BO-,
 *     DD-, DV-, MD-, MO-, DM-, bare `ST-`); `MODERN_CODE` keeps them out.
 *
 * It also RE-READS the cards no official source covers. This used to be
 * insert-only in the stronger sense that an existing row was never touched
 * again, which quietly froze every field at whatever the very first import
 * saw — upstream could correct a card and we would never find out. That is
 * only safe to undo for cards nothing else can speak for: this feed is a
 * wiki-derived mirror and is measurably WORSE than the official sites on the
 * fields they both carry (it lowercases every rarity, drops "ACE" off names,
 * and points image_url at its own scans), so re-reading a card the official
 * scrapers also touch would trade one stale value for a fresh wrong one.
 *
 * "No official source covers it" = no `ja` row in card_translations, i.e.
 * digimoncard.com has never returned this card. 77 of 4370 today, all of them
 * originally imported from here anyway.
 *
 * Usage:
 *   npx tsx scripts/sync-cards.ts --dry-run   # report only (default: report+import)
 *   npx tsx scripts/sync-cards.ts
 *   CDB_DATA_DIR=/tmp/copy npx tsx scripts/sync-cards.ts
 */

import Database from "better-sqlite3";
import path from "node:path";
import {
  fetchCatalogue,
  toCardRow,
  MODERN_CODE,
  UPSERT_CARD_SQL,
  setOf,
  type ApiCard,
} from "../src/lib/scraper/digimoncardio";

// Honour CDB_DATA_DIR so a run can target a COPY of the DB while the prod
// container keeps serving the real one (host writes to the bind-mounted DB
// corrupt the container's view — see AGENTS.md).
const DB_PATH = path.join(
  process.env.CDB_DATA_DIR ?? path.join(process.cwd(), "data.nosync"),
  "digimon.db",
);

/**
 * If the API ever returns a short list (outage, upstream regression), importing
 * it is harmless — we only insert — but the *report* would be misleading and a
 * scheduled run would look like it succeeded. Bail loudly instead.
 */
const MIN_EXPECTED_ROWS = 5000;

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log("[sync] fetching full catalogue from digimoncard.io …");
  const all = await fetchCatalogue();
  console.log(`[sync] ${all.length} rows`);
  if (all.length < MIN_EXPECTED_ROWS) {
    throw new Error(
      `only ${all.length} rows (expected ≥${MIN_EXPECTED_ROWS}) — refusing to ` +
        `treat a partial catalogue as authoritative`,
    );
  }

  // Rows repeat per printing with identical values; collapse by id.
  const byCode = new Map<string, ApiCard>();
  for (const c of all) {
    const id = c?.id;
    if (id && MODERN_CODE.test(id)) byCode.set(id, c);
  }
  console.log(
    `[sync] ${byCode.size} distinct modern-DCG codes ` +
      `(${new Set(all.map((c) => c?.id).filter(Boolean)).size - byCode.size} legacy/other filtered out)`,
  );

  const db = new Database(DB_PATH);
  try {
    const local = new Set(
      (db.prepare("SELECT code FROM cards").all() as { code: string }[]).map(
        (r) => r.code,
      ),
    );

    // Upstream occasionally lists the same card twice under differently
    // zero-padded numbers — `RB1-10` and `RB1-010` are both Siriusmon. Only
    // one of them matches how the rest of that set is numbered, so importing
    // the odd one out would put a duplicate card in the browser. Compare on a
    // padding-insensitive key and drop anything that collides with a card we
    // already have.
    const canonical = (code: string) =>
      code.replace(/-(\d+)$/, (_, n: string) => `-${parseInt(n, 10)}`);
    const localByCanonical = new Map(
      [...local].map((c) => [canonical(c), c] as const),
    );

    const candidates = [...byCode.keys()].filter((c) => !local.has(c)).sort();
    const dupes = candidates.filter((c) => localByCanonical.has(canonical(c)));
    const newCodes = candidates.filter(
      (c) => !localByCanonical.has(canonical(c)),
    );

    // Informational only — we never act on it. Tokens and pulled products
    // legitimately live here.
    const onlyLocal = [...local].filter(
      (c) => MODERN_CODE.test(c) && !byCode.has(c),
    );

    // Cards no official site has ever returned, so this feed is the only thing
    // that can correct them — see the header. Everything else is left to the
    // official scrapers, which run after this one and overwrite what they own.
    const uncovered = (
      db
        .prepare(
          `SELECT code FROM cards c
            WHERE NOT EXISTS (SELECT 1 FROM card_translations t
                              WHERE t.code = c.code AND t.lang = 'ja')`,
        )
        .all() as { code: string }[]
    )
      .map((r) => r.code)
      .filter((c) => byCode.has(c))
      .sort();

    if (newCodes.length === 0) {
      console.log("[sync] up to date — no new cards.");
    } else {
      const bySet = new Map<string, string[]>();
      for (const c of newCodes) {
        const s = setOf(c);
        bySet.set(s, [...(bySet.get(s) ?? []), c]);
      }
      console.log(`\n[sync] ${newCodes.length} new card(s):`);
      for (const [s, codes] of [...bySet].sort((a, b) => b[1].length - a[1].length)) {
        const sample = codes
          .slice(0, 3)
          .map((c) => `${c} ${byCode.get(c)!.name}`)
          .join(", ");
        console.log(`   ${s.padEnd(6)} ${String(codes.length).padStart(4)}  ${sample}${codes.length > 3 ? " …" : ""}`);
      }
    }
    if (dupes.length) {
      console.log(
        `\n[sync] skipped ${dupes.length} re-numbered duplicate(s) of cards we ` +
          `already have: ` +
          dupes
            .map((c) => `${c} (already have ${localByCanonical.get(canonical(c))})`)
            .join(", "),
      );
    }
    if (onlyLocal.length) {
      console.log(
        `\n[sync] ${onlyLocal.length} local code(s) absent upstream (kept, never deleted): ` +
          onlyLocal.slice(0, 8).join(" ") +
          (onlyLocal.length > 8 ? " …" : ""),
      );
    }

    if (uncovered.length) {
      console.log(
        `\n[sync] re-reading ${uncovered.length} card(s) no official source ` +
          `covers: ` +
          uncovered.slice(0, 8).join(" ") +
          (uncovered.length > 8 ? " …" : ""),
      );
    }

    if (dryRun) {
      console.log("\n[sync] dry-run — no DB writes.");
      return;
    }
    if (newCodes.length === 0 && uncovered.length === 0) return;

    const ins = db.prepare(UPSERT_CARD_SQL);
    const tx = db.transaction((codes: string[]) => {
      for (const c of codes) ins.run(toCardRow(byCode.get(c)!));
    });
    tx([...newCodes, ...uncovered]);
    console.log(
      `\n[sync] ✓ imported ${newCodes.length} card(s), ` +
        `refreshed ${uncovered.length}.`,
    );
    console.log(
      "[sync] note: text/art/prices for these are NOT fetched here — run the " +
        "translation, alt-art and price scrapers next.",
    );
  } finally {
    db.close();
  }
}

main().catch((e) => {
  console.error("[sync] ERROR:", (e as Error).message);
  process.exit(1);
});
