"use client";

import { cardImageSrc } from "@/lib/card-image";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDeckCoverVariantAction } from "@/app/[game]/actions";

export type CoverArt = {
  /** `card_images.variant` — "" for the base print, "_P1" etc for alt arts. */
  variant: string;
  image_url: string;
};

/**
 * Picks WHICH printing of the cover card the deck shows.
 *
 * The ★ on a card only says which CARD is the cover; the art it resolved to
 * was always that card's base print. Decks whose cover card has alt arts get
 * this strip so the nicer printing can be the one on the shelf.
 *
 * Only rendered when there's an actual choice (>1 art) and the viewer owns the
 * deck — see the deck page.
 */
export function CoverVariantPicker({
  game,
  deckId,
  arts,
  current,
}: {
  game: string;
  deckId: string;
  arts: CoverArt[];
  /** Currently-selected variant key. */
  current: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function pick(variant: string) {
    if (variant === current) return;
    const fd = new FormData();
    fd.set("game", game);
    fd.set("deck_id", deckId);
    fd.set("variant", variant);
    startTransition(async () => {
      await setDeckCoverVariantAction(fd);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="text-xs text-[var(--color-muted-fg)] mb-1.5">
        封面异画（{arts.length} 种）
      </div>
      <div className={`flex flex-wrap gap-1.5 ${pending ? "opacity-60" : ""}`}>
        {arts.map((a) => {
          const active = a.variant === current;
          return (
            <button
              key={a.variant || "base"}
              type="button"
              onClick={() => pick(a.variant)}
              disabled={pending}
              title={a.variant ? `异画 ${a.variant.replace("_", "")}` : "原版"}
              aria-pressed={active}
              className={`w-11 aspect-[5/7] rounded overflow-hidden border-2 transition-all cursor-pointer relative disabled:cursor-wait ${
                active
                  ? "border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/40"
                  : "border-[var(--color-border)] hover:border-[var(--color-fg)] opacity-70 hover:opacity-100"
              }`}
            >
              <img
                src={cardImageSrc(a.image_url)}
                alt={a.variant || "原版"}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <span className="absolute bottom-0 left-0 right-0 text-[8px] font-bold text-white bg-black/65 text-center leading-tight py-0.5">
                {a.variant ? a.variant.replace("_", "") : "原"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
