import { isAdmin } from "@/lib/auth/admin";
import { getLocale } from "@/lib/i18n/server";
import { listRefreshChanges, listRefreshRuns } from "@/lib/db/digimon";

/**
 * What recent refreshes changed.
 *
 *   ?runs=N   → the last N runs: timestamp, totals, per-kind counts.
 *   ?run=ISO  → every row of one run, with card names joined in.
 *
 * Read straight from the card database: the changelog is written into the work
 * copy before the swap, so it arrives with the data it describes rather than
 * living beside it and drifting.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await isAdmin())) return new Response("forbidden", { status: 403 });
  const params = new URL(req.url).searchParams;
  const lang = await getLocale();

  const run = params.get("run");
  if (run) {
    return Response.json({ run_at: run, changes: listRefreshChanges(run, lang) });
  }

  const runs = Number(params.get("runs") ?? 5);
  return Response.json({
    runs: listRefreshRuns(Number.isFinite(runs) ? Math.min(20, Math.max(1, runs)) : 5),
  });
}
