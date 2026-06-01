"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adjustCardCollectionAction,
  setCardCollectionAction,
} from "@/app/[game]/actions";
import { colorHex } from "@/lib/games";
import { RestrictionBadge, type Restriction } from "@/components/restriction-badge";

/**
 * Per-card tile on the collection page. Shows the card image + a quantity
 * control (−/input/＋). No "delete" button — the minus alone will take qty to
 * zero, and the card stays in the grid because the page lists all cards
 * matching the active filters, not just owned ones.
 */
export type CollectionTileCard = {
  /** `cards.id` */
  card_id: string;
  code: string;
  name: string;
  color: string | null;
  rarity: string | null;
  image_url: string | null;
  /** "" base art; "_P1" / "_P2" … parallels (Digimon only — UA encodes alt
   *  art in `code` so this is always "" there). */
  variant: string;
};

export function CollectionTile({
  game,
  card,
  quantity,
  restriction,
}: {
  game: string;
  card: CollectionTileCard;
  quantity: number;
  /** Official banlist / limited-list restriction (renders a red/orange chip). */
  restriction?: Restriction | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimisticQty, setOptimisticQty] = useOptimistic(
    quantity,
    (_prev: number, next: number) => next,
  );

  function dispatch(
    action: (fd: FormData) => Promise<void>,
    extra: Record<string, string>,
    nextQty: number,
  ) {
    const fd = new FormData();
    fd.set("game", game);
    fd.set("card_id", card.card_id);
    fd.set("variant", card.variant);
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    startTransition(async () => {
      setOptimisticQty(nextQty);
      await action(fd);
      router.refresh();
    });
  }

  const qty = optimisticQty;
  // Link to card detail; use `?v=` for Digimon variant hint so the image
  // gallery defaults to the right alt-art.
  const href = `/${game}/card/${card.code
    .split("/")
    .map(encodeURIComponent)
    .join("/")}${card.variant ? `?v=${encodeURIComponent(card.variant)}` : ""}`;

  // Visible variant label: empty for base; trim leading underscore otherwise.
  const variantLabel = card.variant ? card.variant.replace(/^_/, "") : "";

  return (
    <div
      className={`group rounded-lg overflow-hidden border bg-[var(--color-card)] transition-colors ${
        qty > 0
          ? "border-[var(--color-accent)]/40"
          : "border-[var(--color-border)] hover:border-[var(--color-fg)]"
      } ${pending ? "opacity-90" : ""}`}
    >
      <Link href={href} className="block relative">
        <div className="card-thumb relative">
          {card.image_url ? (
            <img
              src={card.image_url}
              alt={card.name}
              loading="lazy"
              referrerPolicy="no-referrer"
              className={qty === 0 ? "opacity-60" : ""}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[var(--color-muted-fg)] text-xs">
              no image
            </div>
          )}
          {qty > 0 ? (
            <span className="absolute top-1.5 left-1.5 px-2 py-0.5 text-xs rounded-md bg-[var(--color-accent)]/90 text-white font-bold tabular-nums shadow">
              ×{qty}
            </span>
          ) : null}
          {variantLabel ? (
            <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 text-[10px] rounded-md bg-purple-600/85 text-white font-bold">
              {variantLabel}
            </span>
          ) : card.rarity ? (
            <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 text-[10px] rounded-md bg-black/65 text-white font-medium">
              {card.rarity}
            </span>
          ) : null}
          {variantLabel && card.rarity ? (
            <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 text-[10px] rounded-md bg-black/65 text-white font-medium">
              {card.rarity}
            </span>
          ) : null}
          {restriction ? (
            <RestrictionBadge
              restriction={restriction}
              className="absolute bottom-1.5 left-1.5"
            />
          ) : null}
        </div>
        <div className="px-2 py-1.5">
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-muted-fg)] font-mono">
            {card.color ? (
              <span
                className="chip-dot shrink-0"
                style={{ background: colorHex(card.color) }}
              />
            ) : null}
            <span className="truncate">{card.code}</span>
            {variantLabel ? (
              <span className="text-[var(--color-accent)]">{variantLabel}</span>
            ) : null}
          </div>
          <div className="text-xs font-medium truncate group-hover:text-[var(--color-accent)]">
            {card.name}
          </div>
        </div>
      </Link>

      <div className="flex items-stretch border-t border-[var(--color-border)] divide-x divide-[var(--color-border)]">
        <button
          type="button"
          onClick={() =>
            dispatch(
              adjustCardCollectionAction,
              { delta: "-1" },
              Math.max(0, qty - 1),
            )
          }
          disabled={pending || qty === 0}
          className="flex-1 h-8 hover:bg-[var(--color-muted)] text-sm cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
          title="−1"
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
              dispatch(setCardCollectionAction, { quantity: String(v) }, v);
          }}
          className="w-12 h-8 text-center text-sm bg-transparent tabular-nums focus:outline-none focus:bg-[var(--color-muted)]"
        />
        <button
          type="button"
          onClick={() =>
            dispatch(adjustCardCollectionAction, { delta: "1" }, qty + 1)
          }
          disabled={pending}
          className="flex-1 h-8 hover:bg-[var(--color-muted)] text-sm cursor-pointer disabled:cursor-wait"
          title="+1"
        >
          ＋
        </button>
      </div>
    </div>
  );
}
