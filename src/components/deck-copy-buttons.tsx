"use client";

import { useState } from "react";

/**
 * Copy the deck as text, or as a share link, straight to the clipboard.
 *
 * These used to open a panel showing the payload with a copy button inside it.
 * Nobody reads a 50-line decklist off a modal to decide whether to copy it —
 * the panel was a step between wanting the thing and having it. The button
 * confirms in place instead, so the result is still visible.
 */
export function DeckCopyButtons({
  text,
  url,
}: {
  text: string;
  url: string;
}) {
  const [done, setDone] = useState<"text" | "url" | null>(null);
  const [failed, setFailed] = useState(false);

  async function copy(what: "text" | "url") {
    const value = what === "text" ? text : url;
    try {
      // Requires a secure context; over plain http on a LAN address this
      // throws, so say so rather than silently doing nothing.
      await navigator.clipboard.writeText(value);
      setFailed(false);
      setDone(what);
      setTimeout(() => setDone(null), 1600);
    } catch {
      setFailed(true);
      setTimeout(() => setFailed(false), 2400);
    }
  }

  const cls =
    "px-3 h-8 rounded-md text-sm border border-[var(--color-border)] " +
    "bg-[var(--color-card)] hover:bg-[var(--color-muted)] flex items-center " +
    "gap-1.5 cursor-pointer transition-colors";

  return (
    <>
      <button type="button" onClick={() => copy("text")} className={cls}>
        {done === "text" ? "✓ 已复制" : "⇡ 导出文本"}
      </button>
      <button type="button" onClick={() => copy("url")} className={cls}>
        {done === "url" ? "✓ 已复制" : "🔗 导出链接"}
      </button>
      {failed ? (
        <span className="text-xs text-red-500 self-center">
          复制失败(浏览器不允许)
        </span>
      ) : null}
    </>
  );
}
