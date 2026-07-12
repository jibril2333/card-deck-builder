"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPoolCardOwnedAction } from "@/app/[game]/actions";

/**
 * +/- stepper for a card's SHARED held count in a pool. Writing here sets the
 * pooled held, which the server re-applies to every member deck's `purchased`
 * (each capped at its own quantity). Optimistic so taps feel instant.
 */
export function PoolHeldStepper({
  game,
  groupId,
  cardId,
  owned,
  need,
}: {
  game: string;
  groupId: string;
  cardId: string;
  owned: number;
  need: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(owned);

  function set(value: number) {
    const v = Math.max(0, Math.min(need, value));
    if (v === optimistic) return;
    startTransition(async () => {
      setOptimistic(v);
      const fd = new FormData();
      fd.set("game", game);
      fd.set("group_id", groupId);
      fd.set("card_id", cardId);
      fd.set("owned", String(v));
      await setPoolCardOwnedAction(fd);
      router.refresh();
    });
  }

  const full = optimistic >= need;
  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => set(optimistic - 1)}
        disabled={optimistic <= 0}
        className="w-6 h-6 rounded border border-[var(--color-border)] text-sm leading-none disabled:opacity-30 hover:bg-[var(--color-muted)] cursor-pointer"
        aria-label="少一张"
      >
        −
      </button>
      <span
        className={`w-9 text-center tabular-nums text-sm ${
          full ? "text-green-600 font-semibold" : ""
        }`}
      >
        {optimistic}/{need}
      </span>
      <button
        type="button"
        onClick={() => set(optimistic + 1)}
        disabled={full}
        className="w-6 h-6 rounded border border-[var(--color-border)] text-sm leading-none disabled:opacity-30 hover:bg-[var(--color-muted)] cursor-pointer"
        aria-label="多一张"
      >
        ＋
      </button>
    </div>
  );
}
