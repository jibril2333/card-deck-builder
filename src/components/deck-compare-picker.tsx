"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

export type ComparableDeck = {
  id: string;
  name: string;
  accent_color: string;
  mine: boolean;
  owner_name: string | null;
};

/**
 * "Compare this deck with…" — the deck picker that used to live on the decks
 * list as a two-slot A/B panel.
 *
 * Picking happens here because this is where the question gets asked: you are
 * looking at a deck and want to know how another one differs from it. That
 * also removes the A/B bookkeeping — the deck you are on is A, always.
 *
 * Each item is a link to `?compare=<id>` on the current deck, so the diff is
 * server-rendered, survives a reload, and is shareable.
 */
export function DeckComparePicker({
  decks,
  current,
  hrefPrefix,
  clearHref,
}: {
  decks: ComparableDeck[];
  current: { id: string; name: string } | null;
  /** Current deck's URL up to and including `compare=`. */
  hrefPrefix: string;
  clearHref: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // A filter box earns its space once the list stops fitting in one glance.
  const filterable = decks.length > 8;
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return decks;
    return decks.filter(
      (d) =>
        d.name.toLowerCase().includes(needle) ||
        (d.owner_name ?? "").toLowerCase().includes(needle),
    );
  }, [decks, q]);

  return (
    <div ref={boxRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`px-3 h-8 max-w-[12rem] rounded-md text-sm border cursor-pointer flex items-center gap-1.5 transition-colors ${
          current
            ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
            : "border-[var(--color-border)] bg-[var(--color-card)] hover:bg-[var(--color-muted)]"
        }`}
        title="和另一副卡组比较"
      >
        <span className="shrink-0">🔀</span>
        <span className="truncate">{current ? current.name : "对比"}</span>
        <span
          aria-hidden
          className={`text-[9px] leading-none text-[var(--color-muted-fg)] transition-transform shrink-0 ${
            open ? "rotate-180" : ""
          }`}
        >
          ▼
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-full mt-1 z-30 w-64 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] shadow-lg overflow-hidden"
        >
          {filterable ? (
            <div className="p-1.5 border-b border-[var(--color-border)]">
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="筛选卡组"
                className="w-full h-7 px-2 rounded border border-[var(--color-border)] bg-[var(--color-bg)] text-xs outline-none focus:border-[var(--color-accent)]"
              />
            </div>
          ) : null}

          <div className="max-h-72 overflow-y-auto">
            {shown.length === 0 ? (
              <div className="px-3 py-4 text-xs text-[var(--color-muted-fg)] text-center">
                无匹配卡组
              </div>
            ) : (
              shown.map((d) => {
                const on = current?.id === d.id;
                return (
                  <Link
                    key={d.id}
                    role="menuitem"
                    href={on ? clearHref : hrefPrefix + encodeURIComponent(d.id)}
                    replace
                    scroll={false}
                    onClick={() => setOpen(false)}
                    className={`px-3 py-2 text-sm flex items-center gap-2 hover:bg-[var(--color-muted)] ${
                      on ? "bg-[var(--color-accent)]/10" : ""
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: d.accent_color }}
                    />
                    <span className="truncate flex-1">{d.name}</span>
                    {!d.mine && d.owner_name ? (
                      <span className="text-[10px] text-[var(--color-muted-fg)] shrink-0">
                        {d.owner_name}
                      </span>
                    ) : null}
                    {on ? (
                      <span className="text-[10px] text-[var(--color-muted-fg)] shrink-0">
                        取消
                      </span>
                    ) : null}
                  </Link>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
