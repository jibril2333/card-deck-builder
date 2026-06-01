"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { registerAction } from "@/lib/auth/actions";

export function RegisterForm({ initialInvite }: { initialInvite: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await registerAction(formData);
      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <form action={onSubmit} className="space-y-3">
      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-fg)]">
          邀请码
        </span>
        <Input
          name="invite"
          required
          defaultValue={initialInvite}
          placeholder="一串字母数字"
          autoComplete="off"
          spellCheck={false}
          className="mt-1 font-mono"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-fg)]">
          昵称
        </span>
        <Input
          name="display_name"
          required
          maxLength={40}
          placeholder="给自己起个名字"
          className="mt-1"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-fg)]">
          邮箱
        </span>
        <Input
          name="email"
          type="email"
          required
          autoComplete="email"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          className="mt-1"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-fg)]">
          密码
        </span>
        <Input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="至少 8 位"
          className="mt-1"
        />
      </label>

      {error ? (
        <div className="text-xs p-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "注册中…" : "注册"}
      </Button>
    </form>
  );
}
