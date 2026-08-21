"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type MissingCard = {
  code: string;
  name: string;
  image_url: string | null;
  need: number;
};

export type DeckShortfall = {
  id: string;
  name: string;
  accent_color: string;
  accent_color2: string | null;
  cover_image_url: string | null;
  missing: MissingCard[];
};

/**
 * Panel-only controlled component. Parent owns open/close state and decides
 * placement. When mounted, this component renders the full-width panel; when
 * the user dismisses it, `onClose` is invoked.
 *
 * Only 主力卡组 are offered. The question this answers is "what do I buy
 * next", and that is asked about the decks you actually intend to play — a
 * list of every deck you have ever made buries them, and starring a deck is
 * already how you say which those are. With none starred the parent doesn't
 * render the button at all.
 *
 * Picked by cover art, the same way the pool's member picker does it: a deck
 * is recognised by its art long before its name is read.
 */
export function MissingCardsTool({
  game,
  decks,
  onClose,
}: {
  game: string;
  decks: DeckShortfall[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Aggregate missing cards across selected decks, grouped by code
  const aggregate = useMemo(() => {
    const map = new Map<
      string,
      { code: string; name: string; image_url: string | null; need: number }
    >();
    for (const d of decks) {
      if (!selected.has(d.id)) continue;
      for (const c of d.missing) {
        const cur = map.get(c.code);
        if (cur) cur.need += c.need;
        else
          map.set(c.code, {
            code: c.code,
            name: c.name,
            image_url: c.image_url,
            need: c.need,
          });
      }
    }
    return [...map.values()].sort((a, b) =>
      b.need !== a.need ? b.need - a.need : a.code.localeCompare(b.code),
    );
  }, [decks, selected]);

  const totalCards = aggregate.reduce((s, c) => s + c.need, 0);
  const totalKinds = aggregate.length;

  function copyList() {
    const text = aggregate
      .map((c) => `${c.need} ${c.code} ${c.name}`)
      .join("\n");
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(text + "\n").then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }

  return (
    <section
      aria-label="缺卡统计"
      className="mb-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">🛒 缺卡统计</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] text-sm cursor-pointer"
        >
          ×
        </button>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2">
        {decks.map((d) => {
          const on = selected.has(d.id);
          const deckMissing = d.missing.reduce((s, c) => s + c.need, 0);
          return (
            <label
              key={d.id}
              title={d.name}
              className={`group relative rounded-lg border overflow-hidden cursor-pointer transition-all ${
                on
                  ? "border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/40"
                  : "border-[var(--color-border)] hover:border-[var(--color-fg)]"
              }`}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggle(d.id)}
                className="sr-only"
              />
              <div className="card-thumb relative">
                {d.cover_image_url ? (
                  <img
                    src={d.cover_image_url}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    draggable={false}
                    className={on ? "" : "opacity-55 group-hover:opacity-80"}
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center"
                    style={{
                      background: d.accent_color2
                        ? `linear-gradient(135deg, ${d.accent_color}55, ${d.accent_color2}55)`
                        : `linear-gradient(135deg, ${d.accent_color}44, ${d.accent_color}11)`,
                    }}
                  >
                    <span
                      className="font-bold opacity-80"
                      style={{ color: d.accent_color }}
                    >
                      {d.name.slice(0, 2)}
                    </span>
                  </div>
                )}
                <span
                  className={`absolute bottom-1 right-1 px-1.5 h-5 rounded-full text-[11px] font-semibold tabular-nums flex items-center shadow ${
                    deckMissing > 0
                      ? "bg-amber-500 text-black"
                      : "bg-green-600 text-white"
                  }`}
                >
                  {deckMissing > 0 ? deckMissing : "✓"}
                </span>
                {on ? (
                  <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-[var(--color-accent)] text-[var(--color-accent-fg)] text-xs font-bold flex items-center justify-center shadow">
                    ✓
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-1 px-1.5 py-1 bg-[var(--color-card)]">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    background: d.accent_color2
                      ? `linear-gradient(135deg, ${d.accent_color}, ${d.accent_color2})`
                      : d.accent_color,
                  }}
                />
                <span className="truncate text-xs">{d.name}</span>
              </div>
            </label>
          );
        })}
      </div>

      {/* Nothing picked: the tiles above are the whole interface, and a box
          telling you to click them says less than they do. */}
      {selected.size === 0 ? null : (
        <>
          <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-3">
            <div className="text-sm">
              共缺{" "}
              <b className="text-amber-600 dark:text-amber-400 tabular-nums">
                {totalCards}
              </b>{" "}
              张({totalKinds} 种)
            </div>
            {totalKinds > 0 ? (
              <button
                type="button"
                onClick={copyList}
                className="px-2.5 h-7 rounded-md border border-[var(--color-border)] text-xs hover:bg-[var(--color-muted)] cursor-pointer"
              >
                {copied ? "✓ 已复制" : "复制清单"}
              </button>
            ) : null}
          </div>

          {totalKinds === 0 ? (
            <div className="text-xs text-green-600 dark:text-green-400 py-3 text-center">
              ✓ 都凑齐了
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {aggregate.map((c) => (
                <Link
                  key={c.code}
                  href={`/${game}/card/${c.code.split("/").map(encodeURIComponent).join("/")}`}
                  className="group rounded-md overflow-hidden border border-[var(--color-border)] hover:border-[var(--color-fg)] bg-[var(--color-bg)] flex items-center gap-2 p-1.5"
                >
                  <div className="w-9 shrink-0 aspect-[5/7] rounded overflow-hidden bg-[var(--color-muted)]">
                    {c.image_url ? (
                      <img
                        src={c.image_url}
                        alt={c.name}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-mono text-[var(--color-muted-fg)] truncate">
                      {c.code}
                    </div>
                    <div className="text-xs font-medium truncate group-hover:text-[var(--color-accent)]">
                      {c.name}
                    </div>
                    <div className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold tabular-nums">
                      缺 {c.need}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
