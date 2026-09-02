"use client";

import { useState } from "react";
import { paoCartScript, type CartItem } from "@/lib/cart-script";

/**
 * Hands over a snippet that fills the shop's cart with what this deck still
 * needs.
 *
 * Not a button that adds to a cart: a cart belongs to a session on the shop's
 * own domain, which neither this server nor this page can reach. The reader
 * runs the snippet there, in their own browser, and pays — or doesn't — by
 * hand afterwards.
 */
export function CartScriptButton({ items }: { items: CartItem[] }) {
  const [copied, setCopied] = useState(false);
  if (items.length === 0) return null;

  const cards = items.reduce((n, i) => n + i.quantity, 0);
  const yen = items.reduce((n, i) => n + i.priceYen * i.quantity, 0);

  async function copy() {
    try {
      await navigator.clipboard.writeText(paoCartScript(items));
      setCopied(true);
      setTimeout(() => setCopied(false), 4000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={copy}
        title={`${items.length} 种 · ${cards} 张 · 约 ¥${yen.toLocaleString()}`}
        className="h-8 px-3 rounded-md border border-[var(--color-border)] text-xs hover:bg-[var(--color-muted)] cursor-pointer flex items-center gap-1.5"
      >
        🛒 复制 PAO 加购脚本
        <span className="text-[var(--color-muted-fg)] tabular-nums">
          {cards} 张 · ¥{yen.toLocaleString()}
        </span>
      </button>
      {copied ? (
        <span className="text-xs text-[var(--color-muted-fg)]">
          已复制 · 在{" "}
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
    </div>
  );
}
