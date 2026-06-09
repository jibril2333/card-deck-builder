"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SearchGroup } from "@/lib/deck-search";

/**
 * "🔍 N" badge on a deck card with a search/tutor effect. N is how many
 * distinct cards in this deck it can reach. Clicking opens a popover that
 * lists those cards GROUPED BY SEARCH SLOT — so a card that fetches two
 * different things ("1 Digimon and 1 Tamer") shows each slot's candidates
 * under its own labeled header.
 *
 * The popover is `position: fixed` (anchored to the button rect) so it
 * escapes the card tile's overflow-hidden clip and stays on-screen, and it
 * lives outside the card's <Link> so we don't nest anchors.
 */
export function SearchTargets({
  game,
  groups,
}: {
  game: string;
  groups: SearchGroup[];
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  // Distinct cards across all slots → the badge count.
  const distinctCount = useMemo(() => {
    const ids = new Set<string>();
    for (const g of groups) for (const t of g.targets) ids.add(t.id);
    return ids.size;
  }, [groups]);
  const multi = groups.length > 1;

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
      const W = 248;
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
        title={`检索:${
          multi ? `${groups.length} 个槽,` : ""
        }共可拿本卡组 ${distinctCount} 张`}
        className={`h-6 px-1.5 rounded-md text-[11px] font-bold flex items-center gap-0.5 cursor-pointer shadow transition-colors ${
          open
            ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]"
            : "bg-black/70 text-white hover:bg-black/85"
        }`}
      >
        🔍 {distinctCount}
        {multi ? (
          <span className="opacity-80 font-normal">·{groups.length}槽</span>
        ) : null}
      </button>

      {open && pos ? (
        <div
          ref={popRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: 248 }}
          className="z-50 max-h-80 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl p-2"
          onClick={(e) => e.preventDefault()}
        >
          {groups.map((g, gi) => (
            <div key={gi} className={gi > 0 ? "mt-2" : ""}>
              <div className="flex items-baseline gap-1.5 px-1 pb-1 mb-1 border-b border-[var(--color-border)]">
                {multi ? (
                  <span className="shrink-0 w-4 h-4 rounded-full bg-[var(--color-accent)]/15 text-[var(--color-accent)] text-[10px] font-bold flex items-center justify-center">
                    {gi + 1}
                  </span>
                ) : null}
                <span className="text-[11px] text-[var(--color-muted-fg)] truncate">
                  {g.label || "可检索"} · {g.targets.length}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                {g.targets.map((t) => (
                  <Link
                    key={t.id}
                    href={`/${game}/card/${t.code
                      .split("/")
                      .map(encodeURIComponent)
                      .join("/")}`}
                    className="flex items-center gap-2 p-1 rounded hover:bg-[var(--color-muted)]"
                  >
                    <div className="w-7 shrink-0 aspect-[5/7] rounded overflow-hidden bg-[var(--color-muted)]">
                      {t.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={t.image_url}
                          alt={t.name}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-mono text-[var(--color-muted-fg)] truncate">
                        {t.code}
                      </div>
                      <div className="text-xs truncate">{t.name}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
