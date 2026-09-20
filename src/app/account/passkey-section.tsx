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
import { useI18n } from "@/lib/i18n/client";

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
  const { m } = useI18n();
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
      const msg = (e as Error).message ?? m.account.passkeyRegisterFailed;
      // Browsers throw "NotAllowedError" when the user cancels — don't
      // make that look like a real error.
      if (msg.includes("NotAllowedError") || msg.includes("aborted")) {
        setError(m.account.cancelled);
      } else {
        setError(msg);
      }
    }
  }

  async function remove(id: string) {
    if (!confirm(m.account.confirmDeletePasskey)) return;
    startTransition(async () => {
      await deletePasskeyAction(id);
      router.refresh();
    });
  }

  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold">{m.account.passkeyHeading}</h2>
      </div>

      <div className="flex gap-2 items-end">
        <div className="flex-1 min-w-0">
          <label
            htmlFor="passkey-label"
            className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-fg)] block mb-1"
          >
            {m.account.nameOptional}
          </label>
          <input
            id="passkey-label"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={m.account.passkeyNamePlaceholder}
            maxLength={40}
            className="w-full h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          />
        </div>
        <Button onClick={enroll} disabled={pending}>
          {pending ? m.account.working : m.account.addPasskey}
        </Button>
      </div>

      {error ? (
        <div className="text-xs p-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {credentials.length === 0 ? (
        <div className="text-sm text-[var(--color-muted-fg)] py-4 text-center border border-dashed border-[var(--color-border)] rounded-md">
          {m.account.noPasskeys}
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
                  {m.account.addedOn(c.created_at.slice(0, 10))}
                  {c.last_used_at ? (
                    <>
                      {" "}
                      {m.account.lastUsed(c.last_used_at.slice(0, 10))}
                    </>
                  ) : (
                    m.account.neverUsed
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => remove(c.id)}
                disabled={pending}
                className="shrink-0 text-xs text-red-600 hover:text-red-700 dark:text-red-400 disabled:opacity-50 cursor-pointer"
              >
                {m.account.delete}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
