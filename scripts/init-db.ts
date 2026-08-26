/**
 * Create a working database from nothing.
 *
 *   npx tsx scripts/init-db.ts            # into ./data.nosync
 *   CDB_DATA_DIR=/mnt/tank/cdb npx tsx scripts/init-db.ts
 *
 * Until this existed there was no such thing as a fresh install of this
 * project: `data.nosync/` is gitignored (it holds accounts and decks), and the
 * migration chain starts with catch-up steps that ALTER tables a 2024-era
 * database already had — so cloning the repo and starting the app got you
 * "数据库文件不存在", and running the migrator by hand got you
 * "no such table: decks". The card data was reachable (every scraper is in
 * this repo) but nothing could hold it.
 *
 * What this does: writes the base schema (see db/base-schema.ts), stamps it at
 * the version those catch-up migrations end on, then runs every migration
 * after that — the same runner the app uses on startup, so a fresh database
 * and a four-year-old one converge on exactly the same schema.
 *
 * It does NOT fetch any card data; that's the refresh daemon, and the
 * closing message says so. Two separate concerns, and one of them takes 20
 * minutes of somebody else's bandwidth.
 *
 * Refuses to touch a database that already exists — this is a bootstrap, not a
 * reset. Deleting is a decision for a human with a backup.
 */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import {
  BASE_SCHEMA_VERSION,
  CARDS_BASE_DDL,
  USER_BASE_DDL,
} from "../src/lib/db/base-schema";
import { runMigrations, TARGET_SCHEMA_VERSION } from "../src/lib/db/migrations";

const DATA_DIR =
  process.env.CDB_DATA_DIR ?? path.join(process.cwd(), "data.nosync");
const DB_PATH = path.join(DATA_DIR, "digimon.db");
const USER_DB_PATH = path.join(DATA_DIR, "digimon-user.db");

function main() {
  const existing = [DB_PATH, USER_DB_PATH].filter((p) => fs.existsSync(p));
  if (existing.length > 0) {
    console.error(
      `[init-db] already there:\n  ${existing.join("\n  ")}\n` +
        `[init-db] refusing to touch an existing database. ` +
        `To start over, move those files aside yourself.`,
    );
    process.exit(1);
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log(`[init-db] data dir: ${DATA_DIR}`);

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  // ATTACH creates the user file. Both halves are built in one connection
  // because that's how the app and the migrator see them — migrations that
  // touch `user.decks` need the schema attached, not a second process.
  db.exec(`ATTACH DATABASE '${USER_DB_PATH.replace(/'/g, "''")}' AS user`);

  db.exec(CARDS_BASE_DDL);
  db.exec(
    USER_BASE_DDL.replace(
      /CREATE (TABLE|INDEX) IF NOT EXISTS /g,
      "CREATE $1 IF NOT EXISTS user.",
    ),
  );
  db.pragma(`user_version = ${BASE_SCHEMA_VERSION}`);
  console.log(`[init-db] base schema written (version ${BASE_SCHEMA_VERSION})`);

  runMigrations(db);
  const now = db.pragma("user_version", { simple: true }) as number;
  if (now !== TARGET_SCHEMA_VERSION) {
    console.error(
      `[init-db] migrations stopped at ${now}, expected ${TARGET_SCHEMA_VERSION}`,
    );
    process.exit(1);
  }
  const tables = (
    db
      .prepare(
        `SELECT COUNT(*) n FROM (
           SELECT name FROM main.sqlite_master WHERE type='table'
           UNION ALL
           SELECT name FROM user.sqlite_master WHERE type='table')`,
      )
      .get() as { n: number }
  ).n;
  db.close();

  console.log(`[init-db] migrated to ${now} · ${tables} tables`);
  console.log(
    `\n下一步 — 把卡表拉下来(这一步会访问官方站点,约 20 分钟,不含价格):\n` +
      `  node scripts-dist/refresh-daemon.js --once cards sets text art keywords rulings restrictions\n` +
      `价格另跑(约 1 小时):\n` +
      `  node scripts-dist/refresh-daemon.js --once prices\n`,
  );
}

main();
