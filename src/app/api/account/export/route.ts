import { getCurrentUser } from "@/lib/auth/session";
import { exportUserData } from "@/lib/db/user-transfer";

/**
 * Download everything this account owns as one JSON file.
 *
 * Authenticated, and scoped to the caller — there is no "export somebody
 * else's data", not even for an admin. See lib/user-data.ts for what the file
 * contains and, more importantly, what it leaves out (no password hash, no
 * sessions, no passkeys).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  // getCurrentUser + an explicit 401, not requireUser: that one throws a
  // plain Error for Server Actions to surface, and an uncaught throw in a
  // route handler is a 500. An unauthenticated GET should say "log in", not
  // "the server broke".
  const me = await getCurrentUser();
  if (!me) return Response.json({ ok: false, error: "请先登录" }, { status: 401 });
  const data = exportUserData(me.id, `exported by ${me.display_name}`);
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="cdb-data-${stamp}.json"`,
      // It's personal data, and a shared cache holding it would be a leak.
      "cache-control": "no-store",
    },
  });
}
