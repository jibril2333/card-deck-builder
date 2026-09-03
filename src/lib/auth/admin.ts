import { getCurrentUser } from "./session";

/**
 * Whether the signed-in user may run privileged maintenance (right now: the
 * card-data refresh).
 *
 * The app is published to the internet through a Cloudflare tunnel and
 * accounts are handed out to friends, so "is logged in" is NOT a sufficient
 * gate — a refresh restarts the container and rewrites the card database.
 * Admins are named explicitly in CDB_ADMIN_EMAILS (comma-separated).
 *
 * Fails CLOSED: with the variable unset nobody is an admin, so forgetting to
 * configure it disables the button rather than exposing it to everyone.
 */
function adminEmails(): string[] {
  return (process.env.CDB_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function isAdmin(): Promise<boolean> {
  const allowed = adminEmails();
  if (allowed.length === 0) return false;
  const me = await getCurrentUser();
  if (!me?.email) return false;
  return allowed.includes(me.email.toLowerCase());
}
