import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { isGameId, type GameId } from "@/lib/games";
import { CARD_LANG_COOKIE, parseCardLang } from "@/lib/card-lang";
import { Playtest, type PlaytestCard } from "@/components/playtest";
import * as digimon from "@/lib/db/digimon";

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
  

  return (
    <>
      <main className="w-full mx-auto max-w-[1100px] px-4 sm:px-6 py-6">
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
