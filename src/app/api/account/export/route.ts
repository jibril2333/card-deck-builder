import { requireUser } from "@/lib/auth/session";
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
  const me = await requireUser();
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
