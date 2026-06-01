"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  adjustDeckCardAction,
  setDeckCardQuantityAction,
  createDeckQuietAction,
} from "@/app/[game]/actions";

type DeckEntry = {
  id: string;
  name: string;
  accent_color: string;
  accent_color2: string | null;
  card_qty: number;
  total: number;
};

export function AddToDeck({
  game,
  cardId,
  decks,
}: {
  game: string;
  cardId: string;
  decks: DeckEntry[];
}) {
  return (
    <div className="space-y-3">
      <div className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-fg)]">
        添加到卡组
      </div>

      {decks.length === 0 ? (
        <div className="text-xs text-[var(--color-muted-fg)] py-2">
          还没有卡组，下面新建一个吧。
        </div>
      ) : (
        <div className="divide-y divide-[var(--color-border)] -mx-3 border-y border-[var(--color-border)]">
          {decks.map((d) => (
            <DeckEntryRow
              key={d.id}
              game={game}
              cardId={cardId}
              deck={d}
            />
          ))}
        </div>
      )}

      <NewDeckForm game={game} />
    </div>
  );
}

function DeckEntryRow({
  game,
  cardId,
  deck,
}: {
  game: string;
  cardId: string;
  deck: DeckEntry;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Optimistic view of this row. We only care about card_qty + total here;
  // both update locally so the user sees their click immediately.
  const [optimisticDeck, setOptimisticDeck] = useOptimistic(
    deck,
    (state: DeckEntry, patch: Partial<DeckEntry>): DeckEntry => ({
      ...state,
      ...patch,
    }),
  );
  const qty = optimisticDeck.card_qty;
  const total = optimisticDeck.total;

  function adjust(delta: number) {
    const fd = new FormData();
    fd.set("game", game);
    fd.set("deck_id", deck.id);
    fd.set("card_id", cardId);
    fd.set("delta", String(delta));
    const nextQty = Math.max(0, qty + delta);
    // Adjust the deck total in step so the "卡组共 N 张" counter doesn't lag.
    const nextTotal = Math.max(0, total + (nextQty - qty));
    startTransition(async () => {
      setOptimisticDeck({ card_qty: nextQty, total: nextTotal });
      await adjustDeckCardAction(fd);
      router.refresh();
    });
  }
  function setQty(q: number) {
    const fd = new FormData();
    fd.set("game", game);
    fd.set("deck_id", deck.id);
    fd.set("card_id", cardId);
    const v = Math.max(0, q);
    fd.set("quantity", String(v));
    const nextTotal = Math.max(0, total + (v - qty));
    startTransition(async () => {
      setOptimisticDeck({ card_qty: v, total: nextTotal });
      await setDeckCardQuantityAction(fd);
      router.refresh();
    });
  }

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 ${
        pending ? "opacity-90" : ""
      } ${qty > 0 ? "bg-[var(--color-accent)]/5" : ""}`}
    >
      <span
        aria-hidden
        className="w-1.5 h-8 rounded-full shrink-0"
        style={{
          background: deck.accent_color2
            ? `linear-gradient(180deg, ${deck.accent_color}, ${deck.accent_color2})`
            : deck.accent_color,
        }}
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{deck.name}</div>
        <div className="text-[10px] text-[var(--color-muted-fg)] tabular-nums">
          已有 <b className="text-[var(--color-fg)]">{qty}</b> 张 · 卡组共 {total} 张
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => adjust(-1)}
          disabled={pending || qty === 0}
          className="w-7 h-7 rounded-md border border-[var(--color-border)] hover:bg-[var(--color-muted)] text-sm cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
          title="−1"
        >
          −
        </button>
        <input
          type="number"
          min={0}
          defaultValue={qty}
          key={qty}
          onBlur={(e) => {
            const v = Number(e.currentTarget.value);
            if (v !== qty) setQty(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="w-10 h-7 text-center text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        />
        <button
          type="button"
          onClick={() => adjust(1)}
          disabled={pending}
          className="w-7 h-7 rounded-md border border-[var(--color-border)] hover:bg-[var(--color-muted)] text-sm cursor-pointer disabled:cursor-wait"
          title="+1"
        >
          ＋
        </button>
      </div>
    </div>
  );
}

function NewDeckForm({ game }: { game: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full h-9 rounded-md border border-dashed border-[var(--color-border)] text-sm text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] hover:border-[var(--color-fg)] cursor-pointer"
      >
        ＋ 新建卡组
      </button>
    );
  }

  return (
    <form
      action={(fd) => {
        fd.set("game", game);
        startTransition(async () => {
          await createDeckQuietAction(fd);
          setOpen(false);
          router.refresh();
        });
      }}
      className="flex gap-2"
    >
      <Input
        name="name"
        required
        autoFocus
        placeholder="卡组名…"
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "创建中…" : "创建"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setOpen(false)}
      >
        取消
      </Button>
    </form>
  );
}
