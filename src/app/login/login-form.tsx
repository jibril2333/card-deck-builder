"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startAuthentication } from "@simplewebauthn/browser";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { loginAction } from "@/lib/auth/actions";
import {
  beginLoginWithPasskeyAction,
  finishLoginWithPasskeyAction,
} from "@/lib/auth/passkey-actions";

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await loginAction(formData);
      if (res.ok) {
        // Successful login set the session cookie server-side. Navigate to
        // the post-login destination, defaulting to the digimon home.
        router.push(next ?? "/");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  async function onPasskey() {
    setError(null);
    try {
      const { challengeId, options } = await beginLoginWithPasskeyAction();
      // `useBrowserAutofill: false` because the autofill flow needs an
      // <input autocomplete="webauthn"> + conditional UI; the explicit
      // button flow is simpler and more reliable across browsers.
      const response = await startAuthentication({ optionsJSON: options });
      startTransition(async () => {
        const r = await finishLoginWithPasskeyAction({
          challengeId,
          response,
        });
        if (!r.ok) {
          setError(r.error);
          return;
        }
        router.push(next ?? "/");
        router.refresh();
      });
    } catch (e) {
      const msg = (e as Error).message ?? "Passkey 登录失败";
      if (msg.includes("NotAllowedError") || msg.includes("aborted")) {
        setError("取消了。");
      } else {
        setError(msg);
      }
    }
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        onClick={onPasskey}
        disabled={pending}
        variant="outline"
        className="w-full"
      >
        {pending ? "处理中…" : "🔑 使用 Passkey 登录"}
      </Button>

      <div className="flex items-center gap-3 text-[10px] uppercase tracking-wide text-[var(--color-muted-fg)]">
        <span className="flex-1 h-px bg-[var(--color-border)]" />
        <span>或邮箱密码</span>
        <span className="flex-1 h-px bg-[var(--color-border)]" />
      </div>

      <form action={onSubmit} className="space-y-3">
      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-fg)]">
          邮箱
        </span>
        <Input
          name="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
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
          autoComplete="current-password"
          minLength={8}
          className="mt-1"
        />
      </label>

      {error ? (
        <div className="text-xs p-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "登录中…" : "登录"}
      </Button>
      </form>
    </div>
  );
}
