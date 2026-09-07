import { recordClientError, sanitize } from "@/lib/client-errors";

/**
 * Where the error boundary reports what it caught.
 *
 * Unauthenticated on purpose: the boundary fires for signed-out visitors too,
 * and an error that only gets recorded when the session is intact is missing
 * the cases most worth seeing. That makes it a public write endpoint, so it is
 * bounded on every axis — body size, field length, entries kept, and how many
 * it accepts per minute.
 */

export const dynamic = "force-dynamic";

/** Bodies are one small JSON object; anything larger is not from the panel. */
const MAX_BODY = 8 * 1024;
/** Accepted per minute, process-wide. A loop in one tab must not fill a disk. */
const MAX_PER_MINUTE = 20;

let windowStart = 0;
let inWindow = 0;

function overLimit(now: number): boolean {
  if (now - windowStart >= 60_000) {
    windowStart = now;
    inWindow = 0;
  }
  inWindow += 1;
  return inWindow > MAX_PER_MINUTE;
}

export async function POST(req: Request): Promise<Response> {
  if (overLimit(Date.now())) return new Response(null, { status: 429 });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return new Response(null, { status: 413 });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }
  recordClientError(sanitize(parsed));
  // Nothing to say back: the page is already showing the user what happened.
  return new Response(null, { status: 204 });
}
