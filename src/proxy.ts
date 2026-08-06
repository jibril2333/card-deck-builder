/**
 * Next 16 edge proxy (formerly `middleware.ts`, renamed in Next 16) — gates
 * all routes behind a session cookie except a small allowlist (/login,
 * /register, static assets). We can't verify the session against SQLite from
 * here (proxy runs on the edge runtime, better-sqlite3 isn't available), so
 * we only check the cookie's presence. The actual session validity is
 * re-checked on every Server Component via `getCurrentUser()`, which lives
 * in the Node.js runtime.
 *
 * This is fine: a stolen / forged cookie still gets through here but fails
 * at the data layer. The proxy's job is just to send anonymous users to
 * /login instead of letting them see the deck pages briefly before a
 * server-side redirect kicks in.
 */

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/types";

/**
 * Routes that REQUIRE a logged-in session at the edge. Everything else is
 * publicly browsable — anon users can search cards, view deck lists, view
 * any deck detail (read-only), see the banlist + about pages. The Server
 * Actions that mutate data still call `requireUser()` themselves, so even
 * a forged anon request bouncing past the proxy can't write.
 *
 * Patterns:
 *   - `/account`              — personal settings
 *   - `/<game>/collection`    — the logged-in user's own collection
 *
 * (Login / register are not listed here because they're meant to be
 * accessed unauthenticated; gating them would create a redirect loop.)
 */
const PROTECTED_RE = /^\/(?:account(?:\/|$)|(?:digimon|unionarena)\/collection(?:\/|$))/;

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED_RE.test(pathname)) return NextResponse.next();

  const hasSession = req.cookies.get(SESSION_COOKIE)?.value;
  if (hasSession) return NextResponse.next();

  // Bounce to /login, preserving the originally requested path so we can
  // return there after login.
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except:
  //   - Next's internal asset routes (_next/static, _next/image)
  //   - The favicon
  //   - Files with a dot (assumed static)
  matcher: ["/((?!_next/|favicon\\.ico$|.*\\..*).*)"],
};
