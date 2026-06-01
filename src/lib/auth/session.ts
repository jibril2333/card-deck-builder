/**
 * High-level auth API for Server Components and Server Actions.
 *
 * Cookie strategy:
 *   - HttpOnly + SameSite=Lax + Secure(in prod via Cloudflare Tunnel HTTPS).
 *   - Stores the session token (a random base64url string). Server-side
 *     state (user_id, expiry) lives in user.sessions; cookie itself is
 *     opaque so leakage doesn't leak the user_id.
 *   - 30 days lifetime, refreshed lazily on every authenticated request
 *     (extends expires_at by half a TTL if older than half-life). For now
 *     we keep the cookie fixed — refresh logic can come later.
 */

import { cookies } from "next/headers";
import {
  createSession as repoCreateSession,
  deleteSession as repoDeleteSession,
  findSession,
  findUserById,
} from "./repo";
import { SESSION_COOKIE, SESSION_TTL_MS, type User } from "./types";

export async function setSessionCookie(userId: string): Promise<void> {
  const session = repoCreateSession(userId);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, session.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(session.expires_at),
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  const existing = jar.get(SESSION_COOKIE)?.value;
  if (existing) repoDeleteSession(existing);
  jar.delete(SESSION_COOKIE);
}

/**
 * Reads the session cookie and resolves the current user, or null if not
 * authenticated / session expired.
 *
 * Safe to call from any Server Component or Server Action. Result is NOT
 * cached across calls — every invocation hits the user.db. That's fine for
 * our scale; if it ever becomes a hot path we can wrap it in React.cache().
 */
export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = findSession(token);
  if (!session) return null;
  return findUserById(session.user_id);
}

/**
 * Same as getCurrentUser() but throws if the request is unauthenticated.
 * Use in Server Actions where the operation must have an owner.
 */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

// Re-export the cookie name so middleware (which doesn't run in Node.js,
// no fs / better-sqlite3) can read it without pulling this module's deps.
export { SESSION_COOKIE, SESSION_TTL_MS };
