"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createGroupAction, setDeckGroupsAction } from "@/app/[game]/actions";

export type PoolLite = {
  id: string;
  name: string;
  /** Accent dots of the decks already in it, for a glance at what's pooled. */
  decks: { id: string; accent_color: string; accent_color2: string | null }[];
};

/**
 * Put this deck into one of the user's shared pools, from the deck's own page.
 *
 * Membership could only be edited from a group before, which meant pooling a
 * deck you were looking at required knowing which group to open first. A deck
 * may sit in several pools — the join table is keyed on (group, deck) — so
 * these are toggles, not a single choice.
 *
 * Each toggle posts the WHOLE membership list, because the action sets rather
 * than adds; keeping the selection in local state is what makes that cheap.
 */
export function DeckPoolPicker({
  game,
  deckId,
  pools,
  memberOf,
}: {
  game: string;
  deckId: string;
  pools: PoolLite[];
  memberOf: string[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [selected, setSelected] = useOptimistic(memberOf);
  const [creating, setCreating] = useState(false);

  function toggle(groupId: string) {
    const next = selected.includes(groupId)
      ? selected.filter((id) => id !== groupId)
      : [...selected, groupId];
    startTransition(async () => {
      setSelected(next);
      const fd = new FormData();
      fd.set("game", game);
      fd.set("deck_id", deckId);
      for (const id of next) fd.append("group_id", id);
      await setDeckGroupsAction(fd);
      router.refresh();
    });
  }

  return (
    <div>
      <h3 className="text-sm font-semibold mb-1">🎴 共享卡池</h3>
      <p className="text-xs text-[var(--color-muted-fg)] mb-3 leading-snug">
        同一池里的卡组共用一套实体卡，只需按最费的那套备卡。
      </p>

      <div className="flex flex-wrap gap-1.5">
        {pools.map((p) => {
          const on = selected.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p.id)}
              aria-pressed={on}
              className={`inline-flex items-center gap-1.5 px-2.5 h-8 rounded-full border text-sm transition-colors cursor-pointer ${
                on
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-fg)]"
                  : "border-[var(--color-border)] hover:border-[var(--color-fg)] text-[var(--color-muted-fg)]"
              }`}
            >
              <span className="flex -space-x-1">
                {p.decks.slice(0, 4).map((d) => (
                  <span
                    key={d.id}
                    className="w-2.5 h-2.5 rounded-full ring-1 ring-[var(--color-card)]"
                    style={{
                      background: d.accent_color2
                        ? `linear-gradient(135deg, ${d.accent_color}, ${d.accent_color2})`
                        : d.accent_color,
                    }}
                  />
                ))}
              </span>
              {p.name}
              {on ? <span className="text-[var(--color-accent)]">✓</span> : null}
            </button>
          );
        })}

        {creating ? (
          <form
            action={createGroupAction}
            className="inline-flex items-center gap-1"
          >
            <input type="hidden" name="game" value={game} />
            {/* Seeds the new pool with this deck — createGroupAction reads
                deck_id and redirects to the pool it just made. */}
            <input type="hidden" name="deck_id" value={deckId} />
            <input
              name="name"
              autoFocus
              placeholder="卡池名称"
              className="h-8 w-28 px-2 rounded-full border border-[var(--color-border)] bg-transparent text-sm"
            />
            <button
              type="submit"
              className="h-8 px-2.5 rounded-full border border-[var(--color-accent)] text-sm cursor-pointer"
            >
              建
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="h-8 px-2 text-sm text-[var(--color-muted-fg)] cursor-pointer"
            >
              取消
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center px-2.5 h-8 rounded-full border border-dashed border-[var(--color-border)] hover:border-[var(--color-fg)] text-sm text-[var(--color-muted-fg)] transition-colors cursor-pointer"
          >
            ＋ 新建卡池
          </button>
        )}
      </div>

      {/* A link out only once it's actually pooled — that page is where the
          buy-list lives, and it says nothing useful for an empty selection. */}
      {selected.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
          {pools
            .filter((p) => selected.includes(p.id))
            .map((p) => (
              <Link
                key={p.id}
                href={`/${game}/groups/${p.id}`}
                className="text-xs text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] underline underline-offset-2"
              >
                {p.name} 的备卡清单 →
              </Link>
            ))}
        </div>
      ) : null}
    </div>
  );
}
