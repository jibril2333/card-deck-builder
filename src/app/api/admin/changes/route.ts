import { isAdmin } from "@/lib/auth/admin";
import { listRefreshRuns } from "@/lib/db/digimon";

/**
 * What recent refreshes changed, grouped by run.
 *
 * Read straight from the card database: the changelog is written into the work
 * copy before the swap, so it arrives with the data it describes rather than
 * living beside it and drifting.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await isAdmin())) return new Response("forbidden", { status: 403 });
  const runs = Number(new URL(req.url).searchParams.get("runs") ?? 5);
  return Response.json({
    runs: listRefreshRuns(Number.isFinite(runs) ? Math.min(20, Math.max(1, runs)) : 5),
  });
}
