/**
 * Restore decks / deck_cards / card_prices from a backup into the current
 * `user.db`. Handles both backup formats:
 *
 *   - Pre-split backup (a *.pre-split.db, or any daily backup created before
 *     the #3 user-data split): a full single-file DB that contains `cards`,
 *     `card_images`, `decks`, `deck_cards`, `card_prices`. We extract only the
 *     three user tables and ignore the rest.
 *
 *   - Post-split backup (any daily backup created after the split): a smaller
 *     DB with only the three user tables. Already in the right shape.
 *
 * Defaults are safe: refuses to write if the destination user.db has any
 * decks rows. Use --force to overwrite, --merge to INSERT-OR-IGNORE existing
 * rows on conflict, or --dry-run to just report.
 *
 *   npx tsx scripts/restore-user-db.ts \
 *     --source ~/Desktop/workspace/digimon-deck-builder/data/digimon.pre-split.db \
 *     --game digimon
 *
 * The current user.db path comes from `GAMES[game].userDbPath` so we honor
 * any CDB_*_USER_DB env override.
 */

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { GAMES, type GameId, isGameId } from "../src/lib/games";

type Mode = "safe" | "force" | "merge";

const USER_TABLES = ["decks", "deck_cards", "card_prices"] as const;

function parseArgs() {
  const args = process.argv.slice(2);
  // Accept both `--flag=value` and `--flag value` forms.
  function pickValue(flag: string): string | null {
    for (let i = 0; i < args.length; i++) {
      if (args[i] === flag && i + 1 < args.length) return args[i + 1];
      if (args[i].startsWith(`${flag}=`)) return args[i].slice(flag.length + 1);
    }
    return null;
  }
  const source = pickValue("--source");
  const gameArg = pickValue("--game");
  const dryRun = args.includes("--dry-run");
  let mode: Mode = "safe";
  if (args.includes("--force")) mode = "force";
  if (args.includes("--merge")) mode = "merge";

  if (!source || !gameArg) {
    console.error(
      "usage: restore-user-db --source <backup.db> --game <digimon|unionarena> " +
        "[--force | --merge] [--dry-run]",
    );
    process.exit(2);
  }
  if (!isGameId(gameArg)) {
    console.error(`bad --game value "${gameArg}" (expected digimon | unionarena)`);
    process.exit(2);
  }
  if (!fs.existsSync(source)) {
    console.error(`source backup not found: ${source}`);
    process.exit(2);
  }
  return { source, game: gameArg as GameId, mode, dryRun };
}

function listTables(db: Database.Database): Set<string> {
  return new Set(
    (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
        name: string;
      }[]
    ).map((r) => r.name),
  );
}

function rowCount(db: Database.Database, table: string): number {
  return (
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
  );
}

function ensureUserSchema(dest: Database.Database) {
  // Re-create the three user tables if missing. The CREATE statements mirror
  // what migrations.ts produces. We keep this in sync by hand because pulling
  // in the migration module would also pull in its `import Database` cycle.
  dest.exec(`
    CREATE TABLE IF NOT EXISTS decks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      notes TEXT,
      accent_color TEXT NOT NULL DEFAULT '#f59e0b',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      cover_card_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS deck_cards (
      deck_id TEXT NOT NULL,
      card_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      purchased INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (deck_id, card_id),
      FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS card_prices (
      card_id TEXT PRIMARY KEY,
      price REAL NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_decks_updated ON decks(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_deck_cards_deck ON deck_cards(deck_id);
  `);
}

function copyTables(
  source: Database.Database,
  dest: Database.Database,
  mode: Mode,
  dryRun: boolean,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const table of USER_TABLES) {
    const sourceCount = rowCount(source, table);
    if (dryRun) {
      result[table] = sourceCount;
      continue;
    }
    const conflictClause = mode === "merge" ? "OR IGNORE" : "OR REPLACE";
    const rows = source.prepare(`SELECT * FROM ${table}`).all() as Record<
      string,
      unknown
    >[];
    if (rows.length === 0) {
      result[table] = 0;
      continue;
    }
    const cols = Object.keys(rows[0]);
    const placeholders = cols.map((c) => `@${c}`).join(", ");
    const stmt = dest.prepare(
      `INSERT ${conflictClause} INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`,
    );
    const tx = dest.transaction((rs: typeof rows) => {
      let n = 0;
      for (const r of rs) {
        stmt.run(r);
        n++;
      }
      return n;
    });
    result[table] = tx(rows);
  }
  return result;
}

function main() {
  const { source, game, mode, dryRun } = parseArgs();
  const destPath = GAMES[game].userDbPath;
  const sourcePath = path.resolve(source);

  console.log(`Source: ${sourcePath}`);
  console.log(`Dest:   ${destPath} (${game})`);
  console.log(`Mode:   ${mode}${dryRun ? " (dry-run)" : ""}`);

  // Sanity-check the source.
  const src = new Database(sourcePath, { readonly: true });
  try {
    const srcTables = listTables(src);
    const missing = USER_TABLES.filter((t) => !srcTables.has(t));
    if (missing.length === USER_TABLES.length) {
      throw new Error(
        `source has none of the user tables (${USER_TABLES.join(", ")}). ` +
          `Wrong file?`,
      );
    }
    if (missing.length > 0) {
      console.warn(
        `WARN: source missing ${missing.join(", ")}; those tables won't be restored.`,
      );
    }
    const isPreSplit = srcTables.has("cards");
    console.log(
      `Source format: ${isPreSplit ? "pre-split (full DB)" : "post-split (user-only)"}`,
    );
    for (const t of USER_TABLES) {
      if (srcTables.has(t)) {
        console.log(`  ${t}: ${rowCount(src, t)} rows`);
      }
    }

    // Open / create destination.
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const dest = new Database(destPath);
    try {
      ensureUserSchema(dest);
      const existingDecks = rowCount(dest, "decks");
      if (existingDecks > 0 && mode === "safe") {
        throw new Error(
          `destination user.db already has ${existingDecks} decks; ` +
            `refusing to overwrite. Use --force to replace or --merge to keep both.`,
        );
      }
      if (existingDecks > 0) {
        console.log(`Dest has ${existingDecks} existing decks; mode=${mode}`);
      }

      const copied = copyTables(src, dest, mode, dryRun);
      console.log(
        `\n${dryRun ? "Would restore" : "Restored"}:` +
          USER_TABLES.map((t) => `  ${t}: ${copied[t] ?? 0}`).join("\n"),
      );
      if (!dryRun) console.log(`\nDone. Restart the app to pick up new data.`);
    } finally {
      dest.close();
    }
  } finally {
    src.close();
  }
}

try {
  main();
} catch (err) {
  console.error(`\nERROR: ${(err as Error).message}`);
  process.exit(1);
}
