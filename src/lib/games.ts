import os from "os";
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

// Default paths: where the user's two existing project folders live.
// Override with CDB_*_DB in .env.local for other layouts.
const DEFAULT_DIGIMON_DB = path.join(
  os.homedir(),
  "Desktop/workspace/digimon-deck-builder/data/digimon.db",
);
const DEFAULT_UA_DB = path.join(
  os.homedir(),
  "Desktop/workspace/unionarena-deck-builder/data/unionarena.db",
);

function defaultUserDb(mainDb: string): string {
  return path.join(path.dirname(mainDb), "user.db");
}

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
    userDbPath:
      process.env.CDB_DIGIMON_USER_DB ?? defaultUserDb(DIGIMON_DB),
  },
  unionarena: {
    id: "unionarena",
    label: "Union Arena",
    short: "UNION ARENA",
    emoji: "⚔️",
    accent: "#7c3aed",
    dbPath: UA_DB,
    userDbPath: process.env.CDB_UA_USER_DB ?? defaultUserDb(UA_DB),
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
