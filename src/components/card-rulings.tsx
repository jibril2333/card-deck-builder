"use client";

import { useState } from "react";
import type { CardRuling } from "@/lib/db/rulings-ddl";
import { EffectText } from "@/components/effect-text";

/**
 * Official card Q&A (カードQ&A) from Bandai's JP cardlist — the authoritative
 * rulings. Collapsed by default (a card can have many); the header shows the
 * count. Each entry: Q-number + update date, the question, then the answer.
 * Text is Japanese (the official wording); brackets get the same highlight as
 * effect text.
 */
export function CardRulings({ rulings }: { rulings: CardRuling[] }) {
  const [open, setOpen] = useState(false);
  if (rulings.length === 0) return null;

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 cursor-pointer text-left"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold flex items-center gap-2">
          📖 官方裁定 Q&A
          <span className="text-xs font-normal text-[var(--color-muted-fg)]">
            {rulings.length} 条 · 官方日文
          </span>
        </span>
        <span
          className={`text-[var(--color-muted-fg)] transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
      </button>

      {open ? (
        <ul className="divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
          {rulings.map((r) => (
            <li key={`${r.q_number}-${r.lang}`} className="px-3 py-3 space-y-1.5">
              <div className="flex items-center gap-2 text-[11px] text-[var(--color-muted-fg)] font-mono">
                <span className="px-1.5 py-0.5 rounded bg-[var(--color-muted)]">
                  {r.q_number}
                </span>
                {r.date ? <span>{r.date}</span> : null}
              </div>
              <div className="flex gap-2 text-sm">
                <span className="shrink-0 font-bold text-[var(--color-accent)]">
                  Q
                </span>
                <EffectText text={r.question} />
              </div>
              <div className="flex gap-2 text-sm">
                <span className="shrink-0 font-bold text-[var(--color-muted-fg)]">
                  A
                </span>
                <EffectText text={r.answer} />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
