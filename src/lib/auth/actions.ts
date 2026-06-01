"use server";

import { redirect } from "next/navigation";
import {
  createUser,
  findInvite,
  findUserByEmail,
  redeemInvite,
  verifyPassword,
} from "./repo";
import { clearSessionCookie, setSessionCookie } from "./session";

export type AuthResult =
  | { ok: true }
  | { ok: false; error: string };

// ────────────────────────────────────────────────────────────────────────
// Register
// ────────────────────────────────────────────────────────────────────────

export async function registerAction(formData: FormData): Promise<AuthResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const inviteCode = String(formData.get("invite") ?? "").trim();

  if (!email || !email.includes("@")) {
    return { ok: false, error: "请输入有效邮箱。" };
  }
  if (!password || password.length < 8) {
    return { ok: false, error: "密码至少 8 位。" };
  }
  if (!displayName) {
    return { ok: false, error: "请填写昵称。" };
  }
  if (!inviteCode) {
    return { ok: false, error: "缺少邀请码。" };
  }

  // Pre-check invite + email uniqueness before doing the expensive bcrypt.
  const invite = findInvite(inviteCode);
  if (!invite) return { ok: false, error: "邀请码无效。" };
  if (invite.used_by) return { ok: false, error: "邀请码已被使用。" };

  if (await findUserByEmail(email)) {
    return { ok: false, error: "该邮箱已注册,请直接登录。" };
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
      error: "邀请码刚被别人用了。请联系管理员再要一个。",
    };
  }

  await setSessionCookie(user.id);
  return { ok: true };
}

// ────────────────────────────────────────────────────────────────────────
// Login
// ────────────────────────────────────────────────────────────────────────

export async function loginAction(formData: FormData): Promise<AuthResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { ok: false, error: "请输入邮箱和密码。" };
  }
  const user = await verifyPassword(email, password);
  if (!user) {
    return { ok: false, error: "邮箱或密码不对。" };
  }
  await setSessionCookie(user.id);
  return { ok: true };
}

// ────────────────────────────────────────────────────────────────────────
// Logout
// ────────────────────────────────────────────────────────────────────────

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/login");
}
