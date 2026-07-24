import { getDB } from "@/lib/db/connection";

/**
 * Liveness/readiness probe for the Docker healthcheck.
 *
 * Deliberately touches SQLITE, not just the HTTP port. A container whose DB
 * has gone bad still binds :3001 and still answers 200 on static routes — that
 * is exactly what happened on 2026-07-24, when every page rendered an error
 * boundary with `SQLITE_CORRUPT: database disk image is malformed` while the
 * container looked perfectly healthy from the outside. Reading one row from
 * each attached database catches that class of failure.
 *
 * Both reads are indexed single-row lookups, so this stays cheap enough to run
 * every 30s forever.
 *
 * This route is reachable through the public tunnel, so the response body
 * carries no paths, versions, or driver messages — details go to the server
 * log instead.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getDB("digimon");
    // Cards DB (the main file).
    db.prepare("SELECT code FROM cards LIMIT 1").get();
    // User DB (ATTACHed as `user`) — decks/collection live here, and it is a
    // separate file that can fail independently of the cards DB.
    db.prepare("SELECT id FROM user.decks LIMIT 1").get();
    return Response.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[health] probe failed:", err);
    return Response.json({ ok: false }, { status: 503 });
  }
}
