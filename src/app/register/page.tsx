import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { findInvite } from "@/lib/auth/repo";
import { RegisterForm } from "./register-form";
import { getMessages } from "@/lib/i18n/server";

export async function generateMetadata() {
  const m = await getMessages();
  return { title: `${m.auth.register} · DCG Deck Builder` };
}
export const dynamic = "force-dynamic";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const m = await getMessages();
  const user = await getCurrentUser();
  if (user) redirect("/");

  const { invite: codeFromUrl } = await searchParams;

  // Pre-check the invite from the URL so we can show a friendly error
  // before the user types anything. Code-in-form is still required server-side.
  let inviteStatus: "missing" | "invalid" | "used" | "ok" = "missing";
  if (codeFromUrl) {
    const inv = findInvite(codeFromUrl);
    if (!inv) inviteStatus = "invalid";
    else if (inv.used_by) inviteStatus = "used";
    else inviteStatus = "ok";
  }

  return (
    <main className="w-full mx-auto max-w-md px-4 py-16">
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{m.auth.register}</h1>
          <p className="text-sm text-[var(--color-muted-fg)] mt-1">
            {m.auth.registerIntro}
          </p>
        </div>

        {inviteStatus === "invalid" ? (
          <div className="text-xs p-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300">
            {m.auth.inviteNotFound}
          </div>
        ) : inviteStatus === "used" ? (
          <div className="text-xs p-2 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300">
            {m.auth.inviteAlreadyUsed}
          </div>
        ) : null}

        <RegisterForm initialInvite={codeFromUrl ?? ""} />

        <div className="text-xs text-[var(--color-muted-fg)] pt-4 border-t border-[var(--color-border)]">
          {m.auth.haveAccount}
          <Link
            href="/login"
            className="text-[var(--color-accent)] underline ml-1"
          >
            {m.auth.login}
          </Link>
        </div>
      </div>
    </main>
  );
}
