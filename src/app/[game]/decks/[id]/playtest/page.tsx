import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { isGameId, type GameId } from "@/lib/games";
import { CARD_LANG_COOKIE, parseCardLang } from "@/lib/card-lang";
import { Playtest, type PlaytestCard } from "@/components/playtest";
import * as digimon from "@/lib/db/digimon";
import { deckThemeCss } from "@/lib/deck-theme";

/**
 * Deck playtesting page: opening-hand simulator + draw-probability table.
 * Read-only — like deck browsing, any logged-in friend can playtest any deck.
 */
export default async function PlaytestPage({
  params,
}: {
  params: Promise<{ game: string; id: string }>;
}) {
  const { game, id } = await params;
  if (!isGameId(game)) notFound();

  let deckName: string;
  let cards: PlaytestCard[];
  const deck = digimon.getDeck(id);
  if (!deck) notFound();
  deckName = deck.name;
  const cardLang = parseCardLang(
    (await cookies()).get(CARD_LANG_COOKIE)?.value,
  );
  cards = digimon.overlayDisplay(
    digimon.getDeckCards(id).map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      image_url: c.image_url,
      quantity: c.quantity,
      isEgg: c.card_type === "Digi-Egg",
      level: c.level ?? null,
      cardType: c.card_type,
    })),
    cardLang,
  );

  // Same as the deck page: inside a deck, the app wears the deck's colour.
  const themeCss = deckThemeCss(deck.accent_color, deck.accent_color2 ?? null);

  return (
    <>
      {themeCss ? (
        <style dangerouslySetInnerHTML={{ __html: themeCss }} />
      ) : null}
      {/* 1100 was sized for a three-column probability table. The table now
          shows every turn from `xl` up, and 1600 is what those columns plus the
          15rem level rail actually need — past that the extra width would go
          into the 卡名 column, which is stretching, not using. */}
      <main className="w-full mx-auto max-w-[1600px] px-4 sm:px-6 py-6">
        <BackLink
          fallback={`/${game}/decks/${id}`}
          className="text-sm text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] inline-flex items-center gap-1 mb-3"
        >
          ← 返回卡组
        </BackLink>
        <h1 className="text-2xl font-bold mb-4">{deckName} · 试玩</h1>
        <Playtest game={game} cards={cards} />
      </main>
    </>
  );
}
