import path from "path";

export type GameId = "digimon" | "unionarena";

type GameInfo = {
  id: GameId;
  label: string;
  short: string;
  emoji: string;
  accent: string;
  /** Reference data (cards, card_images). Override via CDB_DIGIMON_DB / CDB_UA_DB. */
  dbPath: string;
  /** User data (decks, deck_cards, card_prices). Override via CDB_DIGIMON_USER_DB / CDB_UA_USER_DB. */
  userDbPath: string;
};

// Default DB location: ~/Library/Application Support/card-deck-builder.
//
// IMPORTANT: this is deliberately OUTSIDE any cloud-synced folder. The data
// used to live under ~/Desktop/workspace, but macOS "Desktop & Documents"
// iCloud sync is hostile to live SQLite files — it treats the constantly
// changing .db-wal / .db-shm as conflicts and once moved the whole data
// folder into the iCloud Trash, which broke the open connections
// (SQLITE_READONLY_DBMOVED) mid-session. ~/Library is never iCloud-synced,
// so the databases stay put. Override with CDB_*_DB in .env.local if needed.
// Single flat folder holds every database, inside the project at
// ./data.nosync (resolved from the process cwd, which is the repo root for
// both the Next servers and the tsx scripts). The ".nosync" suffix makes
// iCloud skip the folder entirely — the project lives in an iCloud-synced
// directory, and iCloud has both trashed live SQLite folders and evicted
// file contents ("dataless" files) from a plain ./data. Cards DB and user
// DB for each game sit side-by-side, distinguished by a "<game>-" filename
// prefix so the two games' user data can't collide:
//   data.nosync/digimon.db        data.nosync/digimon-user.db
//   data.nosync/unionarena.db     data.nosync/unionarena-user.db
//   data.nosync/backups/<db-name>/<date>.db
//
// `data.nosync/` is gitignored — it holds personal user data and the repo
// is public.
// Override the base with CDB_DATA_DIR, or individual files with CDB_*_DB.
const DATA_BASE =
  process.env.CDB_DATA_DIR ?? path.join(process.cwd(), "data.nosync");
const DEFAULT_DIGIMON_DB = path.join(DATA_BASE, "digimon.db");
const DEFAULT_UA_DB = path.join(DATA_BASE, "unionarena.db");
const DEFAULT_DIGIMON_USER_DB = path.join(DATA_BASE, "digimon-user.db");
const DEFAULT_UA_USER_DB = path.join(DATA_BASE, "unionarena-user.db");

const DIGIMON_DB = process.env.CDB_DIGIMON_DB ?? DEFAULT_DIGIMON_DB;
const UA_DB = process.env.CDB_UA_DB ?? DEFAULT_UA_DB;

export const GAMES: Record<GameId, GameInfo> = {
  digimon: {
    id: "digimon",
    label: "Digimon",
    short: "Digimon Card Game",
    emoji: "🦖",
    accent: "#ef4444",
    dbPath: DIGIMON_DB,
    userDbPath: process.env.CDB_DIGIMON_USER_DB ?? DEFAULT_DIGIMON_USER_DB,
  },
  unionarena: {
    id: "unionarena",
    label: "Union Arena",
    short: "UNION ARENA",
    emoji: "⚔️",
    accent: "#7c3aed",
    dbPath: UA_DB,
    userDbPath: process.env.CDB_UA_USER_DB ?? DEFAULT_UA_USER_DB,
  },
};

export const GAME_IDS: GameId[] = ["digimon", "unionarena"];

export function isGameId(v: string): v is GameId {
  return v === "digimon" || v === "unionarena";
}

// Common color → display map (covers both games)
export const COLOR_HEX: Record<string, string> = {
  Red: "#ef4444",
  Blue: "#3b82f6",
  Yellow: "#facc15",
  Green: "#10b981",
  Black: "#1f2937",
  Purple: "#8b5cf6",
  White: "#f3f4f6",
  Unknown: "#9ca3af",
};

export function colorHex(c?: string | null): string {
  if (!c) return COLOR_HEX.Unknown;
  return COLOR_HEX[c] ?? COLOR_HEX.Unknown;
}
