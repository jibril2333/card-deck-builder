/**
 * One-shot script: claim all `user_id IS NULL` rows (decks / card_prices)
 * across both game user.dbs and assign them to the given email's user.
 *
 * Context: rows created before the multi-user migration (#8) all have a
 * NULL user_id. After auth was added, those rows are visible to everyone
 * but writable by no-one — they're "orphans". Run this once per fresh
 * deploy so the original owner reclaims their existing decks.
 *
 * Bonus: also mirror the user record into the UA user.db. Auth lives in
 * the digimon user.db (see auth/repo.ts → authDb()), but the UA decks
 * page does `LEFT JOIN user.users` against its own user.db to display the
 * deck owner's display name. Without a matching user row over there, your
 * own UA decks would render with a blank owner badge.
 *
 *   # Inspect what would be claimed (no writes):
 *   npx tsx scripts/claim-orphan-decks.ts --email me@example.com --dry-run
 *
 *   # Actually claim:
 *   npx tsx scripts/claim-orphan-decks.ts --email me@example.com
 */

import Database from "better-sqlite3";
import { GAMES, type GameId } from "../src/lib/games";
import { findUserByEmail } from "../src/lib/auth/repo";

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
  const dryRun = args.includes("--dry-run");
  if (!email) {
    console.error(
      "usage: claim-orphan-decks --email <user-email> [--dry-run]",
    );
    process.exit(2);
  }
  return { email, dryRun };
}

function countOrphans(
  db: Database.Database,
  table: string,
): number {
  return (
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id IS NULL`).get() as {
      n: number;
    }).n
  );
}

function mirrorUserRow(
  userDb: Database.Database,
  user: { id: string; email: string; display_name: string },
): "inserted" | "updated" | "noop" {
  // Make sure the `users` table exists (migration #7 should already have run
  // via the app's connection layer, but the UA user.db may have been opened
  // only by this script before any app request — in which case the schema
  // is fresh from the seed but lacking auth tables).
  userDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const existing = userDb
    .prepare(`SELECT id, display_name FROM users WHERE id = ?`)
    .get(user.id) as { id: string; display_name: string } | undefined;
  if (!existing) {
    userDb
      .prepare(
        `INSERT INTO users (id, email, password_hash, display_name)
         VALUES (?, ?, '__mirror_no_password__', ?)`,
      )
      .run(user.id, user.email, user.display_name);
    return "inserted";
  }
  if (existing.display_name !== user.display_name) {
    userDb
      .prepare(`UPDATE users SET display_name = ? WHERE id = ?`)
      .run(user.display_name, user.id);
    return "updated";
  }
  return "noop";
}

async function main() {
  const { email, dryRun } = parseArgs();

  const user = await findUserByEmail(email);
  if (!user) {
    console.error(`No user found for email ${email}.`);
    console.error(`Did you register first? Try /register with an invite code.`);
    process.exit(1);
  }
  console.log(`User: ${user.email} (${user.display_name}) id=${user.id}`);
  console.log(dryRun ? "Mode: dry-run (no writes)\n" : "Mode: write\n");

  for (const game of Object.keys(GAMES) as GameId[]) {
    const userDbPath = GAMES[game].userDbPath;
    console.log(`[${game}] user.db = ${userDbPath}`);
    const db = new Database(userDbPath);
    try {
      const orphanDecks = countOrphans(db, "decks");
      const orphanPrices = countOrphans(db, "card_prices");
      console.log(`  orphan decks: ${orphanDecks}`);
      console.log(`  orphan card_prices: ${orphanPrices}`);

      if (!dryRun) {
        const tx = db.transaction(() => {
          db.prepare(
            `UPDATE decks SET user_id = ? WHERE user_id IS NULL`,
          ).run(user.id);
          db.prepare(
            `UPDATE card_prices SET user_id = ? WHERE user_id IS NULL`,
          ).run(user.id);
          // Mirror the user identity so the LEFT JOIN in listDecksWithCover
          // can pick up display_name when rendering this game's decks list.
          mirrorUserRow(db, user);
        });
        tx();
        console.log(`  ✓ claimed.`);
      }
    } finally {
      db.close();
    }
    console.log();
  }

  if (dryRun) console.log("Dry-run done. Re-run without --dry-run to commit.");
  else console.log("All done. Refresh the browser to see your decks.");
}

main().catch((err) => {
  console.error("ERROR:", (err as Error).message);
  process.exit(1);
});
