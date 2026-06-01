/**
 * Auth data access — user / session / invite CRUD against the per-game
 * user.db. Each game has its own user.db, but for now the deploy story is
 * "share the same accounts across both games" — so we deliberately route all
 * auth queries to a single canonical user.db (defaulting to the digimon one).
 *
 * If someday we want fully separate user spaces per game, change `authDb()`
 * to take a game parameter and propagate it through every caller.
 *
 * All callers MUST go through the `auth/` module — never read `users` /
 * `sessions` / `invites` directly from db modules.
 */

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { getDB } from "@/lib/db/connection";
import { SESSION_TTL_MS, type Session, type User } from "./types";

// We attach the auth DB through the digimon connection. Either game's user.db
// has the same `users` / `sessions` / `invites` tables (both got migration #7),
// but to avoid a third user identity per game we standardize on the digimon
// connection.
function authDb() {
  return getDB("digimon");
}

const BCRYPT_ROUNDS = 12;
const TOKEN_BYTES = 32;

function newId(): string {
  return crypto.randomUUID();
}

function newToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString("base64url");
}

// ────────────────────────────────────────────────────────────────────────
// Users
// ────────────────────────────────────────────────────────────────────────

export async function findUserByEmail(email: string): Promise<User | null> {
  const row = authDb()
    .prepare(
      `SELECT id, email, display_name, created_at FROM user.users WHERE email = ?`,
    )
    .get(email.toLowerCase().trim()) as User | undefined;
  return row ?? null;
}

export async function findUserById(id: string): Promise<User | null> {
  const row = authDb()
    .prepare(
      `SELECT id, email, display_name, created_at FROM user.users WHERE id = ?`,
    )
    .get(id) as User | undefined;
  return row ?? null;
}

export async function createUser(input: {
  email: string;
  password: string;
  display_name: string;
}): Promise<User> {
  const id = newId();
  const email = input.email.toLowerCase().trim();
  const password_hash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  authDb()
    .prepare(
      `INSERT INTO user.users (id, email, password_hash, display_name)
       VALUES (?, ?, ?, ?)`,
    )
    .run(id, email, password_hash, input.display_name.trim());
  return {
    id,
    email,
    display_name: input.display_name.trim(),
    created_at: new Date().toISOString(),
  };
}

/** Returns the user if password matches, otherwise null. Constant-time. */
export async function verifyPassword(
  email: string,
  password: string,
): Promise<User | null> {
  const row = authDb()
    .prepare(
      `SELECT id, email, display_name, password_hash, created_at
       FROM user.users WHERE email = ?`,
    )
    .get(email.toLowerCase().trim()) as
    | (User & { password_hash: string })
    | undefined;
  if (!row) {
    // Run a dummy compare so timing doesn't leak whether the email exists.
    await bcrypt.compare(password, "$2b$12$invalidinvalidinvalidinvalidinvalidi");
    return null;
  }
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return null;
  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    created_at: row.created_at,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Sessions
// ────────────────────────────────────────────────────────────────────────

export function createSession(userId: string): Session {
  const id = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  authDb()
    .prepare(
      `INSERT INTO user.sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
    )
    .run(id, userId, expiresAt);
  return {
    id,
    user_id: userId,
    expires_at: expiresAt,
    created_at: new Date().toISOString(),
  };
}

export function findSession(token: string): Session | null {
  const row = authDb()
    .prepare(
      `SELECT id, user_id, expires_at, created_at FROM user.sessions WHERE id = ?`,
    )
    .get(token) as Session | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    deleteSession(token);
    return null;
  }
  return row;
}

export function deleteSession(token: string): void {
  authDb().prepare(`DELETE FROM user.sessions WHERE id = ?`).run(token);
}

/** Periodic cleanup — call from a cron or on app start. */
export function purgeExpiredSessions(): number {
  const r = authDb()
    .prepare(`DELETE FROM user.sessions WHERE expires_at < ?`)
    .run(new Date().toISOString());
  return r.changes;
}

// ────────────────────────────────────────────────────────────────────────
// Invites
// ────────────────────────────────────────────────────────────────────────

export type Invite = {
  code: string;
  used_by: string | null;
  created_at: string;
  used_at: string | null;
};

export function createInvite(): Invite {
  // 12 hex chars ≈ 48 bits of entropy — enough since the invite is one-shot
  // and the deploy is small-audience. Easy to share verbally / IM.
  const code = crypto.randomBytes(6).toString("hex");
  authDb().prepare(`INSERT INTO user.invites (code) VALUES (?)`).run(code);
  return {
    code,
    used_by: null,
    created_at: new Date().toISOString(),
    used_at: null,
  };
}

export function findInvite(code: string): Invite | null {
  const row = authDb()
    .prepare(
      `SELECT code, used_by, created_at, used_at FROM user.invites WHERE code = ?`,
    )
    .get(code.trim()) as Invite | undefined;
  return row ?? null;
}

export function listInvites(): Invite[] {
  return authDb()
    .prepare(
      `SELECT code, used_by, created_at, used_at FROM user.invites ORDER BY created_at DESC`,
    )
    .all() as Invite[];
}

/** Atomically validate + mark an invite as redeemed by the given user. */
export function redeemInvite(code: string, userId: string): boolean {
  const r = authDb()
    .prepare(
      `UPDATE user.invites
       SET used_by = ?, used_at = CURRENT_TIMESTAMP
       WHERE code = ? AND used_by IS NULL`,
    )
    .run(userId, code.trim());
  return r.changes > 0;
}

export function deleteInvite(code: string): void {
  authDb().prepare(`DELETE FROM user.invites WHERE code = ?`).run(code);
}
