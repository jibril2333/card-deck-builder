/**
 * Which decks the card page's "添加到卡组" widget shows, and whether it offers
 * to fold at all.
 *
 * Out here rather than inline in the component because the interesting part is
 * a decision with edges — the threshold, and what survives a fold — and the
 * component can't be imported into a unit test: it pulls in the server actions,
 * and those pull in better-sqlite3.
 */

export type DeckLike = { card_qty: number };

/**
 * Below this many decks the list is shorter than the card art beside it, so a
 * toggle would be one more thing to read and no space back.
 */
export const COLLAPSE_ABOVE = 6;

export function collapseDecks<T extends DeckLike>(
  decks: T[],
  expanded: boolean,
): { shown: T[]; hidden: number; collapsible: boolean } {
  // Decks that already hold this card are what stays visible when collapsed:
  // "which of my decks has this, and let me bump it" is the question the
  // widget is opened to answer, so folding it away would save space by
  // removing the answer.
  //
  // That's a rule about VISIBILITY, not about order. It used to sort those
  // decks to the front of the expanded list too, which meant adding a copy
  // promoted that deck to the top — the row you just clicked jumped away
  // under the pointer, and the next one you meant to click had moved up. The
  // caller's order (creation, newest first) is left alone.
  const collapsible = decks.length > COLLAPSE_ABOVE;
  const shown =
    !collapsible || expanded ? decks : decks.filter((d) => d.card_qty > 0);
  return { shown, hidden: decks.length - shown.length, collapsible };
}
