/**
 * WebAuthn / Passkey helpers — DB access + ceremony orchestration.
 *
 * Architecture:
 *   - One user has many credentials (one per device). Stored in
 *     user.webauthn_credentials.
 *   - Each ceremony (register or auth) is two server round-trips:
 *       1. /begin — server generates a random challenge, returns
 *          PublicKeyCredentialCreationOptions / RequestOptions.
 *       2. /finish — server verifies the browser's response against the
 *          stored challenge.
 *     The challenge is parked in user.webauthn_challenges, keyed by
 *     (id, user_id, type), and consumed in /finish.
 *
 * RP (Relying Party) settings: we read the request's hostname at ceremony
 * time so the same code works in dev (localhost) and behind a Cloudflare
 * tunnel (decks.example.com) without rebuilding. Origin enforcement is
 * what makes WebAuthn phishing-proof — the browser refuses to assert a
 * credential to a different origin than it was registered for.
 */

import crypto from "node:crypto";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server";
import { getDB } from "@/lib/db/connection";

function db() {
  return getDB("digimon");
}

const RP_NAME = "Card Deck Builder";
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export type StoredCredential = {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  transports: string | null;
  label: string;
  created_at: string;
  last_used_at: string | null;
};

// ────────────────────────────────────────────────────────────────────────
// Credentials CRUD
// ────────────────────────────────────────────────────────────────────────

export function listCredentialsForUser(userId: string): StoredCredential[] {
  return db()
    .prepare(
      `SELECT id, user_id, credential_id, public_key, counter, transports,
              label, created_at, last_used_at
       FROM user.webauthn_credentials
       WHERE user_id = ?
       ORDER BY created_at DESC`,
    )
    .all(userId) as StoredCredential[];
}

export function findCredentialById(credentialId: string): StoredCredential | null {
  const row = db()
    .prepare(
      `SELECT id, user_id, credential_id, public_key, counter, transports,
              label, created_at, last_used_at
       FROM user.webauthn_credentials
       WHERE credential_id = ?`,
    )
    .get(credentialId) as StoredCredential | undefined;
  return row ?? null;
}

export function deleteCredential(id: string, userId: string): boolean {
  const r = db()
    .prepare(
      `DELETE FROM user.webauthn_credentials WHERE id = ? AND user_id = ?`,
    )
    .run(id, userId);
  return r.changes > 0;
}

export function renameCredential(
  id: string,
  userId: string,
  label: string,
): boolean {
  const r = db()
    .prepare(
      `UPDATE user.webauthn_credentials SET label = ? WHERE id = ? AND user_id = ?`,
    )
    .run(label, id, userId);
  return r.changes > 0;
}

// ────────────────────────────────────────────────────────────────────────
// Challenge storage
// ────────────────────────────────────────────────────────────────────────

function purgeStaleChallenges(): void {
  const cutoff = new Date(Date.now() - CHALLENGE_TTL_MS).toISOString();
  db()
    .prepare(`DELETE FROM user.webauthn_challenges WHERE created_at < ?`)
    .run(cutoff);
}

function storeChallenge(
  userId: string | null,
  type: "register" | "authenticate",
  challenge: string,
): string {
  purgeStaleChallenges();
  const id = crypto.randomUUID();
  db()
    .prepare(
      `INSERT INTO user.webauthn_challenges (id, user_id, type, challenge)
       VALUES (?, ?, ?, ?)`,
    )
    .run(id, userId, type, challenge);
  return id;
}

function consumeChallenge(
  id: string,
  expectedType: "register" | "authenticate",
): { user_id: string | null; challenge: string } | null {
  const row = db()
    .prepare(
      `SELECT user_id, type, challenge, created_at
       FROM user.webauthn_challenges WHERE id = ?`,
    )
    .get(id) as
    | {
        user_id: string | null;
        type: string;
        challenge: string;
        created_at: string;
      }
    | undefined;
  if (!row) return null;
  if (row.type !== expectedType) return null;
  if (Date.now() - new Date(row.created_at).getTime() > CHALLENGE_TTL_MS) {
    db().prepare(`DELETE FROM user.webauthn_challenges WHERE id = ?`).run(id);
    return null;
  }
  // One-shot: delete on consume so it can't be reused.
  db().prepare(`DELETE FROM user.webauthn_challenges WHERE id = ?`).run(id);
  return { user_id: row.user_id, challenge: row.challenge };
}

// ────────────────────────────────────────────────────────────────────────
// Registration ceremony
// ────────────────────────────────────────────────────────────────────────

