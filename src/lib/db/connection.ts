import fs from "node:fs";
import Database from "better-sqlite3";
import { GAMES, type GameId } from "@/lib/games";
import { runMigrations } from "./migrations";
import { maybeDailyBackup } from "./backup";

// Cache connections across HMR reloads in dev.
type DBCache = { [K in GameId]?: Database.Database };
const globalForDB = globalThis as unknown as { __dbCache?: DBCache };
const cache: DBCache = (globalForDB.__dbCache ??= {});

const ENV_VAR_NAME: Record<GameId, string> = {
  digimon: "CDB_DIGIMON_DB",
  unionarena: "CDB_UA_DB",
};

export function getDB(game: GameId): Database.Database {
  let db = cache[game];
  if (!db) {
    const dbPath = GAMES[game].dbPath;
    if (!fs.existsSync(dbPath)) {
      throw new Error(
        `数据库文件不存在: ${dbPath}\n` +
          `请检查 ${ENV_VAR_NAME[game]} 环境变量(在项目根目录的 .env.local 里设置),` +
          `或确认默认路径下的 .db 文件存在。`,
      );
    }
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    // Attach the per-user data file; ATTACH auto-creates it if missing.
    // After this point queries reference user-owned tables as `user.decks` etc.
    const userPath = GAMES[game].userDbPath;
    const escaped = userPath.replace(/'/g, "''");
    db.exec(`ATTACH DATABASE '${escaped}' AS user`);
    runMigrations(db);
    cache[game] = db;
  }
  return db;
}

/**
 * Snapshot the user DB if today's backup doesn't exist yet. Call at the top of
 * every mutating Server Action. The check is O(1) after the first call of the
 * day. We only back up user.db — cards/cards_images are scraper output and
 * fully regenerable.
 */
export function backupBeforeWrite(game: GameId): void {
  getDB(game); // ensures migrations have run so user.db is populated
  maybeDailyBackup(GAMES[game].userDbPath);
}
