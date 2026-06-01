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
  missing: MissingCard[];
};

/**
 * Panel-only controlled component. Parent owns open/close state and decides
 * placement. When mounted, this component renders the full-width panel; when
 * the user dismisses it, `onClose` is invoked.
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
    const text = aggregate.map((c) => `${c.need} ${c.code} ${c.name}`).join("\n");
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(text + "\n").then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }

  return (
    <div className="mb-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">🛒 多卡组缺卡统计</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] text-sm cursor-pointer"
        >
          ×
        </button>
      </div>

      <p className="text-xs text-[var(--color-muted-fg)]">
        勾选要一起买的卡组，下面汇总所有卡组里&ldquo;想要数 − 已购数&rdquo;的缺口（按购买模式记录计算）。
      </p>

      {/* Deck selectors */}
      <div className="flex flex-wrap gap-1.5">
        {decks.map((d) => {
          const isOn = selected.has(d.id);
          const deckMissing = d.missing.reduce((s, c) => s + c.need, 0);
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => toggle(d.id)}
              className={`px-2.5 h-8 rounded-md border text-xs flex items-center gap-1.5 transition-colors cursor-pointer ${
                isOn
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-fg)]"
                  : "border-[var(--color-border)] text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] hover:border-[var(--color-fg)]"
              }`}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: d.accent_color }}
              />
              {d.name}
              <span
                className={`tabular-nums ${deckMissing > 0 ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400"}`}
              >
                {deckMissing > 0 ? `缺${deckMissing}` : "✓"}
              </span>
            </button>
          );
        })}
      </div>

      {selected.size === 0 ? (
        <div className="text-xs text-[var(--color-muted-fg)] py-4 text-center border border-dashed border-[var(--color-border)] rounded-md">
          选择 1 个以上卡组查看汇总缺卡
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-3">
            <div className="text-sm">
              选中 <b>{selected.size}</b> 个卡组 · 共缺{" "}
              <b className="text-amber-600 dark:text-amber-400 tabular-nums">
                {totalCards}
              </b>{" "}
              张（{totalKinds} 种）
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
              🎉 选中的卡组都凑齐了！
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
    </div>
  );
}
