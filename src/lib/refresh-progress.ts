/**
 * How far along the running refresh is.
 *
 * The status file says WHICH stage is running; for the ones that walk every
 * card — the two price scrapes, two hours between them — that is not a
 * progress report, it is a spinner. Each scraper writes its own count here
 * instead, and the admin panel reads it beside the status.
 *
 * A separate file on purpose: the daemon owns `refresh-status.json` and the
 * scrapers are its child processes, so sharing one file would mean two writers
 * and a torn read. This one has exactly one writer at a time — the script that
 * is currently running.
 */

import fs from "node:fs";
import path from "node:path";

export type RefreshProgress = {
  /** The script reporting, e.g. "scrape-pao-prices". */
  script: string;
  done: number;
  total: number;
  /** What it is on right now — a card code, a set, whatever reads usefully. */
  note?: string;
  updatedAt: string;
};

function dataDir(): string {
  return process.env.CDB_DATA_DIR ?? path.join(process.cwd(), "data.nosync");
}

function file(): string {
  return path.join(dataDir(), "refresh-progress.json");
}

let lastWrite = 0;

/**
 * Record progress. Throttled: a scrape ticks once per card and the panel polls
 * every three seconds, so writing every tick is pure disk churn. `force`
 * bypasses it for the first and last call.
 */
export function reportProgress(
  p: Omit<RefreshProgress, "updatedAt">,
  force = false,
): void {
  const now = Date.now();
  if (!force && now - lastWrite < 1000) return;
  lastWrite = now;
  const payload: RefreshProgress = { ...p, updatedAt: new Date().toISOString() };
  try {
    const tmp = `${file()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload), "utf8");
    fs.renameSync(tmp, file());
  } catch {
    // Progress is a nicety; never let it take a scrape down.
  }
}

/** Drop the file. Called when a run ends, so a finished count doesn't linger. */
export function clearProgress(): void {
  try {
    fs.rmSync(file(), { force: true });
  } catch {
    // Same.
  }
}

/**
 * Read it back, or null. Anything older than five minutes is treated as stale:
 * a killed scrape leaves its last count behind, and a number that stopped
 * moving is worse than no number.
 */
export function readProgress(maxAgeMs = 5 * 60_000): RefreshProgress | null {
  try {
    const raw = JSON.parse(fs.readFileSync(file(), "utf8")) as RefreshProgress;
    if (!raw || typeof raw.done !== "number" || typeof raw.total !== "number") {
      return null;
    }
    if (Date.now() - new Date(raw.updatedAt).getTime() > maxAgeMs) return null;
    return raw;
  } catch {
    return null;
  }
}
