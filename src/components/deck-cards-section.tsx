/**
 * The deck's cards, or the reason there are none to show.
 *
 * Three outcomes, and the empty ones are not the same empty: a deck with no
 * cards at all sends you to the card search, while a purchase-mode filter that
 * hid everything means the deck is bought — it offers the way back to the full
 * list instead.
 */
import Link from "next/link";
import { CardPreviewProvider } from "@/components/card-preview";
import { DeckCard, type DeckCardData } from "@/components/deck-card";
import type { SearchGroup } from "@/lib/deck-search";
import type { JogressView } from "@/components/jogress-badge";
import { getMessages } from "@/lib/i18n/server";

export async function DeckCardsSection({
  game,
  deckId,
  cards,
  coverCardId,
  mode,
  canEdit,
  missingOnly,
  violations,
  searchTargets,
  jogress,
}: {
  game: string;
  deckId: string;
  cards: DeckCardData[];
  coverCardId: string | null;
  mode: "browse" | "build" | "purchase";
  canEdit: boolean;
  missingOnly: boolean;
  /** Card ids the banlist disagrees with. */
  violations: Set<string>;
  searchTargets: Map<string, SearchGroup[]>;
  jogress: Map<string, JogressView[]>;
}) {
  const m = await getMessages();
  const visibleCards = missingOnly
    ? cards.filter((c) => c.purchased < c.quantity)
    : cards;
  if (cards.length === 0) {
    return (
      <div className="mt-6 p-12 text-sm text-center text-[var(--color-muted-fg)] border border-dashed border-[var(--color-border)] rounded-lg">
        {m.deckCards.noCards}
        <Link
          href={`/${game}`}
          className="underline ml-1 hover:text-[var(--color-fg)]"
        >
          {m.deckCards.goSearch}
        </Link>
      </div>
    );
  }
  if (visibleCards.length === 0) {
    return (
      <div className="mt-6 p-12 text-sm text-center text-[var(--color-muted-fg)] border border-dashed border-[var(--color-border)] rounded-lg">
        {m.deckCards.allSet}
        <Link
          href={`/${game}/decks/${deckId}?mode=purchase&missing=0`}
          replace
          className="underline ml-1 hover:text-[var(--color-fg)]"
          scroll={false}
        >
          {m.deckCards.showAll}
        </Link>
      </div>
    );
  }
  return (
    <CardPreviewProvider>
      <div className="mt-6 card-grid">
        {visibleCards.map((c) => (
          <DeckCard
            key={c.id}
            game={game}
            deckId={deckId}
            card={c}
            violation={violations.has(c.id)}
            isCover={c.id === coverCardId}
            mode={mode}
            mine={canEdit}
            searchTargets={searchTargets.get(c.id)}
            jogress={jogress.get(c.id)}
          />
        ))}
      </div>
    </CardPreviewProvider>
  );
}
