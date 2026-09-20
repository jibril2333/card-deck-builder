"use client";

import { useTransition } from "react";
import { deleteDeckAction } from "@/app/[game]/actions";
import { useI18n } from "@/lib/i18n/client";

/**
 * Delete the deck. Lives at the bottom of the sidebar, under the stats —
 * furthest from the banner's inline edits, where a mis-click while renaming
 * would have been expensive.
 */
export function DeckDeleteButton({
  game,
  deckId,
  deckName,
}: {
  game: string;
  deckId: string;
  deckName: string;
}) {
  const { m } = useI18n();
  const [pending, startTransition] = useTransition();

  function onDelete() {
    if (!confirm(m.deck.confirmDelete(deckName))) return;
    const fd = new FormData();
    fd.set("game", game);
    fd.set("id", deckId);
    startTransition(async () => {
      await deleteDeckAction(fd);
    });
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={pending}
      className="w-full px-3 h-9 rounded-md text-sm border border-red-500/40 text-red-500 hover:bg-red-500/10 disabled:opacity-50 cursor-pointer transition-colors"
    >
      {pending ? m.deck.deleting : m.deck.deleteDeck}
    </button>
  );
}
