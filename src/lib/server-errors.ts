/**
 * 服务端抛出的错误,写到磁盘上。
 *
 * In production Next never sends a server error's message to the browser —
 * the page gets "An error occurred in the Server Components render" and a
 * digest, and the real cause is printed to the container's stdout. Every
 * deploy replaces the container, and its log goes with it. The 2026-09-14
 * error page on a deck group left only its digest in client-errors.log;
 * the cause had to be inferred from a passkey sign-in seventeen seconds
 * later.
 *
 * So instrumentation.ts hands each server error here, and it is kept in the
 * data directory beside client-errors.log. The digest shown under 详情 on
 * the error page is the key between the two:
 *
 *   docker exec card-deck-builder grep <digest> /app/data.nosync/server-errors.log
 *
 * Request headers are NOT stored: they carry the session cookie.
 */

import { appendJsonl, clip, logPath, readJsonl } from "./jsonl-log";

export type ServerError = {
  at: string;
  digest?: string;
  /** "render" | "route" | "action" | "proxy" */
  routeType?: string;
  /** The route file, e.g. /[game]/groups/[id] */
  routePath?: string;
  method?: string;
  /** What was requested, query included. */
  path?: string;
  name?: string;
  /** SQLite and Node put the useful part here: SQLITE_BUSY, ENOENT. */
  code?: string;
  message?: string;
  stack?: string;
};

const FILE = "server-errors.log";

/**
 * redirect() and notFound() are thrown to unwind a render, and carry these
 * digests. They are how a page says "go to /login" or "no such deck", not
 * failures, and a log that fills up with them hides the ones that are.
 */
const CONTROL_FLOW = /^(NEXT_REDIRECT|NEXT_HTTP_ERROR_FALLBACK|NEXT_NOT_FOUND|BAILOUT_TO_CLIENT_SIDE_RENDERING|DYNAMIC_SERVER_USAGE)\b/;

type HookError = { digest?: unknown; name?: unknown; message?: unknown; stack?: unknown; code?: unknown };
type HookRequest = { path?: unknown; method?: unknown };
type HookContext = { routeType?: unknown; routePath?: unknown };

/** The entry to store, or null for one that should not be stored. */
export function toServerError(
  err: HookError,
  request: HookRequest,
  context: HookContext,
  now = new Date(),
): ServerError | null {
  const digest = clip(err?.digest);
  if (digest && CONTROL_FLOW.test(digest)) return null;
  return {
    at: now.toISOString(),
    digest,
    routeType: clip(context?.routeType),
    routePath: clip(context?.routePath),
    method: clip(request?.method),
    path: clip(request?.path),
    name: clip(err?.name),
    code: clip(err?.code),
    message: clip(err?.message),
    stack: clip(err?.stack),
  };
}

/**
 * Store one error. A render reports the same failure more than once (the HTML
 * and the RSC payload are two renders of one request), so an entry whose
 * digest matches the newest one is dropped.
 */
export function recordServerError(entry: ServerError): void {
  const file = logPath(FILE);
  if (entry.digest) {
    const last = readJsonl<ServerError>(file).at(-1);
    if (last?.digest === entry.digest) return;
  }
  appendJsonl(file, entry);
}

export function readServerErrors(): ServerError[] {
  return readJsonl<ServerError>(logPath(FILE));
}
