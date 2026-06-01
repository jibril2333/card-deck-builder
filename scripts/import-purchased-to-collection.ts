/**
 * One-shot: backfill the collection ledger from `deck_cards.purchased`.
 *
 * Before the collection page existed, "I own N of this card" was tracked
 * per-deck via `deck_cards.purchased`. This script reads those numbers and
 * adds them to `card_collection` so the new page shows what the user
 * already has.
 *
 * Per-card aggregation across decks: a card can appear in N decks with
 * different `purchased` values. We assume the user has ONE physical copy
 * shared across decks (not N independent copies), so we take MAX. Tweak with
 * `--strategy sum` if you'd rather add them up.
 *
 * Variant: `deck_cards` doesn't track alt-art, so everything imported lands
 * on variant="" (base art). Add parallel rows manually on the collection
 * page if you want to split them.
 *
 * Existing collection entries: we merge with `max(existing, imported)` so
 * running this twice is idempotent and your hand-entered numbers aren't
 * overwritten downward.
 *
 *   # See what would happen first:
 *   npx tsx scripts/import-purchased-to-collection.ts --email me@example.com --dry-run
 *
 *   # Commit:
 *   npx tsx scripts/import-purchased-to-collection.ts --email me@example.com
 *
 *   # Sum instead of max:
 *   npx tsx scripts/import-purchased-to-collection.ts --email me@example.com --strategy sum
 */

import Database from "better-sqlite3";
import { GAMES, type GameId } from "../src/lib/games";
import { findUserByEmail } from "../src/lib/auth/repo";

type Strategy = "max" | "sum";

function parseArgs() {
  const args = process.argv.slice(2);
  function pickValue(flag: string): string | null {
    for (let i = 0; i < args.length; i++) {
      if (args[i] === flag && i + 1 < args.length) return args[i + 1];
      if (args[i].startsWith(`${flag}=`)) return args[i].slice(flag.length + 1);
    }
    return null;
  }
  const email = pickValue("--email");
  const strategyRaw = pickValue("--strategy") ?? "max";
  if (strategyRaw !== "max" && strategyRaw !== "sum") {
    console.error(`bad --strategy "${strategyRaw}" (expected max | sum)`);
    process.exit(2);
  }
  const dryRun = args.includes("--dry-run");
  if (!email) {
    console.error(
      "usage: import-purchased-to-collection --email <user-email> " +
        "[--strategy max|sum] [--dry-run]",
    );
    process.exit(2);
  }
  return { email, strategy: strategyRaw as Strategy, dryRun };
}

async function main() {
  const { email, strategy, dryRun } = parseArgs();
  const user = await findUserByEmail(email);
  if (!user) {
    console.error(`No user found for email ${email}.`);
    process.exit(1);
  }
  console.log(`User: ${user.email} (${user.display_name}) id=${user.id}`);
  console.log(`Strategy: ${strategy}${dryRun ? " (dry-run)" : ""}\n`);

  for (const game of Object.keys(GAMES) as GameId[]) {
    const userDbPath = GAMES[game].userDbPath;
    console.log(`[${game}] user.db = ${userDbPath}`);
    const db = new Database(userDbPath);
    try {
      // Aggregate purchased per card across this user's own decks.
      const agg = strategy === "max" ? "MAX(dc.purchased)" : "SUM(dc.purchased)";
      const rows = db
        .prepare(
          `SELECT dc.card_id, ${agg} AS imported_qty
           FROM deck_cards dc
           JOIN decks d ON d.id = dc.deck_id
           WHERE d.user_id = ? AND dc.purchased > 0
           GROUP BY dc.card_id`,
        )
        .all(user.id) as { card_id: string; imported_qty: number }[];

      console.log(`  candidate cards (purchased > 0): ${rows.length}`);

      let inserted = 0;
      let bumped = 0;
      let unchanged = 0;
      const tx = db.transaction(() => {
        const getStmt = db.prepare(
          `SELECT quantity FROM card_collection
           WHERE user_id = ? AND card_id = ? AND variant = ''`,
        );
        const upsertStmt = db.prepare(
          `INSERT INTO card_collection (user_id, card_id, variant, quantity)
             VALUES (?, ?, '', ?)
           ON CONFLICT(user_id, card_id, variant) DO UPDATE SET
             quantity = excluded.quantity,
             updated_at = CURRENT_TIMESTAMP`,
        );
        for (const r of rows) {
          const existing =
            (getStmt.get(user.id, r.card_id) as
              | { quantity: number }
              | undefined)?.quantity ?? 0;
          const next = Math.max(existing, r.imported_qty);
          if (next === existing) {
            unchanged++;
            continue;
          }
          if (existing === 0) inserted++;
          else bumped++;
          if (!dryRun) upsertStmt.run(user.id, r.card_id, next);
        }
      });
      tx();

      console.log(`  ${dryRun ? "would insert" : "inserted"}: ${inserted}`);
      console.log(`  ${dryRun ? "would bump" : "bumped"}: ${bumped}`);
      console.log(`  unchanged (existing ≥ imported): ${unchanged}`);
    } finally {
      db.close();
    }
    console.log();
  }

  if (dryRun) console.log("Dry-run done. Re-run without --dry-run to commit.");
  else console.log("All done. Refresh /collection to see the imported cards.");
}

main().catch((err) => {
  console.error("ERROR:", (err as Error).message);
  process.exit(1);
});
