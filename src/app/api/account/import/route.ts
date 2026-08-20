import { getCurrentUser } from "@/lib/auth/session";
import { backupBeforeWrite } from "@/lib/db/connection";
import { importUserData } from "@/lib/db/user-transfer";
import { isUserExport, USER_EXPORT_VERSION } from "@/lib/user-data";

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
  // getCurrentUser + an explicit 401, not requireUser: that one throws a
  // plain Error for Server Actions to surface, and an uncaught throw in a
  // route handler is a 500. An unauthenticated GET should say "log in", not
  // "the server broke".
  const me = await getCurrentUser();
  if (!me) return Response.json({ ok: false, error: "请先登录" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "文件不是有效的 JSON" }, { status: 400 });
  }

  const payload = (body ?? {}) as { data?: unknown; replace?: boolean };
  const data = payload.data ?? body;
  if (!isUserExport(data)) {
    return Response.json(
      { ok: false, error: "这不像是本站导出的数据文件" },
      { status: 400 },
    );
  }
  if (data.version > USER_EXPORT_VERSION) {
    return Response.json(
      {
        ok: false,
        error: `文件版本 ${data.version} 比这个站点支持的 ${USER_EXPORT_VERSION} 新,请先更新站点`,
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
    return Response.json({ ok: false, error: "导入失败,数据没有改动" }, { status: 500 });
  }
}
