"use client";

import { useEffect, useRef, useState } from "react";
import { DeckImageExport, type ExportCard } from "@/components/deck-image-export";

/**
 * The deck's three export actions behind one toolbar button.
 *
 * They used to sit in the row as three buttons — 导出文本 / 导出链接 / 导出图片,
 * 306px of it. The rest of the toolbar is fixed-width too, so with the card
 * search on the end the row needed 945px and the deck column is only ~670px
 * at a 1280px window: the search box was pushed onto a second line on any
 * ordinary laptop. Collapsed to one button, the row fits.
 *
 * Text and link copy straight to the clipboard rather than opening a panel
 * that shows them first — nobody reads a 50-line decklist to decide whether
 * to copy it. The button says so afterwards, so the result is still visible.
 */
export function DeckExportMenu({
  text,
  url,
  deckName,
  accent,
  accent2,
  gameLabel,
  subtitle,
  cards,
}: {
  text: string;
  url: string;
  deckName: string;
  accent: string;
  accent2: string | null;
  gameLabel: string;
  subtitle: string;
  cards: ExportCard[];
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<"text" | "url" | null>(null);
  const [failed, setFailed] = useState(false);
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

  async function copy(what: "text" | "url") {
    try {
      // Needs a secure context; over plain http on a LAN address this throws,
      // so say so rather than appearing to do nothing.
      await navigator.clipboard.writeText(what === "text" ? text : url);
      setFailed(false);
      setDone(what);
      setTimeout(() => setDone(null), 1800);
    } catch {
      setFailed(true);
      setTimeout(() => setFailed(false), 2400);
    }
    setOpen(false);
  }

  const item =
    "w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-muted)] " +
    "flex items-center gap-2 cursor-pointer disabled:opacity-50";

  return (
    <div ref={boxRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="px-3 h-8 rounded-md text-sm border border-[var(--color-border)] bg-[var(--color-card)] hover:bg-[var(--color-muted)] cursor-pointer flex items-center gap-1.5"
      >
        {done ? "✓ 已复制" : failed ? "复制失败" : "⇡ 导出"}
        <span className="text-[10px] text-[var(--color-muted-fg)]">▾</span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-30 w-40 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] shadow-lg overflow-hidden"
        >
          <button type="button" role="menuitem" className={item} onClick={() => copy("text")}>
            ⇡ 文本
          </button>
          <button type="button" role="menuitem" className={item} onClick={() => copy("url")}>
            🔗 链接
          </button>
          <DeckImageExport
            deckName={deckName}
            accent={accent}
            accent2={accent2}
            gameLabel={gameLabel}
            subtitle={subtitle}
            cards={cards}
            renderTrigger={({ busy, disabled, run }) => (
              <button
                type="button"
                role="menuitem"
                className={item}
                disabled={disabled}
                onClick={() => {
                  run();
                  setOpen(false);
                }}
                title="把整个卡组排版成一张 PNG 图片下载"
              >
                🖼️ {busy ? "生成中…" : "图片"}
              </button>
            )}
          />
        </div>
      ) : null}
    </div>
  );
}
