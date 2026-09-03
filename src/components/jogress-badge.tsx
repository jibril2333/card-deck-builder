"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type JogressPairCard = {
  id: string;
  code: string;
  name: string;
  image_url: string | null;
};

/** One ジョグレス condition, already resolved against this deck. */
export type JogressView = {
  /** The condition in Chinese, e.g. "黄 Lv.6 ＋ 黑 Lv.6". */
  label: string;
  cost: number | null;
  /** Pairs of deck cards that satisfy it. Empty = the deck can't make it. */
  pairs: [JogressPairCard, JogressPairCard][];
  /** False when the requirement text couldn't be read — then `label` is the
   *  card's own Japanese wording and no pairs are claimed. */
  parsed: boolean;
};

/**
 * "联展 N" on a deck card that DNA digivolves, where N is how many pairs
 * ALREADY IN THIS DECK can make it. Clicking lists them.
 *
 * Zero is the interesting number, so it gets a colour rather than being
 * hidden: a deck holding the ACE and neither of its materials looks perfectly
 * fine in the grid, and nothing else on the page would ever tell you.
 *
 * Same shape as the 🔍 search badge next to it (fixed-position popover so it
 * escapes the tile's overflow clip, kept outside the card's <Link> so we're
 * not nesting anchors).
 */
export function JogressBadge({
  game,
  options,
}: {
  game: string;
  options: JogressView[];
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  const total = options.reduce((n, o) => n + o.pairs.length, 0);
  const none = total === 0;

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
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

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (open) {
      setOpen(false);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const W = 268;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - W - 8));
      setPos({ top: r.bottom + 4, left });
    }
    setOpen(true);
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-label="联展进化"
        title={
          none
            ? `联展进化:${options
                .map((o) => o.label)
                .join(" / ")} —— 本卡组里没有能凑出来的组合`
            : `联展进化:本卡组里有 ${total} 种组合`
        }
        className={`h-6 px-1.5 rounded-md text-[11px] font-bold flex items-center gap-0.5 cursor-pointer shadow transition-colors ${
          open
            ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]"
            : none
              ? "bg-amber-600/85 text-white hover:bg-amber-600"
              : "bg-black/70 text-white hover:bg-black/85"
        }`}
      >
        联展 {total}
      </button>

      {open && pos && typeof document !== "undefined" ? (
        // Rendered into <body>, not in place. The badge sits in a wrapper with
        // `z-20`, and that wrapper is its own stacking context — a popover
        // inside it can ask for any z-index it likes and still lose to the
        // hover preview (z-50) floating at the root. Opening this popover
        // means the pointer is ON the tile, so the preview is always up, and
        // it covered the list you just asked for.
        createPortal(
        <div
          ref={popRef}
          role="dialog"
          aria-label="联展组合"
          style={{ position: "fixed", top: pos.top, left: pos.left, width: 268 }}
          className="z-[60] max-h-80 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl p-2"
          onClick={(e) => e.preventDefault()}
        >
          {options.map((o, oi) => (
            <div key={oi} className={oi > 0 ? "mt-2" : ""}>
              <div className="flex items-baseline gap-1.5 px-1 pb-1 mb-1 border-b border-[var(--color-border)]">
                {options.length > 1 ? (
                  <span className="shrink-0 w-4 h-4 rounded-full bg-[var(--color-accent)]/15 text-[var(--color-accent)] text-[10px] font-bold flex items-center justify-center">
                    {oi + 1}
                  </span>
                ) : null}
                <span className="text-[11px] text-[var(--color-muted-fg)] break-words">
                  {o.label}
                  {o.cost !== null ? ` · 费用${o.cost}` : ""}
                </span>
              </div>

              {o.pairs.length === 0 ? (
                <div className="px-1 py-1 text-[11px] text-amber-600 dark:text-amber-400">
                  {o.parsed
                    ? "这副卡组里没有能凑出这个条件的两张卡"
                    : "这个条件的写法还没支持,请看卡面"}
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {o.pairs.map(([a, b], pi) => (
                    <div
                      key={pi}
                      className="flex items-center gap-1 p-1 rounded hover:bg-[var(--color-muted)]"
                    >
                      <PairCard game={game} card={a} />
                      <span className="shrink-0 text-[var(--color-muted-fg)] text-xs">
                        ＋
                      </span>
                      <PairCard game={game} card={b} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>,
        document.body,
        )
      ) : null}
    </>
  );
}

function PairCard({ game, card }: { game: string; card: JogressPairCard }) {
  return (
    <Link
      href={`/${game}/card/${card.code.split("/").map(encodeURIComponent).join("/")}`}
      className="flex items-center gap-1.5 min-w-0 flex-1"
    >
      <div className="w-6 shrink-0 aspect-[5/7] rounded overflow-hidden bg-[var(--color-muted)]">
        {card.image_url ? (
          <img
            src={card.image_url}
            alt={card.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        ) : null}
      </div>
      <div className="min-w-0">
        <div className="text-[9px] font-mono text-[var(--color-muted-fg)] truncate">
          {card.code}
        </div>
        <div className="text-[11px] truncate">{card.name}</div>
      </div>
    </Link>
  );
}
