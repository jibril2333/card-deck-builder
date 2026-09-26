/**
 * A bounded newline-delimited JSON file in the data directory, newest last.
 *
 * What client-errors.log and server-errors.log are made of. Not a database:
 * this is diagnostic exhaust, it must never be the reason a request fails,
 * and it has to survive being read with `docker exec cat`. It lives in the
 * data directory rather than on stdout because the container's log does not
 * outlive the container, and every deploy replaces the container.
 */

import fs from "node:fs";
import path from "node:path";

/** How many entries to keep. Older ones fall off the front. */
export const MAX_ENTRIES = 200;
/** Longest field we store — enough to name the frames, short of a log bomb. */
const MAX_FIELD = 2000;

export function logPath(name: string): string {
  const dir =
    process.env.CDB_DATA_DIR ?? path.join(process.cwd(), "data.nosync");
  return path.join(dir, name);
}

export const clip = (v: unknown): string | undefined =>
  typeof v === "string" && v.length > 0 ? v.slice(0, MAX_FIELD) : undefined;

export function readJsonl<T>(file: string): T[] {
  try {
    return fs
      .readFileSync(file, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as T);
  } catch {
    return [];
  }
}

/** Append one entry, dropping the oldest when the file is full. Never throws. */
export function appendJsonl<T>(file: string, entry: T): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const kept = readJsonl<T>(file).slice(-(MAX_ENTRIES - 1));
    kept.push(entry);
    fs.writeFileSync(file, kept.map((e) => JSON.stringify(e)).join("\n") + "\n");
  } catch {
    // Diagnostics must never break the request that is already failing.
  }
}