export async function beginRegistration(
  user: { id: string; email: string; display_name: string },
  rpID: string,
): Promise<{
  challengeId: string;
  options: PublicKeyCredentialCreationOptionsJSON;
}> {
  const existing = listCredentialsForUser(user.id);
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userID: new TextEncoder().encode(user.id),
    userName: user.email,
    userDisplayName: user.display_name,
    attestationType: "none",
    // Tell the device "this user already has these credentials" so it
    // won't offer to enroll a duplicate on the same authenticator.
    excludeCredentials: existing.map((c) => ({
      id: c.credential_id,
      transports: c.transports
        ? (c.transports.split(",") as AuthenticatorTransport[])
        : undefined,
    })),
    authenticatorSelection: {
      // Prefer platform authenticators (Touch ID / Windows Hello), but allow
      // cross-platform (security keys) too.
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  const challengeId = storeChallenge(user.id, "register", options.challenge);
  return { challengeId, options };
}

export async function finishRegistration(input: {
  challengeId: string;
  response: RegistrationResponseJSON;
  expectedOrigin: string;
  expectedRPID: string;
  label?: string;
}): Promise<{ ok: true; credentialId: string } | { ok: false; error: string }> {
  const challengeRow = consumeChallenge(input.challengeId, "register");
  if (!challengeRow || !challengeRow.user_id) {
    return { ok: false, error: "challenge expired or invalid" };
  }
  const userId = challengeRow.user_id;

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: input.response,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: input.expectedOrigin,
      expectedRPID: input.expectedRPID,
    });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  if (!verification.verified || !verification.registrationInfo) {
    return { ok: false, error: "verification failed" };
  }

  const { credential, credentialDeviceType } = verification.registrationInfo;
  const credentialId = credential.id;
  const publicKey = Buffer.from(credential.publicKey).toString("base64url");
  const counter = credential.counter;
  const transports = input.response.response.transports?.join(",") ?? null;
  const id = crypto.randomUUID();
  const label =
    input.label && input.label.trim()
      ? input.label.trim()
      : credentialDeviceType === "singleDevice"
        ? "本设备"
        : "Passkey";

  db()
    .prepare(
      `INSERT INTO user.webauthn_credentials
         (id, user_id, credential_id, public_key, counter, transports, label)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, userId, credentialId, publicKey, counter, transports, label);

  return { ok: true, credentialId };
}

// ────────────────────────────────────────────────────────────────────────
// Authentication ceremony
// ────────────────────────────────────────────────────────────────────────

export async function beginAuthentication(
  rpID: string,
): Promise<{
  challengeId: string;
  options: PublicKeyCredentialRequestOptionsJSON;
}> {
  // Discoverable credentials: leave allowCredentials empty so the user
  // picks an account from the device. The user's identity comes from the
  // returned credential's userHandle, which we resolved server-side.
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
  });
  const challengeId = storeChallenge(null, "authenticate", options.challenge);
  return { challengeId, options };
}

export async function finishAuthentication(input: {
  challengeId: string;
  response: AuthenticationResponseJSON;
  expectedOrigin: string;
  expectedRPID: string;
}): Promise<
  | { ok: true; user_id: string }
  | { ok: false; error: string }
> {
  const challengeRow = consumeChallenge(input.challengeId, "authenticate");
  if (!challengeRow) {
    return { ok: false, error: "challenge expired or invalid" };
  }
  const credentialId = input.response.id;
  const stored = findCredentialById(credentialId);
  if (!stored) {
    return { ok: false, error: "credential not registered" };
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: input.response,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: input.expectedOrigin,
      expectedRPID: input.expectedRPID,
      credential: {
        id: stored.credential_id,
        publicKey: new Uint8Array(Buffer.from(stored.public_key, "base64url")),
        counter: stored.counter,
        transports: stored.transports
          ? (stored.transports.split(",") as AuthenticatorTransport[])
          : undefined,
      },
    });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  if (!verification.verified) {
    return { ok: false, error: "verification failed" };
  }

  // Bump the counter + last_used_at — counter mismatch on next auth would
  // indicate a cloned authenticator (we just trust the new value, which
  // is what spec recommends for non-FIDO-certified deployments).
  db()
    .prepare(
      `UPDATE user.webauthn_credentials
         SET counter = ?, last_used_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .run(verification.authenticationInfo.newCounter, stored.id);

  return { ok: true, user_id: stored.user_id };
}
