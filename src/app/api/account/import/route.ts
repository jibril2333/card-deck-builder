import { getCurrentUser } from "@/lib/auth/session";
import { backupBeforeWrite } from "@/lib/db/connection";
import { importUserData } from "@/lib/db/user-transfer";
import { isUserExport, USER_EXPORT_VERSION } from "@/lib/user-data";
import { getMessages } from "@/lib/i18n/server";

/**
 * Load an export into this account.
 *
 * Everything lands under the caller's id, whatever the file says — the file
 * carries no account at all, so importing somebody else's export makes their
 * decks yours rather than restoring their user.
 *
 * A backup of the user database is taken first. The import runs in one
 * transaction, so a malformed file leaves nothing half-written; the backup is
 * for the other case — a well-formed file that turns out to be the wrong one.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const m = await getMessages();
  // getCurrentUser + an explicit 401, not requireUser: that one throws a
  // plain Error for Server Actions to surface, and an uncaught throw in a
  // route handler is a 500. An unauthenticated GET should say "log in", not
  // "the server broke".
  const me = await getCurrentUser();
  if (!me) return Response.json({ ok: false, error: m.account.loginFirst }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: m.account.notJson }, { status: 400 });
  }

  const payload = (body ?? {}) as { data?: unknown; replace?: boolean };
  const data = payload.data ?? body;
  if (!isUserExport(data)) {
    return Response.json(
      { ok: false, error: m.account.notOurExport },
      { status: 400 },
    );
  }
  if (data.version > USER_EXPORT_VERSION) {
    return Response.json(
      {
        ok: false,
        error: m.account.newerVersion(data.version, USER_EXPORT_VERSION),
      },
      { status: 400 },
    );
  }

  backupBeforeWrite("digimon");
  try {
    const report = importUserData(me.id, data, { replace: !!payload.replace });
    return Response.json({ ok: true, report });
  } catch (err) {
    console.error("[account/import] failed:", err);
    return Response.json({ ok: false, error: m.account.importFailedUnchanged }, { status: 500 });
  }
}
