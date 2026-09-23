/**
 * Read a JSON file that is allowed not to exist yet.
 *
 * The settings and state files under the data directory (ntfy.json,
 * backup.json, refresh-status.json, scrape-health.json) are all read the same
 * way: parse it, and fall back to "nothing configured" / "nothing recorded"
 * when that fails. Missing IS that case — a fresh deployment, a feature never
 * set up — and stays quiet.
 *
 * Unreadable or not JSON is a different case that used to take the same exit
 * without a word. For backup.json that meant the backup daemon quietly moved
 * the replica from R2 to the local directory; for ntfy.json, a failure
 * notification that never went out while the log said "not configured". The
 * fallback is still the same — nothing here is allowed to stop a daemon —
 * but it now says why on stderr, which is the container log.
 *
 * Said once per file and reason per process: the daemons read these on every
 * tick, and a broken file should be one line to find, not one a minute.
 */

import fs from "node:fs";

const reported = new Set<string>();

function report(file: string, what: string): void {
  const key = `${file}\n${what}`;
  if (reported.has(key)) return;
  reported.add(key);
  console.error(`[config] ${file}: ${what} — using the empty default`);
}

/** The parsed file, or undefined when it is missing, unreadable or not JSON. */
export function readJsonFile(file: string): unknown {
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") report(file, `cannot read (${code ?? (e as Error).message})`);
    return undefined;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch (e) {
    report(file, `not valid JSON (${(e as Error).message})`);
    return undefined;
  }
}
