/**
 * What a legal Digimon deck looks like, in one place.
 *
 * The deck page and the deck-list tile both judge "is this deck finished", and
 * they used to each carry their own copy of 50 and 5. One of them was always
 * going to be the one that didn't get updated.
 */

export const DECK_TARGET = { main: 50, egg: 5 } as const;

export type DeckCounts = { main: number; egg: number };

/**
 * The main deck is exactly 50 — not "at least", since 51 is as unplayable as
 * 49. The egg deck is 0–5: an empty egg deck is legal and common, so a deck
 * with no eggs is finished, not short.
 */
export function deckIsComplete({ main, egg }: DeckCounts): boolean {
  return main === DECK_TARGET.main && egg <= DECK_TARGET.egg;
}

/**
 * The tile badge: `null` once the deck is legal, because a finished deck has
 * nothing to say and the number was only ever covering its own artwork.
 *
 * While it isn't legal, both halves are shown even when only one is wrong —
 * "42/3" answers "how far off am I" in a glance, where a bare "42" leaves you
 * wondering whether the eggs are in it.
 */
export function deckCountBadge(counts: DeckCounts): string | null {
  return deckIsComplete(counts) ? null : `${counts.main}/${counts.egg}`;
}
