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
