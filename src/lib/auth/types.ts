/**
 * Shared types for the auth layer. Kept in a separate module so client
 * components can import the type shape without pulling in better-sqlite3.
 */

export type User = {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
};

export type Session = {
  id: string;
  user_id: string;
  expires_at: string;
  created_at: string;
};

export const SESSION_COOKIE = "cdb_session";
/** Sessions live for 30 days from creation. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Should the session cookie carry `Secure`?
 *
 * `Secure` means "only send this over HTTPS", and a browser DROPS a Secure
 * cookie that arrives over plain http — silently. The symptom is the worst
 * kind: the login POST succeeds, the redirect lands, and the site says you are
 * not signed in, with nothing in any log.
 *
 * That is what happens to anyone reaching this app directly over http on a LAN
 * (`http://nas:3001`), because the image sets NODE_ENV=production. HTTPS in
 * front of it — a tunnel, a reverse proxy — is the right answer and needs no
 * flag. `CDB_INSECURE_COOKIES=1` is for the case where there is no HTTPS to be
 * had: it drops `Secure` so a LAN install can be used at all. Only set it on a
 * network you trust, because the session cookie then travels in the clear.
 */
export function sessionCookieSecure(
  env: { NODE_ENV?: string; CDB_INSECURE_COOKIES?: string } = process.env,
): boolean {
  if (env.CDB_INSECURE_COOKIES === "1") return false;
  return env.NODE_ENV === "production";
}
