/**
 * Daily auto-backup of the user data file.
 *
 *   - Runs once per (source file, day) — checks whether today's snapshot already
 *     exists on disk and skips if so.
 *   - Opens a dedicated short-lived better-sqlite3 connection on the source
 *     and runs `VACUUM INTO` (fully-consistent snapshot, handles WAL).
 *     We don't reuse the cached app connection because (a) it has another DB
 *     ATTACHed and (b) VACUUM INTO must target the connection's main schema.
 *   - Prunes snapshots older than 30 days.
 *
 *   File layout (next to the source DB), keyed by the source DB's name so
 *   multiple databases sharing one folder don't overwrite each other:
 *     <dbDir>/backups/<db-name>/2026-05-25.db
 *     ...
 */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const KEEP_DAYS = 30;
// Per-process cache so we don't even hit the filesystem on every call.
const lastChecked: Map<string, string> = new Map();

function todayStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function maybeDailyBackup(sourceDbPath: string): void {
  const today = todayStr();
  if (lastChecked.get(sourceDbPath) === today) return;
  lastChecked.set(sourceDbPath, today);

  // Per-DB subfolder (e.g. backups/digimon-user/) so two databases in the
  // same flat folder keep separate, non-colliding snapshot histories.
  const dbName = path.basename(sourceDbPath).replace(/\.db$/, "");
  const dir = path.join(path.dirname(sourceDbPath), "backups", dbName);
  const dest = path.join(dir, `${today}.db`);

  try {
    if (fs.existsSync(dest)) return;
    if (!fs.existsSync(sourceDbPath)) {
      // First-time use: source may not exist yet (ATTACH will create it on
      // first connect, but backup ran before any data landed). Skip silently.
      return;
    }
    fs.mkdirSync(dir, { recursive: true });

    const src = new Database(sourceDbPath);
    try {
      src.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
    } finally {
      src.close();
    }

    console.log(`[db] backup → ${dest}`);
    prune(dir);
  } catch (err) {
    console.error("[db] daily backup failed:", err);
  }
}

function prune(dir: string): void {
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }
  const dated = entries
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.db$/.test(f))
    .sort();
  while (dated.length > KEEP_DAYS) {
    const f = dated.shift()!;
    try {
      fs.rmSync(path.join(dir, f));
    } catch {
      // ignore
    }
  }
}
