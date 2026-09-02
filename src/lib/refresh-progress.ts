/**
 * How far along the running refresh is.
 *
 * The status file says WHICH stage is running; for the ones that walk every
 * card — the two price scrapes — that is not a progress report, it is a
 * spinner. Each scraper writes its own count here instead, and the admin panel
 * reads them beside the status.
 *
 * ONE FILE PER SCRIPT, because the price stage runs its two scrapes at the
 * same time (they talk to different shops, so doing them one after the other
 * just doubled the wall clock). A shared file would have two writers and a
 * torn read; a file each has exactly one writer.
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

const PREFIX = "refresh-progress";

function dataDir(): string {
  return process.env.CDB_DATA_DIR ?? path.join(process.cwd(), "data.nosync");
}

/** One file per script; the name is part of the filename, so keep it tame. */
function file(script: string): string {
  const safe = script.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(dataDir(), `${PREFIX}-${safe}.json`);
}

const lastWrite = new Map<string, number>();

/**
 * Record progress. Throttled per script: a scrape ticks once per card and the
 * panel polls every three seconds, so writing every tick is pure disk churn.
 * `force` bypasses it — used for the first and last call, and for the loops
 * where one iteration is a whole network round trip.
 */
export function reportProgress(
  p: Omit<RefreshProgress, "updatedAt">,
  force = false,
): void {
  const now = Date.now();
  if (!force && now - (lastWrite.get(p.script) ?? 0) < 1000) return;
  lastWrite.set(p.script, now);
  const payload: RefreshProgress = { ...p, updatedAt: new Date().toISOString() };
  try {
    const target = file(p.script);
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload), "utf8");
    fs.renameSync(tmp, target);
  } catch {
    // Progress is a nicety; never let it take a scrape down.
  }
}

/** Drop every file. Called when a run ends, so finished counts don't linger. */
export function clearProgress(): void {
  try {
    for (const name of fs.readdirSync(dataDir())) {
      if (name.startsWith(`${PREFIX}-`) && name.endsWith(".json")) {
        fs.rmSync(path.join(dataDir(), name), { force: true });
      }
    }
  } catch {
    // Same.
  }
}

/**
 * Everything currently reporting, oldest-stale entries dropped. Anything more
 * than five minutes old is treated as gone: a killed scrape leaves its last
 * count behind, and a number that stopped moving is worse than no number.
 */
export function readProgress(maxAgeMs = 5 * 60_000): RefreshProgress[] {
  let names: string[] = [];
  try {
    names = fs
      .readdirSync(dataDir())
      .filter((n) => n.startsWith(`${PREFIX}-`) && n.endsWith(".json"));
  } catch {
    return [];
  }
  const out: RefreshProgress[] = [];
  for (const name of names) {
    try {
      const raw = JSON.parse(
        fs.readFileSync(path.join(dataDir(), name), "utf8"),
      ) as RefreshProgress;
      if (typeof raw?.done !== "number" || typeof raw?.total !== "number") {
        continue;
      }
      if (Date.now() - new Date(raw.updatedAt).getTime() > maxAgeMs) continue;
      out.push(raw);
    } catch {
      // A half-written file, or one that vanished between readdir and read.
    }
  }
  return out.sort((a, b) => a.script.localeCompare(b.script));
}
