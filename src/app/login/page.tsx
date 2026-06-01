import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "登录 · Card Deck Builder" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // If already logged in, redirect away from the login screen.
  const user = await getCurrentUser();
  if (user) redirect("/");

  const { next } = await searchParams;

  return (
    <main className="w-full mx-auto max-w-md px-4 py-16">
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">登录</h1>
          <p className="text-sm text-[var(--color-muted-fg)] mt-1">
            Card Deck Builder
          </p>
        </div>

        <LoginForm next={next} />

        <div className="text-xs text-[var(--color-muted-fg)] pt-4 border-t border-[var(--color-border)]">
          还没有账号?需要先有
          <Link
            href="/register"
            className="text-[var(--color-accent)] underline mx-1"
          >
            邀请码
          </Link>
          才能注册。问管理员要一个。
        </div>
      </div>
    </main>
  );
}
