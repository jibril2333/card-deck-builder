"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adjustDeckCardAction, setDeckCardQuantityAction } from "@/app/[game]/actions";
import { colorHex } from "@/lib/games";

export type DeckRowCard = {
  id: string;
  code: string;
  name: string;
  color?: string | null;
  rarity?: string | null;
  image_url?: string | null;
  quantity: number;
};

export function DeckRow({
  game,
  deckId,
  card,
}: {
  game: string;
  deckId: string;
  card: DeckRowCard;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Optimistic copy: only `quantity` mutates here, but keeping the same shape
  // as the prop makes the JSX read consistently.
  const [optimisticCard, setOptimisticCard] = useOptimistic(
    card,
    (state: DeckRowCard, patch: Partial<DeckRowCard>): DeckRowCard => ({
      ...state,
      ...patch,
    }),
  );
  const qty = optimisticCard.quantity;

  function dispatch(
    action: (fd: FormData) => Promise<void>,
    extra: Record<string, string>,
    optimistic?: Partial<DeckRowCard>,
  ) {
    const fd = new FormData();
    fd.set("game", game);
    fd.set("deck_id", deckId);
    fd.set("card_id", card.id);
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    startTransition(async () => {
      if (optimistic) setOptimisticCard(optimistic);
      await action(fd);
      router.refresh();
    });
  }

  return (
    <div
      className={`flex items-center gap-3 py-2 pr-2 pl-1 rounded-md ${pending ? "opacity-90" : ""}`}
    >
      <Link
        href={`/${game}/card/${card.code.split("/").map(encodeURIComponent).join("/")}`}
        className="w-10 shrink-0 rounded overflow-hidden border border-[var(--color-border)] hover:border-[var(--color-fg)] aspect-[5/7] bg-[var(--color-muted)]"
      >
        {card.image_url ? (
          <img
            src={card.image_url}
            alt={card.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        ) : null}
      </Link>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-muted-fg)] font-mono">
          {card.color ? (
            <span
              className="chip-dot"
              style={{ background: colorHex(card.color) }}
            />
          ) : null}
          <span className="truncate">{card.code}</span>
          {card.rarity ? (
            <span className="px-1 rounded bg-[var(--color-muted)]">
              {card.rarity}
            </span>
          ) : null}
        </div>
        <Link
          href={`/${game}/card/${card.code.split("/").map(encodeURIComponent).join("/")}`}
          className="text-sm font-medium truncate hover:text-[var(--color-accent)] block"
        >
          {card.name}
        </Link>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() =>
            dispatch(
              adjustDeckCardAction,
              { delta: "-1" },
              { quantity: Math.max(0, qty - 1) },
            )
          }
          disabled={pending}
          className="w-7 h-7 rounded-md border border-[var(--color-border)] hover:bg-[var(--color-muted)] text-sm cursor-pointer disabled:cursor-wait"
        >
          −
        </button>
        <input
          type="number"
          min={0}
          defaultValue={qty}
          key={`q-${qty}`}
          onBlur={(e) => {
            const v = Math.max(0, Number(e.currentTarget.value));
            if (v !== qty)
              dispatch(
                setDeckCardQuantityAction,
                { quantity: String(v) },
                { quantity: v },
              );
          }}
          className="w-10 h-7 text-center text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        />
        <button
          type="button"
          onClick={() =>
            dispatch(adjustDeckCardAction, { delta: "1" }, { quantity: qty + 1 })
          }
          disabled={pending}
          className="w-7 h-7 rounded-md border border-[var(--color-border)] hover:bg-[var(--color-muted)] text-sm cursor-pointer disabled:cursor-wait"
        >
          ＋
        </button>
        <button
          type="button"
          onClick={() =>
            dispatch(
              setDeckCardQuantityAction,
              { quantity: "0" },
              { quantity: 0 },
            )
          }
          disabled={pending}
          title="移除"
          className="w-7 h-7 rounded-md hover:bg-red-500/10 text-red-500 text-sm cursor-pointer disabled:cursor-wait"
        >
          ×
        </button>
      </div>
    </div>
  );
}
