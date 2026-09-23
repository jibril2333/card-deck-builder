"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCardPriceAction } from "@/app/[game]/actions";
import { useI18n } from "@/lib/i18n/client";

/**
 * Inline editable "expected price" for a card. Used on the card detail page and
 * on each card tile inside a deck. Persists to card_prices (keyed by card id).
 */
export function CardPriceInput({
  game,
  cardId,
  price,
  market = null,
  className,
}: {
  game: string;
  cardId: string;
  price: number | null;
  /**
   * The cheaper of the shop quotes, when there is one. Shown as the
   * placeholder — the value in force until someone types over it — so an
   * empty box reads as "this is what we're using" rather than "no price".
   */
  market?: { price_yen: number; source: string } | null;
  className?: string;
}) {
  const { m } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function save(value: string) {
    const fd = new FormData();
    fd.set("game", game);
    fd.set("card_id", cardId);
    fd.set("price", value.trim());
    startTransition(async () => {
      await setCardPriceAction(fd);
      router.refresh();
    });
  }

  return (
    <div
      className={`flex items-center gap-1 ${pending ? "opacity-50" : ""} ${className ?? ""}`}
    >
      <span className="text-[var(--color-muted-fg)] text-xs shrink-0">¥</span>
      <input
        type="number"
        min={0}
        step="0.01"
        inputMode="decimal"
        defaultValue={price ?? ""}
        key={`price-${price ?? ""}`}
        placeholder={market ? `${market.price_yen}` : m.card.expectedPriceShort}
        title={
          market
            ? m.card.defaultPriceHint(market.source === "pao" ? "PAO" : "Cardrush", market.price_yen)
            : undefined
        }
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onBlur={(e) => {
          const v = e.currentTarget.value;
          const cur = price ?? "";
          if (v.trim() !== String(cur)) save(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="w-full min-w-0 h-7 px-1.5 text-xs rounded border border-[var(--color-border)] bg-[var(--color-bg)] tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
    </div>
  );
}
