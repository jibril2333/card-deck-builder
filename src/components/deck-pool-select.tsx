"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setDeckGroupsAction } from "@/app/[game]/actions";

export type PoolOption = { id: string; name: string };

/**
 * Which shared pool this deck draws its physical cards from.
 *
 * The join table allows a deck in several pools, but a deck is one stack of
 * real cardboard and it comes out of one box — so this is a single choice,
 * and picking one replaces whatever was there (`setDeckGroups` sets rather
 * than adds, so one id is all it takes).
 *
 * Pools are made on the decks page, next to the pools themselves; a deck page
 * is where you file a deck into one, not where you invent one. With no pools
 * to choose from there is nothing to say, so the control doesn't appear.
 */
export function DeckPoolSelect({
  game,
  deckId,
  pools,
  current,
}: {
  game: string;
  deckId: string;
  pools: PoolOption[];
  current: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(current ?? "");

  if (pools.length === 0) return null;

  function save(next: string) {
    setValue(next);
    start(async () => {
      const fd = new FormData();
      fd.set("game", game);
      fd.set("deck_id", deckId);
      if (next) fd.append("group_id", next);
      await setDeckGroupsAction(fd);
      router.refresh();
    });
  }

  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      <select
        aria-label="共享卡池"
        value={value}
        disabled={pending}
        onChange={(e) => save(e.target.value)}
        title="同一个卡池里的卡组共用一套实体卡"
        className="h-8 max-w-[12rem] rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-2 text-sm cursor-pointer hover:bg-[var(--color-muted)] disabled:opacity-60"
      >
        <option value="">无卡池</option>
        {pools.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {/* The pool page is where the buy-list lives; from here it's one hop. */}
      {value ? (
        <Link
          href={`/${game}/groups/${value}`}
          aria-label="打开卡池"
          title="打开卡池"
          className="h-8 w-7 rounded-md text-sm text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] hover:bg-[var(--color-muted)] flex items-center justify-center"
        >
          →
        </Link>
      ) : null}
    </span>
  );
}
