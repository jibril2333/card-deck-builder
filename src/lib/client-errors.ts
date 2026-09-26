/**
 * 浏览器里抛出的错误,写到磁盘上。
 *
 * The server logs what the server throws. An error boundary that fires in the
 * browser — a client component that failed to render, a Server Action call
 * that came back wrong — leaves nothing behind but a panel the user closes,
 * and "the site showed an error page a few times today" is not something
 * anyone can act on.
 *
 * Stored as a bounded newline-delimited file; see jsonl-log.ts. Its
 * counterpart for errors thrown ON the server is server-errors.ts.
 */

import { appendJsonl, clip, logPath, readJsonl } from "./jsonl-log";

export { MAX_ENTRIES } from "./jsonl-log";

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

const FILE = "client-errors.log";

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
  appendJsonl(logPath(FILE), entry);
}

export function readClientErrors(): ClientError[] {
  return readJsonl<ClientError>(logPath(FILE));
}
