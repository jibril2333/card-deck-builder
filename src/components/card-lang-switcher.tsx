"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  CARD_LANG_COOKIE,
  CARD_LANG_LABELS,
  type CardLang,
} from "@/lib/card-lang";

/**
 * EN / 中 / 日 card-text language toggle (Digimon pages only). Writes the
 * preference cookie and refreshes — every server component re-reads the
 * cookie and re-renders with the chosen language.
 */
export function CardLangSwitcher({
  current,
  /** Extra classes — the sidebar rail stacks the three buttons vertically. */
  className,
}: {
  current: CardLang;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function pick(lang: CardLang) {
    if (lang === current) return;
    // Writing the cookie IS the state change here: every server component
    // reads the language from it, and the refresh below re-renders them.
    // eslint-disable-next-line react-hooks/immutability
    document.cookie = `${CARD_LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <div
      className={`flex items-center gap-0.5 rounded-lg border border-[var(--color-border)] p-0.5 bg-[var(--color-card)] ${
        pending ? "opacity-60" : ""
      } ${className ?? ""}`}
      title="卡牌文字语言(数码宝贝)"
    >
      {(Object.keys(CARD_LANG_LABELS) as CardLang[]).map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => pick(lang)}
          className={`px-2 h-7 rounded-md text-xs cursor-pointer transition-colors ${
            lang === current
              ? "bg-[var(--color-muted)] text-[var(--color-fg)] font-semibold"
              : "text-[var(--color-muted-fg)] hover:text-[var(--color-fg)]"
          }`}
        >
          {CARD_LANG_LABELS[lang]}
        </button>
      ))}
    </div>
  );
}
