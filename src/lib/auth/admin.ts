import { getCurrentUser } from "./session";
import { isAdminAccount } from "./repo";

/**
 * Whether the signed-in user may run privileged maintenance (right now: the
 * card-data refresh).
 *
 * The app is published to the internet through a Cloudflare tunnel and
 * accounts are handed out to friends, so "is logged in" is NOT a sufficient
 * gate — a refresh restarts the container and rewrites the card database.
 * Two ways to be one, checked in this order:
 *
 *   · named in CDB_ADMIN_EMAILS (comma-separated) — the deployment says who,
 *     and it keeps working if the account row is ever rebuilt from a backup;
 *   · `users.is_admin` on the account row — how the first-run bootstrap grants
 *     it, so a fresh install has an administrator without anyone having to
 *     know about the variable.
 *
 * Still fails CLOSED: no allowlist and no flag means nobody is an admin, so a
 * misconfiguration hides the buttons rather than exposing them.
 */
function adminEmails(): string[] {
  return (process.env.CDB_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function isAdmin(): Promise<boolean> {
  const me = await getCurrentUser();
  if (!me?.email) return false;
  const allowed = adminEmails();
  if (allowed.includes(me.email.toLowerCase())) return true;
  return isAdminAccount(me.id);
}
