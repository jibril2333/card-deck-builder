"use client";

import { useState, useTransition } from "react";
import { buildCartScriptAction } from "@/app/[game]/actions";

/**
 * Hands over a snippet that fills the shop's cart with what this deck still
 * needs.
 *
 * Not a button that adds to a cart: a cart belongs to a session on the shop's
 * own domain, which neither this server nor this page can reach. The reader
 * runs the snippet there, in their own browser, and pays — or doesn't — by
 * hand afterwards.
 *
 * The list is built when the button is pressed, not when the page renders. It
 * costs a quote lookup per card in the deck, and almost nobody opening a deck
 * is on their way to the shop.
 */
export function CartScriptButton({
  game,
  deckId,
}: {
  game: string;
  deckId: string;
}) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState<{ cards: number; yen: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    setDone(null);
    start(async () => {
      const r = await buildCartScriptAction(game, deckId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      try {
        await navigator.clipboard.writeText(r.script);
        setDone({ cards: r.cards, yen: r.yen });
        setTimeout(() => setDone(null), 8000);
      } catch {
        setError("复制失败,请检查浏览器剪贴板权限");
      }
    });
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="h-8 px-3 rounded-md border border-[var(--color-border)] text-xs hover:bg-[var(--color-muted)] cursor-pointer disabled:cursor-wait disabled:opacity-70 flex items-center gap-1.5"
      >
        🛒 {pending ? "生成中…" : "复制 PAO 加购脚本"}
      </button>
      {done ? (
        <span className="text-xs text-[var(--color-muted-fg)]">
          已复制 {done.cards} 张 · ¥{done.yen.toLocaleString()} · 在{" "}
          <a
            href="https://pao-onlineshop.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-[var(--color-accent)]"
          >
            PAO
          </a>{" "}
          页面按 F12 粘贴到 Console
        </span>
      ) : null}
      {error ? <span className="text-xs text-amber-500">{error}</span> : null}
    </div>
  );
}
