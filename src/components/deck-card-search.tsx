"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adjustDeckCardAction,
  searchCardsAction,
  type CardPickerHit,
} from "@/app/[game]/actions";

/**
 * Search-and-add box for build mode.
 *
 * Before this, the only way to put a card in a deck was to leave the page,
 * find it in the card browser, and use the "add to deck" widget there — one
 * round trip per card, which is painful when you're assembling 50 of them.
 *
 * Results stay open after a click so you can add several copies (or several
 * cards from one search) without retyping. Each row shows how many copies the
 * deck already holds; the server still clamps to the legal limit, so a click
 * that would exceed it simply doesn't move the count.
 */
export function DeckCardSearch({
  game,
  deckId,
  lang,
}: {
  game: string;
  deckId: string;
  lang: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CardPickerHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced lookup. All state changes happen inside the timeout — setting
  // state synchronously in an effect body cascades renders.
  useEffect(() => {
    const query = q.trim();
    let cancelled = false;
    const t = setTimeout(async () => {
      if (query.length < 2) {
        if (!cancelled) setHits([]);
        return;
      }
      if (!cancelled) setSearching(true);
      try {
        const r = await searchCardsAction(game, query, { lang, deckId });
        if (!cancelled) {
          setHits(r);
          setOpen(true);
        }
      } catch {
        if (!cancelled) setHits([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, game, lang, deckId]);

  // Click-away closes the results without clearing the query, so re-focusing
  // the box brings the same list back.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function add(cardId: string, delta: number) {
    const fd = new FormData();
    fd.set("game", game);
    fd.set("deck_id", deckId);
    fd.set("card_id", cardId);
    fd.set("delta", String(delta));
    // Optimistic local bump so repeated clicks feel immediate; the refresh
    // below replaces it with whatever the server actually allowed.
    setHits((hs) =>
      hs.map((h) =>
        h.id === cardId
          ? { ...h, in_deck: Math.max(0, h.in_deck + delta) }
          : h,
      ),
    );
    startTransition(async () => {
      await adjustDeckCardAction(fd);
      router.refresh();
    });
  }

  return (
    <div ref={boxRef} className="relative mt-3">
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-fg)] text-sm">
          🔍
        </span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="搜卡片加入这个卡组（名称或编号）…"
          className="w-full h-10 pl-9 pr-3 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] text-sm"
        />
      </div>

      {open && q.trim().length >= 2 ? (
        <div className="absolute z-30 left-0 right-0 mt-1 max-h-96 overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl">
          {searching && hits.length === 0 ? (
            <div className="px-3 py-3 text-xs text-[var(--color-muted-fg)]">
              搜索中…
            </div>
          ) : hits.length === 0 ? (
            <div className="px-3 py-3 text-xs text-[var(--color-muted-fg)]">
              没有匹配的卡
            </div>
          ) : (
            hits.map((h) => (
              <div
                key={h.id}
                className="flex items-center gap-2.5 px-2 py-1.5 hover:bg-[var(--color-muted)] border-b border-[var(--color-border)] last:border-b-0"
              >
                {h.image_url ? (
                  <img
                    src={h.image_url}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="w-10 aspect-[5/7] object-cover rounded shrink-0"
                  />
                ) : (
                  <span className="w-10 aspect-[5/7] rounded bg-[var(--color-muted)] shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{h.name}</div>
                  <div className="text-[11px] font-mono text-[var(--color-muted-fg)]">
                    {h.code}
                  </div>
                </div>
                {h.in_deck > 0 ? (
                  <>
                    <span className="text-xs tabular-nums text-[var(--color-accent)] font-semibold">
                      ×{h.in_deck}
                    </span>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => add(h.id, -1)}
                      aria-label={`从卡组减少一张 ${h.name}`}
                      className="w-7 h-7 rounded border border-[var(--color-border)] hover:border-[var(--color-fg)] cursor-pointer disabled:opacity-40 text-sm"
                    >
                      −
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => add(h.id, 1)}
                  aria-label={`加入卡组 ${h.name}`}
                  className="w-7 h-7 rounded bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-bold cursor-pointer disabled:opacity-40 text-sm"
                >
                  ＋
                </button>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
