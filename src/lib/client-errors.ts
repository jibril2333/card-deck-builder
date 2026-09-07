/**
 * 浏览器里抛出的错误,写到磁盘上。
 *
 * The server logs what the server throws. An error boundary that fires in the
 * browser — a client component that failed to render, a Server Action call
 * that came back wrong — leaves nothing behind but a panel the user closes,
 * and "the site showed an error page a few times today" is not something
 * anyone can act on.
 *
 * A bounded newline-delimited file, newest last. Not a database: this is
 * diagnostic exhaust, it must never be the reason a write fails, and it has to
 * survive being read with `docker exec cat`.
 */

import fs from "node:fs";
import path from "node:path";

/** How many entries to keep. Older ones fall off the front. */
export const MAX_ENTRIES = 200;
/** Longest stack we store — enough to name the frames, short of a log bomb. */
const MAX_FIELD = 2000;

export type ClientError = {
  at: string;
  url?: string;
  name?: string;
  message?: string;
  digest?: string;
  stack?: string;
  /** Set when the panel decided this was a stale build and reloaded itself. */
  stale?: boolean;
};

function file(): string {
  const dir =
    process.env.CDB_DATA_DIR ?? path.join(process.cwd(), "data.nosync");
  return path.join(dir, "client-errors.log");
}

const clip = (v: unknown): string | undefined =>
  typeof v === "string" && v.length > 0 ? v.slice(0, MAX_FIELD) : undefined;

/** Keep only the fields we asked for, at the sizes we asked for. */
export function sanitize(input: unknown, now = new Date()): ClientError {
  const o = (input ?? {}) as Record<string, unknown>;
  return {
    at: now.toISOString(),
    url: clip(o.url),
    name: clip(o.name),
    message: clip(o.message),
    digest: clip(o.digest),
    stack: clip(o.stack),
    stale: o.stale === true ? true : undefined,
  };
}

/** Append one entry, dropping the oldest when the file is full. */
export function recordClientError(entry: ClientError): void {
  try {
    const p = file();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const kept = readClientErrors().slice(-(MAX_ENTRIES - 1));
    kept.push(entry);
    fs.writeFileSync(p, kept.map((e) => JSON.stringify(e)).join("\n") + "\n");
  } catch {
    // Diagnostics must never break the page that is already broken.
  }
}

export function readClientErrors(): ClientError[] {
  try {
    return fs
      .readFileSync(file(), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as ClientError);
  } catch {
    return [];
  }
}
