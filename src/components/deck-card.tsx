"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adjustDeckCardAction,
  setDeckCardQuantityAction,
  setDeckCoverAction,
  adjustDeckCardPurchasedAction,
  setDeckCardPurchasedAction,
} from "@/app/[game]/actions";
import { colorHex } from "@/lib/games";
import { CardPriceInput } from "@/components/card-price-input";

export type DeckCardData = {
  id: string;
  code: string;
  name: string;
  color?: string | null;
  rarity?: string | null;
  image_url?: string | null;
  quantity: number;
  purchased: number;
  price: number | null;
};

export type DeckMode = "browse" | "build" | "purchase";

// A `dispatch` is a closure that turns a server-action call into a transition,
// optimistically patches the card row, then awaits + refreshes. Subcomponents
// only need this — they don't need to know about useTransition or the form data.
type Dispatch = (
  action: (fd: FormData) => Promise<void>,
  extra: Record<string, string>,
  optimistic?: Partial<DeckCardData>,
) => void;

export function DeckCard({
  game,
  deckId,
  card,
  isCover,
  mode,
  mine,
}: {
  game: string;
  deckId: string;
  card: DeckCardData;
  isCover: boolean;
  mode: DeckMode;
  /** True iff the deck is owned by the current user. Gates the cover ★ toggle
   *  so non-owners (friend viewing a shared deck) can't change someone else's
   *  cover. Always true when mode is build/purchase (those modes are owner-only). */
  mine: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const href = `/${game}/card/${card.code.split("/").map(encodeURIComponent).join("/")}`;

  // Optimistic copy of the card row. Lets +/- and the quantity/purchased
  // inputs update the number on screen the instant the user clicks, while the
  // Server Action runs in the background. If the action throws (caught by
  // error.tsx) React drops the optimistic state and we revert to `card`.
  const [optimisticCard, setOptimisticCard] = useOptimistic(
    card,
    (state: DeckCardData, patch: Partial<DeckCardData>): DeckCardData => ({
      ...state,
      ...patch,
    }),
  );

  const owned = optimisticCard.purchased;
  const want = optimisticCard.quantity;
  const done = mode === "purchase" && owned >= want;
  const missing = mode === "purchase" && owned < want;
  const none = mode === "purchase" && owned === 0;

  function toggleCover(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const fd = new FormData();
    fd.set("game", game);
    fd.set("deck_id", deckId);
    fd.set("card_id", isCover ? "" : card.id);
    startTransition(async () => {
      await setDeckCoverAction(fd);
      router.refresh();
    });
  }

  const dispatch: Dispatch = (action, extra, optimistic) => {
    const fd = new FormData();
    fd.set("game", game);
    fd.set("deck_id", deckId);
    fd.set("card_id", card.id);
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    startTransition(async () => {
      // setOptimistic must be called inside a transition (React 19 rule).
      if (optimistic) setOptimisticCard(optimistic);
      await action(fd);
      router.refresh();
    });
  };

  return (
    <div
      className={`group rounded-lg overflow-hidden border bg-[var(--color-card)] transition-colors ${
        done
          ? "border-green-500/60 ring-1 ring-green-500/30"
          : missing
            ? "border-amber-500/50"
            : "border-[var(--color-border)] hover:border-[var(--color-fg)]"
      } ${pending ? "opacity-90" : ""}`}
    >
      <Link href={href} className="block relative">
        <div className="card-thumb relative">
          <CardImage
            src={card.image_url}
            alt={card.name}
            mode={mode}
            none={none}
            missing={missing}
          />

          {mode === "purchase" ? (
            <PurchaseQtyBadge owned={owned} want={want} done={done} />
          ) : (
            <WantQtyBadge want={want} />
          )}

          {card.rarity ? <RarityBadge rarity={card.rarity} /> : null}

          {mine && (mode === "build" || mode === "browse") ? (
            <CoverToggleButton
              isCover={isCover}
              pending={pending}
              onToggle={toggleCover}
            />
          ) : done ? (
            <DoneCheckBadge />
          ) : null}

          {mode === "purchase" ? (
            <PurchaseProgressBar owned={owned} want={want} done={done} />
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
          </div>
          <div className="text-xs font-medium truncate group-hover:text-[var(--color-accent)]">
            {card.name}
          </div>
        </div>
      </Link>

      {mode === "browse" ? (
        card.price != null ? (
          <div className="px-2 pb-1.5 text-xs text-[var(--color-muted-fg)] tabular-nums">
            ¥{card.price}
          </div>
        ) : null
      ) : (
        <div className="px-2 pb-1.5">
          <CardPriceInput game={game} cardId={card.id} price={card.price} />
        </div>
      )}

      {mode === "build" ? (
        <BuildControlsBar
          want={want}
          pending={pending}
          dispatch={dispatch}
        />
      ) : mode === "purchase" ? (
        <PurchaseControlsBar
          want={want}
          owned={owned}
          done={done}
          pending={pending}
          dispatch={dispatch}
        />
      ) : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Image + image-overlay subcomponents
// ────────────────────────────────────────────────────────────────────────

function CardImage({
  src,
  alt,
  mode,
  none,
  missing,
}: {
  src?: string | null;
  alt: string;
  mode: DeckMode;
  none: boolean;
  missing: boolean;
}) {
  if (!src) {
    return (
      <div className="w-full h-full flex items-center justify-center text-[var(--color-muted-fg)] text-xs">
        no image
      </div>
    );
  }
  // In purchase mode, fade unbought cards (and fully grey out un-purchased)
  // so the user's eyes naturally skip the "done" stacks.
  const tint =
    mode === "purchase"
      ? none
        ? "opacity-30 grayscale"
        : missing
          ? "opacity-75"
          : ""
      : "";
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      className={tint}
    />
  );
}

function WantQtyBadge({ want }: { want: number }) {
  return (
    <span className="absolute top-1.5 left-1.5 px-2 py-0.5 text-xs rounded-md bg-black/75 text-white font-bold tabular-nums">
      ×{want}
    </span>
  );
}

function PurchaseQtyBadge({
  owned,
  want,
  done,
}: {
  owned: number;
  want: number;
  done: boolean;
}) {
  const bg = done ? "bg-green-600/90" : owned > 0 ? "bg-amber-600/90" : "bg-black/75";
  return (
    <span
      className={`absolute top-1.5 left-1.5 px-2 py-0.5 text-xs rounded-md text-white font-bold tabular-nums shadow ${bg}`}
    >
      {owned} / {want}
    </span>
  );
}

function RarityBadge({ rarity }: { rarity: string }) {
  return (
    <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 text-[10px] rounded-md bg-black/65 text-white font-medium">
      {rarity}
    </span>
  );
}

function CoverToggleButton({
  isCover,
  pending,
  onToggle,
}: {
  isCover: boolean;
  pending: boolean;
  onToggle: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={pending}
      title={isCover ? "已是封面（点击取消）" : "设为封面"}
      className={`absolute top-1.5 right-1.5 w-7 h-7 rounded-md flex items-center justify-center text-base transition-colors cursor-pointer ${
        isCover
          ? "bg-yellow-400 text-yellow-900 hover:bg-yellow-300"
          : "bg-black/55 text-white/60 hover:text-yellow-300 hover:bg-black/75"
      }`}
    >
      {isCover ? "★" : "☆"}
    </button>
  );
}

function DoneCheckBadge() {
  return (
    <span
      className="absolute top-1.5 right-1.5 w-7 h-7 rounded-md flex items-center justify-center bg-green-500 text-white text-sm font-bold shadow"
      title="已凑齐"
    >
      ✓
    </span>
  );
}

function PurchaseProgressBar({
  owned,
  want,
  done,
}: {
  owned: number;
  want: number;
  done: boolean;
}) {
  const pct = Math.min(100, (owned / Math.max(1, want)) * 100);
  return (
    <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
      <div
        className={done ? "h-full bg-green-500" : "h-full bg-amber-500"}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Controls-bar subcomponents (the bottom row of −/input/+/×|✓ buttons)
// ────────────────────────────────────────────────────────────────────────

function BuildControlsBar({
  want,
  pending,
  dispatch,
}: {
  want: number;
  pending: boolean;
  dispatch: Dispatch;
}) {
  return (
    <div className="flex items-stretch border-t border-[var(--color-border)] divide-x divide-[var(--color-border)]">
      <button
        type="button"
        onClick={() =>
          dispatch(
            adjustDeckCardAction,
            { delta: "-1" },
            { quantity: Math.max(0, want - 1) },
          )
        }
        disabled={pending}
        className="flex-1 h-8 hover:bg-[var(--color-muted)] text-sm cursor-pointer disabled:cursor-wait"
        title="−1"
      >
        −
      </button>
      <input
        type="number"
        min={0}
        defaultValue={want}
        key={`q-${want}`}
        onBlur={(e) => {
          const v = Math.max(0, Number(e.currentTarget.value));
          if (v !== want)
            dispatch(
              setDeckCardQuantityAction,
              { quantity: String(v) },
              { quantity: v },
            );
        }}
        className="w-10 h-8 text-center text-sm bg-transparent tabular-nums focus:outline-none focus:bg-[var(--color-muted)]"
      />
      <button
        type="button"
        onClick={() =>
          dispatch(
            adjustDeckCardAction,
            { delta: "1" },
            { quantity: want + 1 },
          )
        }
        disabled={pending}
        className="flex-1 h-8 hover:bg-[var(--color-muted)] text-sm cursor-pointer disabled:cursor-wait"
        title="+1"
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
        className="w-8 h-8 hover:bg-red-500/10 text-red-500 text-sm cursor-pointer disabled:cursor-wait"
        title="移除"
      >
        ×
      </button>
    </div>
  );
}

function PurchaseControlsBar({
  want,
  owned,
  done,
  pending,
  dispatch,
}: {
  want: number;
  owned: number;
  done: boolean;
  pending: boolean;
  dispatch: Dispatch;
}) {
  return (
    <div className="flex items-stretch border-t border-[var(--color-border)] divide-x divide-[var(--color-border)]">
      <button
        type="button"
        onClick={() =>
          dispatch(
            adjustDeckCardPurchasedAction,
            { delta: "-1" },
            { purchased: Math.max(0, owned - 1) },
          )
        }
        disabled={pending || owned === 0}
        className="flex-1 h-8 hover:bg-[var(--color-muted)] text-sm cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
        title="少买 1 张"
      >
        −
      </button>
      <input
        type="number"
        min={0}
        defaultValue={owned}
        key={`p-${owned}`}
        onBlur={(e) => {
          const v = Math.max(0, Number(e.currentTarget.value));
          if (v !== owned)
            dispatch(
              setDeckCardPurchasedAction,
              { purchased: String(v) },
              { purchased: v },
            );
        }}
        className="w-10 h-8 text-center text-sm bg-transparent tabular-nums focus:outline-none focus:bg-[var(--color-muted)]"
      />
      <button
        type="button"
        onClick={() =>
          dispatch(
            adjustDeckCardPurchasedAction,
            { delta: "1" },
            { purchased: owned + 1 },
          )
        }
        disabled={pending}
        className="flex-1 h-8 hover:bg-[var(--color-muted)] text-sm cursor-pointer disabled:cursor-wait"
        title="多买 1 张"
      >
        ＋
      </button>
      <button
        type="button"
        onClick={() =>
          dispatch(
            setDeckCardPurchasedAction,
            { purchased: String(want) },
            { purchased: want },
          )
        }
        disabled={pending || done}
        className="w-10 h-8 hover:bg-green-500/10 text-green-600 text-xs cursor-pointer disabled:opacity-40"
        title="凑齐（设为想要张数）"
      >
        ✓
      </button>
    </div>
  );
}
