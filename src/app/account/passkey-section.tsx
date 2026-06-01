"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startRegistration } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/button";
import {
  beginRegisterPasskeyAction,
  deletePasskeyAction,
  finishRegisterPasskeyAction,
} from "@/lib/auth/passkey-actions";

type PasskeyRow = {
  id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
};

/**
 * The actual `navigator.credentials.create()` call has to happen in the
 * browser, so this is a client component. It drives the two-round-trip
 * WebAuthn ceremony:
 *   1. begin* server action → challenge + publicKey options
 *   2. browser invokes the authenticator (Touch ID, security key, …) and
 *      returns an attestation
 *   3. finish* server action → server stores the new credential
 *
 * Errors surface inline (red panel) rather than throwing, because users
 * routinely cancel the system prompt and that's not really an "error".
 */
export function PasskeySection({
  credentials,
}: {
  credentials: PasskeyRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");

  async function enroll() {
    setError(null);
    try {
      const { challengeId, options } = await beginRegisterPasskeyAction();
      const response = await startRegistration({ optionsJSON: options });
      startTransition(async () => {
        const r = await finishRegisterPasskeyAction({
          challengeId,
          response,
          label: label.trim() || undefined,
        });
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setLabel("");
        router.refresh();
      });
    } catch (e) {
      const msg = (e as Error).message ?? "Passkey 注册失败";
      // Browsers throw "NotAllowedError" when the user cancels — don't
      // make that look like a real error.
      if (msg.includes("NotAllowedError") || msg.includes("aborted")) {
        setError("取消了。");
      } else {
        setError(msg);
      }
    }
  }

  async function remove(id: string) {
    if (!confirm("确认删除这个 Passkey?之后必须用其它方式登录。")) return;
    startTransition(async () => {
      await deletePasskeyAction(id);
      router.refresh();
    });
  }

  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-5 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Passkey 登录</h2>
        <p className="text-xs text-[var(--color-muted-fg)] mt-1">
          用 Touch ID / Face ID / Windows Hello / 硬件密钥取代邮箱密码。
          一个账号可以绑多个 — 手机 + 笔记本各注册一个最稳。
        </p>
      </div>

      <div className="flex gap-2 items-end">
        <div className="flex-1 min-w-0">
          <label className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-fg)] block mb-1">
            名称(可选)
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="如:Mac Touch ID / iPhone"
            maxLength={40}
            className="w-full h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          />
        </div>
        <Button onClick={enroll} disabled={pending}>
          {pending ? "处理中…" : "＋ 添加 Passkey"}
        </Button>
      </div>

      {error ? (
        <div className="text-xs p-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {credentials.length === 0 ? (
        <div className="text-sm text-[var(--color-muted-fg)] py-4 text-center border border-dashed border-[var(--color-border)] rounded-md">
          还没注册 Passkey。
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)] -mx-5">
          {credentials.map((c) => (
            <li
              key={c.id}
              className="px-5 py-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{c.label}</div>
                <div className="text-[10px] text-[var(--color-muted-fg)] tabular-nums">
                  添加于 {c.created_at.slice(0, 10)}
                  {c.last_used_at ? (
                    <>
                      {" "}
                      · 上次使用 {c.last_used_at.slice(0, 10)}
                    </>
                  ) : (
                    " · 未使用"
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => remove(c.id)}
                disabled={pending}
                className="shrink-0 text-xs text-red-600 hover:text-red-700 dark:text-red-400 disabled:opacity-50 cursor-pointer"
              >
                删除
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
