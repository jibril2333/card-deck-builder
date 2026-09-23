"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  createUser,
  findInvite,
  findUserByEmail,
  redeemInvite,
  verifyPassword,
} from "./repo";
import { clearSessionCookie, setSessionCookie } from "./session";
import {
  checkLogin,
  waitMinutes,
  recordFailure,
  recordSuccess,
} from "./throttle";
import { getMessages } from "@/lib/i18n/server";

export type AuthResult =
  | { ok: true }
  | { ok: false; error: string };

// ────────────────────────────────────────────────────────────────────────
// Register
// ────────────────────────────────────────────────────────────────────────

export async function registerAction(formData: FormData): Promise<AuthResult> {
  const m = await getMessages();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const inviteCode = String(formData.get("invite") ?? "").trim();

  if (!email || !email.includes("@")) {
    return { ok: false, error: m.auth.invalidEmail };
  }
  if (!password || password.length < 8) {
    return { ok: false, error: m.auth.passwordTooShort };
  }
  if (!displayName) {
    return { ok: false, error: m.auth.nicknameRequired };
  }
  if (!inviteCode) {
    return { ok: false, error: m.auth.inviteRequired };
  }

  // Pre-check invite + email uniqueness before doing the expensive bcrypt.
  const invite = findInvite(inviteCode);
  if (!invite) return { ok: false, error: m.auth.inviteInvalid };
  if (invite.used_by) return { ok: false, error: m.auth.inviteUsed };

  if (await findUserByEmail(email)) {
    return { ok: false, error: m.auth.emailTaken };
  }

  const user = await createUser({
    email,
    password,
    display_name: displayName,
  });

  // Race-safe: redeemInvite uses `WHERE used_by IS NULL` and returns false
  // if someone else just took it. Roll back the user creation in that case.
  const claimed = redeemInvite(inviteCode, user.id);
  if (!claimed) {
    // Extremely unlikely (single-host deploy + invite already validated above)
    // but we still defend against it. The user row stays, but they get a
    // clear error and can ask for a new invite.
    return {
      ok: false,
      error: m.auth.inviteRace,
    };
  }

  await setSessionCookie(user.id);
  return { ok: true };
}

// ────────────────────────────────────────────────────────────────────────
// Login
// ────────────────────────────────────────────────────────────────────────

export async function loginAction(formData: FormData): Promise<AuthResult> {
  const m = await getMessages();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { ok: false, error: m.auth.credentialsRequired };
  }

  // Checked BEFORE the bcrypt compare: the point is to stop spending 200ms of
  // CPU per guess, not only to refuse the answer.
  const keys = { email, address: await clientAddress() };
  const gate = checkLogin(keys);
  if (!gate.allowed) {
    return {
      ok: false,
      error: m.auth.tooManyAttempts(waitMinutes(gate.retryAfterMs)),
    };
  }

  const user = await verifyPassword(email, password);
  if (!user) {
    recordFailure(keys);
    // Deliberately the same message as before, and the same one a locked-out
    // wrong password gets: which of the two fields is wrong, and whether the
    // account exists, are not things the form should say.
    return { ok: false, error: m.auth.wrongCredentials };
  }
  recordSuccess(keys);
  await setSessionCookie(user.id);
  return { ok: true };
}

/**
 * The client's address as the tunnel reports it.
 *
 * Everything arrives from Cloudflare, so the socket's peer is useless; the
 * forwarded headers are what carry the caller. Missing headers collapse
 * everyone into one bucket, which throttles too much rather than too little.
 */
async function clientAddress(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

// ────────────────────────────────────────────────────────────────────────
// Logout
// ────────────────────────────────────────────────────────────────────────

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/login");
}
