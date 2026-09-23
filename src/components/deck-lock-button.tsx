"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDeckLockedAction } from "@/app/[game]/actions";
import { useI18n } from "@/lib/i18n/client";

/**
 * Close a finished deck to edits.
 *
 * For the list you've registered for a tournament, or a build you're done
 * arguing with. The threat isn't malice — it's the phone lying on the table
 * between games, and 加入卡组 on a card page two taps from anywhere.
 *
 * The button is the only control that keeps working while locked; everything
 * else on the page disappears rather than erroring, and the server refuses the
 * write regardless (see `assertUnlocked`).
 */
export function DeckLockButton({
  game,
  deckId,
  locked,
}: {
  game: string;
  deckId: string;
  locked: boolean;
}) {
  const { m } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();

  function toggle() {
    start(async () => {
      const fd = new FormData();
      fd.set("game", game);
      fd.set("id", deckId);
      fd.set("locked", locked ? "0" : "1");
      await setDeckLockedAction(fd);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={locked}
      title={
        locked
          ? m.deck.lockedLongTitle
          : m.deck.lockTitle
      }
      className={`h-8 px-3 rounded-md text-sm cursor-pointer border transition-colors disabled:opacity-50 ${
        locked
          ? "border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25"
          : "border-[var(--color-border)] hover:bg-[var(--color-muted)]"
      }`}
    >
      {locked ? m.deck.lockedBadge : m.deck.lockButton}
    </button>
  );
}
