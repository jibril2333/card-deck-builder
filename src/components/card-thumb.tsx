import Link from "next/link";
import { cn } from "@/lib/utils";
import { colorHex } from "@/lib/games";
import { RestrictionBadge, type Restriction } from "@/components/restriction-badge";

export type CardLite = {
  id: string;
  code: string;
  name: string;
  color?: string | null;
  rarity?: string | null;
  image_url?: string | null;
  /** Total number of image variants for this card (base + alt arts). 1 = no alt arts. */
  variant_count?: number;
  /** Optional explicit detail-page link (overrides the default /[game]/card/<code>). */
  href?: string;
  /** Scraped third-party market price (Cardrush) in yen, if available. */
  market_price?: number | null;
  /** True if the cheapest scraped listing was in stock. Sold-out prices
   *  still render but with a strike-through. */
  market_in_stock?: boolean;
  /** Official banlist / limited-list restriction, if any. */
  restriction?: Restriction | null;
};

export function CardThumb({
  game,
  card,
  className,
}: {
  game: string;
  card: CardLite;
  className?: string;
}) {
  const href =
    card.href ??
    `/${game}/card/${card.code.split("/").map(encodeURIComponent).join("/")}`;
  return (
    <Link
      href={href}
      className={cn(
        "group block rounded-lg overflow-hidden border border-[var(--color-border)] hover:border-[var(--color-fg)] transition-colors bg-[var(--color-card)]",
        className,
      )}
    >
      <div className="card-thumb relative">
        {card.image_url ? (
          <img
            src={card.image_url}
            alt={card.name}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[var(--color-muted-fg)] text-xs">
            no image
          </div>
        )}
        {card.rarity ? (
          <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 text-[10px] rounded-md bg-black/65 text-white font-medium">
            {card.rarity}
          </span>
        ) : null}
        {card.variant_count && card.variant_count > 1 ? (
          <span
            className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 text-[10px] rounded-md bg-purple-600/85 text-white font-medium"
            title={`${card.variant_count} 个版本`}
          >
            +{card.variant_count - 1}
          </span>
        ) : null}
        {card.restriction ? (
          <RestrictionBadge
            restriction={card.restriction}
            className="absolute bottom-1.5 right-1.5"
          />
        ) : null}
      </div>
      <div className="px-2 py-1.5">
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-muted-fg)] font-mono">
          {card.color ? (
            <span
              className="chip-dot shrink-0"
              style={{ background: colorHex(card.color) }}
            />
          ) : null}
          <span className="truncate">{card.code}</span>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs font-medium group-hover:text-[var(--color-accent)]">
          <span className="truncate">{card.name}</span>
          {card.market_price != null ? (
            <span
              className={`shrink-0 text-[10px] font-mono tabular-nums ${
                card.market_in_stock
                  ? "text-[var(--color-fg)]"
                  : "text-[var(--color-muted-fg)] line-through opacity-70"
              }`}
              title={
                card.market_in_stock
                  ? "Cardrush 最便宜在售价"
                  : "Cardrush 最后记录价(已售罄)"
              }
            >
              ¥{card.market_price.toLocaleString()}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
