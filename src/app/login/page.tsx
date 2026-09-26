import Link from "next/link";
import { redirect } from "next/navigation";
import { safeReturnTo } from "@/lib/auth/return-to";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";
import { getMessages } from "@/lib/i18n/server";

export async function generateMetadata() {
  const m = await getMessages();
  return { title: `${m.auth.login} · DCG Deck Builder` };
}
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const m = await getMessages();
  const { next: rawNext } = await searchParams;
  const next = safeReturnTo(rawNext);
  // Already signed in: go where the link was taking you.
  const user = await getCurrentUser();
  if (user) redirect(next);

  return (
    <main className="w-full mx-auto max-w-md px-4 py-16">
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{m.auth.login}</h1>
          <p className="text-sm text-[var(--color-muted-fg)] mt-1">
            DCG Deck Builder
          </p>
        </div>

        <LoginForm next={next} />

        <div className="text-xs text-[var(--color-muted-fg)] pt-4 border-t border-[var(--color-border)]">
          {m.auth.noAccountBefore}
          <Link
            href="/register"
            className="text-[var(--color-accent)] underline mx-1"
          >
            {m.auth.inviteCode}
          </Link>
          {m.auth.noAccountAfter}
        </div>
      </div>
    </main>
  );
}
