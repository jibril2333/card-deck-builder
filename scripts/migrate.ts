/**
 * Apply pending schema migrations to a cards DB, outside the Next.js app.
 *
 * Why it exists: the app runs migrations on startup (src/lib/db/connection.ts),
 * but the refresh used to scrape into a COPY of the DB, and the
 * scrapers open that copy directly with better-sqlite3 — they never go through
 * the app, so nothing migrates it. That was fine while every new column
 * happened to reach production before the next refresh; it stops being fine
 * the moment a refresh runs first, and the scraper dies on "no such column".
 * Running this right after the snapshot makes the ordering explicit.
 *
 * Honours CDB_DATA_DIR like the scrapers do, so it migrates whichever copy
 * they are about to write.
 *
 *   npx tsx scripts/migrate.ts
 */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { runMigrations, TARGET_SCHEMA_VERSION } from "../src/lib/db/migrations";

const DATA_DIR =
  process.env.CDB_DATA_DIR ?? path.join(process.cwd(), "data.nosync");
const DB_PATH = path.join(DATA_DIR, "digimon.db");
const USER_DB_PATH = path.join(DATA_DIR, "digimon-user.db");

if (!fs.existsSync(DB_PATH)) {
  console.error(`[migrate] no such DB: ${DB_PATH}`);
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
// Several migrations touch user-owned tables (decks, deck_adjustments), which
// only exist under the `user` schema. ATTACH creates the file if it's missing.
db.exec(`ATTACH DATABASE '${USER_DB_PATH.replace(/'/g, "''")}' AS user`);

const before = (db.pragma("user_version", { simple: true }) as number) ?? 0;
runMigrations(db);
const after = db.pragma("user_version", { simple: true }) as number;

db.pragma("wal_checkpoint(TRUNCATE)");
db.close();

console.log(
  `[migrate] ${DB_PATH}: schema ${before} → ${after} (target ${TARGET_SCHEMA_VERSION})`,
);
if (after !== TARGET_SCHEMA_VERSION) {
  console.error("[migrate] schema did not reach the target version");
  process.exit(1);
}
