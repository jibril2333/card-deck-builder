import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { findInvite } from "@/lib/auth/repo";
import { RegisterForm } from "./register-form";

export const metadata = { title: "注册 · Card Deck Builder" };
export const dynamic = "force-dynamic";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
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
          <h1 className="text-2xl font-bold tracking-tight">注册</h1>
          <p className="text-sm text-[var(--color-muted-fg)] mt-1">
            需要邀请码才能注册。问管理员要一个。
          </p>
        </div>

        {inviteStatus === "invalid" ? (
          <div className="text-xs p-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300">
            邀请码不存在,请确认链接。
          </div>
        ) : inviteStatus === "used" ? (
          <div className="text-xs p-2 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300">
            这个邀请码已经被使用过了,请向管理员要一个新的。
          </div>
        ) : null}

        <RegisterForm initialInvite={codeFromUrl ?? ""} />

        <div className="text-xs text-[var(--color-muted-fg)] pt-4 border-t border-[var(--color-border)]">
          已经有账号?
          <Link
            href="/login"
            className="text-[var(--color-accent)] underline ml-1"
          >
            登录
          </Link>
        </div>
      </div>
    </main>
  );
}
