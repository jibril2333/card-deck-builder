"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adjustDeckCardAction } from "@/app/[game]/actions";

export type PoolCard = {
  id: string;
  code: string;
  name: string;
  image_url: string | null;
  rarity: string | null;
  /** Current quantity of THIS card in the deck (0 if not in it). */
  quantity: number;
};

/**
 * Slide-in "card pool" drawer for building a locked UA deck without leaving
 * the deck page. The pool is the full set of cards matching the deck's
 * locked 作品 + 颜色 (computed server-side and passed in), so everything
 * shown is a legal add. Each tile has inline +/- wired to the same server
 * actions the main deck grid uses.
 */
export function CardPoolDrawer({
  game,
  deckId,
  pool,
}: {
  game: string;
  deckId: string;
  pool: PoolCard[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [pending, startTransition] = useTransition();
  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries(pool.map((c) => [c.id, c.quantity])),
  );

  // Lock body scroll while the drawer is open + close on ESC.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return pool;
    return pool.filter(
      (c) =>
        c.name.toLowerCase().includes(f) || c.code.toLowerCase().includes(f),
    );
  }, [pool, filter]);

  const totalInDeck = useMemo(
    () => Object.values(qty).reduce((s, n) => s + n, 0),
    [qty],
  );

  function adjust(cardId: string, delta: number) {
    const cur = qty[cardId] ?? 0;
    const next = Math.max(0, cur + delta);
    if (next === cur) return;
    setQty((q) => ({ ...q, [cardId]: next }));
    const fd = new FormData();
    fd.set("game", game);
    fd.set("deck_id", deckId);
    fd.set("card_id", cardId);
    fd.set("delta", String(delta));
    startTransition(async () => {
      await adjustDeckCardAction(fd);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-9 px-3 rounded-md border border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-sm cursor-pointer flex items-center gap-1.5 hover:bg-[var(--color-accent)]/20 transition-colors"
        title="从该作品+颜色的卡池里快速加卡,不用去卡牌检索"
      >
        ＋ 加卡(卡池)
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <button
            type="button"
            aria-label="关闭卡池"
            onClick={() => setOpen(false)}
            className="flex-1 bg-black/40 cursor-default"
          />
          {/* Panel */}
          <div className="w-full sm:w-[440px] h-full bg-[var(--color-bg)] border-l border-[var(--color-border)] shadow-2xl flex flex-col">
            <header className="flex items-center gap-2 px-4 h-14 border-b border-[var(--color-border)] shrink-0">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">卡池</div>
                <div className="text-[11px] text-[var(--color-muted-fg)]">
                  共 {pool.length} 种 · 已放入{" "}
                  <b className="text-[var(--color-fg)] tabular-nums">
                    {totalInDeck}
                  </b>{" "}
                  张
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-md hover:bg-[var(--color-muted)] cursor-pointer text-[var(--color-muted-fg)] hover:text-[var(--color-fg)]"
                aria-label="关闭"
              >
                ✕
              </button>
            </header>

            <div className="px-4 py-2 border-b border-[var(--color-border)] shrink-0">
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="按卡名 / 编号筛选…"
                className="w-full h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                autoFocus
              />
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {filtered.length === 0 ? (
                <div className="text-sm text-[var(--color-muted-fg)] text-center py-12">
                  没有匹配的卡。
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {filtered.map((c) => {
                    const q = qty[c.id] ?? 0;
                    return (
                      <div
                        key={c.id}
                        className={`rounded-md border overflow-hidden bg-[var(--color-card)] ${
                          q > 0
                            ? "border-[var(--color-accent)]/60"
                            : "border-[var(--color-border)]"
                        }`}
                      >
                        <div className="relative aspect-[5/7] bg-[var(--color-muted)]">
                          {c.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={c.image_url}
                              alt={c.name}
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : null}
                          {q > 0 ? (
                            <span className="absolute top-1 left-1 px-1.5 py-0.5 text-[11px] rounded bg-black/75 text-white font-bold tabular-nums">
                              ×{q}
                            </span>
                          ) : null}
                          {c.rarity ? (
                            <span className="absolute bottom-1 right-1 px-1 py-0.5 text-[9px] rounded bg-black/65 text-white">
                              {c.rarity}
                            </span>
                          ) : null}
                        </div>
                        <div className="px-1.5 pt-1">
                          <div className="text-[10px] font-mono text-[var(--color-muted-fg)] truncate">
                            {c.code}
                          </div>
                          <div className="text-[11px] font-medium truncate leading-tight">
                            {c.name}
                          </div>
                        </div>
                        <div className="flex items-stretch mt-1 border-t border-[var(--color-border)] divide-x divide-[var(--color-border)]">
                          <button
                            type="button"
                            onClick={() => adjust(c.id, -1)}
                            disabled={pending || q === 0}
                            className="flex-1 h-7 text-sm hover:bg-[var(--color-muted)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            title="−1"
                          >
                            −
                          </button>
                          <span className="w-8 h-7 flex items-center justify-center text-xs tabular-nums">
                            {q}
                          </span>
                          <button
                            type="button"
                            onClick={() => adjust(c.id, +1)}
                            disabled={pending}
                            className="flex-1 h-7 text-sm hover:bg-[var(--color-muted)] cursor-pointer disabled:cursor-wait"
                            title="+1"
                          >
                            ＋
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
