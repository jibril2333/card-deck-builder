/**
 * Bearer authentication for `/api/v1`.
 *
 * The token IS a row in `user.sessions` — the same table the website's cookie
 * points into, created by the same `createSession`. Two consequences, both
 * deliberate:
 *
 *  · Logging in from the app does not touch the website's session, and
 *    `DELETE /session` deletes exactly the row the app is holding. Signing out
 *    on the phone leaves the browser signed in, which is what a person
 *    expects of two devices.
 *  · There is no second account system, no second password store and no
 *    migration. The design brief asks for exactly this: the app is another
 *    client of the existing session, not a parallel one.
 *
 * The cookie is deliberately NOT accepted here. An API that authenticates by
 * cookie is reachable from any page the browser visits, which is what CSRF
 * is; requiring a header the browser will not attach on its own removes the
 * class outright. It also keeps the two surfaces honest — nothing can quietly
 * start depending on the app being "logged in" the way the site is.
 */

import { findSession, findUserById } from "@/lib/auth/repo";
import type { User } from "@/lib/auth/types";
import { unauthenticated } from "./errors";

/** The raw token, or null when the header is absent or not a Bearer one. */
function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const m = /^Bearer[ ]+(\S+)$/i.exec(header.trim());
  return m ? m[1] : null;
}

export type Caller = { user: User; token: string };

/**
 * Resolve the caller, or throw UNAUTHENTICATED.
 *
 * An expired session is deleted by `findSession` on the way through, so a
 * client holding a stale token gets the same answer as one holding nonsense —
 * which is the answer it should act on either way: log in again.
 */
export async function requireCaller(req: Request): Promise<Caller> {
  const token = bearerToken(req);
  if (!token) throw unauthenticated("请先登录。");
  const session = findSession(token);
  if (!session) throw unauthenticated();
  const user = await findUserById(session.user_id);
  if (!user) throw unauthenticated();
  return { user, token };
}
