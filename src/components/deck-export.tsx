"use client";

import { useState } from "react";

type Tab = "text" | "url";

/**
 * Controlled export panel (no trigger button — the parent owns open state and
 * places the trigger wherever it likes, e.g. next to Save/Delete).
 */
export function DeckExportPanel({
  text,
  url,
  onClose,
}: {
  text: string;
  url: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("text");
  const [copied, setCopied] = useState<Tab | null>(null);

  function copy(t: Tab) {
    const value = t === "text" ? text : url;
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(t);
      setTimeout(() => setCopied(null), 1200);
    });
  }

  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold">导出卡组</h4>
        <button
          type="button"
          onClick={onClose}
          className="text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] text-sm cursor-pointer"
        >
          ×
        </button>
      </div>

      <div className="flex gap-1 p-0.5 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] w-fit">
        <button
          type="button"
          onClick={() => setTab("text")}
          className={`px-2 h-6 text-[11px] rounded cursor-pointer ${
            tab === "text"
              ? "bg-[var(--color-muted)] font-medium"
              : "text-[var(--color-muted-fg)] hover:text-[var(--color-fg)]"
          }`}
        >
          文本（io / DCGO）
        </button>
        <button
          type="button"
          onClick={() => setTab("url")}
          className={`px-2 h-6 text-[11px] rounded cursor-pointer ${
            tab === "url"
              ? "bg-[var(--color-muted)] font-medium"
              : "text-[var(--color-muted-fg)] hover:text-[var(--color-fg)]"
          }`}
        >
          URL（io）
        </button>
      </div>

      {tab === "text" ? (
        <>
          <textarea
            readOnly
            value={text}
            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
            rows={Math.min(14, text.split("\n").length + 1)}
            className="w-full font-mono text-[11px] rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-2 leading-snug focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            spellCheck={false}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => copy("text")}
              className="px-3 h-8 rounded-md bg-[var(--color-accent)] text-[var(--color-accent-fg)] text-sm hover:opacity-90 cursor-pointer"
            >
              {copied === "text" ? "✓ 已复制" : "复制文本"}
            </button>
            <span className="text-[10px] text-[var(--color-muted-fg)]">
              粘贴到 digimoncard.io / DCGO 导入框。
            </span>
          </div>
        </>
      ) : (
        <>
          <textarea
            readOnly
            value={url}
            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
            rows={3}
            className="w-full font-mono text-[11px] rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-2 break-all focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            spellCheck={false}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => copy("url")}
              className="px-3 h-8 rounded-md bg-[var(--color-accent)] text-[var(--color-accent-fg)] text-sm hover:opacity-90 cursor-pointer"
            >
              {copied === "url" ? "✓ 已复制" : "复制链接"}
            </button>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-[var(--color-accent)] hover:underline"
            >
              在 digimoncard.io 打开 ↗
            </a>
          </div>
        </>
      )}
    </div>
  );
}
