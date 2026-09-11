/**
 * `/api/v1/session` — log in, read the current account, log out.
 *
 * Login reuses the website's own check end to end: the same bcrypt compare,
 * the same email/address throttle, and the same 30-day `user.sessions` row.
 * There is no app-side password store to keep in step and no second place a
 * credential could be verified less carefully than the first.
 *
 * The token IS the session id. `DELETE` removes that one row, so signing out
 * on the phone leaves the browser signed in — two devices, two sessions.
 */

import { verifyPassword } from "@/lib/auth/repo";
import { createSession, deleteSession } from "@/lib/auth/repo";
import { findSession } from "@/lib/auth/repo";
import {
  addressFrom,
  checkLogin,
  describeWait,
  recordFailure,
  recordSuccess,
} from "@/lib/auth/throttle";
import { requireCaller } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { api, json, noContent, readJson } from "@/lib/api/handler";
import type { User } from "@/lib/auth/types";

export const dynamic = "force-dynamic";

function account(user: User) {
  return { id: user.id, display_name: user.display_name, email: user.email };
}

export const POST = api(async (req) => {
  const body = await readJson(req);
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    throw new ApiError("INVALID_INPUT", "请输入邮箱和密码。");
  }

  // Checked BEFORE the bcrypt compare, as on the website: the point is to
  // stop spending 200ms of CPU per guess, not only to refuse the answer.
  const keys = { email, address: addressFrom((n) => req.headers.get(n)) };
  const gate = checkLogin(keys);
  if (!gate.allowed) {
    throw new ApiError(
      "RATE_LIMITED",
      `尝试次数过多,请 ${describeWait(gate.retryAfterMs)}后再试。`,
      { "retry-after": String(Math.ceil(gate.retryAfterMs / 1000)) },
    );
  }

  const user = await verifyPassword(email, password);
  if (!user) {
    recordFailure(keys);
    // The same sentence whether the account exists or not.
    throw new ApiError("INVALID_CREDENTIALS", "邮箱或密码不对。");
  }
  recordSuccess(keys);

  const session = createSession(user.id);
  return json({
    account: account(user),
    expires_at: new Date(session.expires_at).toISOString(),
    token: session.id,
  });
});

export const GET = api(async (req) => {
  const { user, token } = await requireCaller(req);
  const session = findSession(token)!;
  return json({
    account: account(user),
    expires_at: new Date(session.expires_at).toISOString(),
  });
});

export const DELETE = api(async (req) => {
  const { token } = await requireCaller(req);
  deleteSession(token);
  return noContent();
});
