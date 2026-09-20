"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { registerAction } from "@/lib/auth/actions";
import { useI18n } from "@/lib/i18n/client";

export function RegisterForm({ initialInvite }: { initialInvite: string }) {
  const { m } = useI18n();
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
          {m.auth.inviteCodeLabel}
        </span>
        <Input
          name="invite"
          required
          defaultValue={initialInvite}
          placeholder={m.auth.invitePlaceholder}
          autoComplete="off"
          spellCheck={false}
          className="mt-1 font-mono"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-fg)]">
          {m.auth.nickname}
        </span>
        <Input
          name="display_name"
          required
          maxLength={40}
          placeholder={m.auth.nicknamePlaceholder}
          className="mt-1"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-fg)]">
          {m.auth.email}
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
          {m.auth.password}
        </span>
        <Input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder={m.auth.passwordPlaceholder}
          className="mt-1"
        />
      </label>

      {error ? (
        <div className="text-xs p-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? m.auth.registering : m.auth.register}
      </Button>
    </form>
  );
}
