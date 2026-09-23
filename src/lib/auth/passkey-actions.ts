"use server";

import { headers } from "next/headers";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import {
  beginAuthentication,
  beginRegistration,
  deleteCredential as repoDelete,
  finishAuthentication,
  finishRegistration,
} from "./webauthn";
import { requireUser } from "./session";
import { setSessionCookie } from "./session";
import { getMessages } from "@/lib/i18n/server";

/**
 * Extract `(origin, rpID)` from the inbound request. WebAuthn binds
 * credentials to the RP's hostname, so we read it per-request rather than
 * baking a build-time constant — the same code serves localhost in dev and
 * the Cloudflare-tunnel hostname in prod.
 *
 * Falls back to `localhost` if the headers are missing (shouldn't happen
 * in practice — Next always provides them for server actions).
 */
async function rpFromRequest(): Promise<{ rpID: string; origin: string }> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  // rpID is the registrable domain, NO port, NO scheme.
  const rpID = host.split(":")[0];
  const origin = `${proto}://${host}`;
  return { rpID, origin };
}

/**
 * A ceremony the server refused, in the container log.
 *
 * The reason also goes back to the browser, but only the person at that
 * browser sees it. "User verification required, but user could not be
 * verified" (2026-09) took a round trip through the user to diagnose,
 * because the server had said nothing. Logged: which ceremony, the reason,
 * the origin, the browser. Not logged: the credential, the challenge, or
 * anything else a replay could use.
 */
async function logRefusal(
  ceremony: "register" | "login",
  reason: string,
  origin: string,
): Promise<void> {
  const ua = (await headers()).get("user-agent") ?? "-";
  console.error(
    `[passkey] ${ceremony} refused: ${reason} · origin=${origin} · ua=${ua}`,
  );
}

// ────────────────────────────────────────────────────────────────────────
// Registration (binds a new passkey to the currently-logged-in user)
// ────────────────────────────────────────────────────────────────────────

export async function beginRegisterPasskeyAction() {
  const me = await requireUser();
  const { rpID } = await rpFromRequest();
  return beginRegistration(
    { id: me.id, email: me.email, display_name: me.display_name },
    rpID,
  );
}

export async function finishRegisterPasskeyAction(input: {
  challengeId: string;
  response: RegistrationResponseJSON;
  label?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireUser(); // must be logged in to bind
  const { rpID, origin } = await rpFromRequest();
  const r = await finishRegistration({
    challengeId: input.challengeId,
    response: input.response,
    expectedOrigin: origin,
    expectedRPID: rpID,
    label: input.label,
    singleDeviceLabel: (await getMessages()).account.thisDevice,
  });
  if (!r.ok) {
    await logRefusal("register", r.error, origin);
    return { ok: false, error: r.error };
  }
  return { ok: true };
}

export async function deletePasskeyAction(credentialDbId: string) {
  const me = await requireUser();
  repoDelete(credentialDbId, me.id);
}

// ────────────────────────────────────────────────────────────────────────
// Authentication (login flow)
// ────────────────────────────────────────────────────────────────────────

export async function beginLoginWithPasskeyAction() {
  const { rpID } = await rpFromRequest();
  return beginAuthentication(rpID);
}

export async function finishLoginWithPasskeyAction(input: {
  challengeId: string;
  response: AuthenticationResponseJSON;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { rpID, origin } = await rpFromRequest();
  const r = await finishAuthentication({
    challengeId: input.challengeId,
    response: input.response,
    expectedOrigin: origin,
    expectedRPID: rpID,
  });
  if (!r.ok) {
    await logRefusal("login", r.error, origin);
    return { ok: false, error: r.error };
  }
  await setSessionCookie(r.user_id);
  return { ok: true };
}
