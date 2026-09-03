/**
 * `user.deck_cards`: what is in a deck and how much of it is already bought.
 *
 * The heavy module — `setDeckCardQuantity` carries the restriction clamp and
 * the lock check, which is why the restriction rules live next door rather
 * than inline.
 */

import { codeNatural } from "../card-search";
import { OwnershipError, type DeckCardRow, type DbFn } from "./context";

/**
 * The order a deck's cards are read in — the grid, the text export, the image
 * export and the stats all take it from here.
 *
 * Two things were wrong with `level NULLS LAST, code`:
 *
 *  - Tamers and Options both have a NULL level, so they landed in one pile
 *    sorted by code and interleaved with each other. They're the two groups a
 *    player counts separately.
 *  - `code` is TEXT, so BT10 sorted before BT2 and -010 before -002. A deck
 *    holding several sets read as if it had been shuffled.
 *
 * So: eggs, then Digimon by level, then Tamers, then Options — the order the
 * text export already used for its two halves and the one a decklist is
 * written in. Inside a group, the card number read as a NUMBER.
 */
const DECK_CARD_ORDER_BY = `
    CASE c.card_type
      WHEN 'Digi-Egg' THEN 0
      WHEN 'Tamer' THEN 2
      WHEN 'Option' THEN 3
      ELSE 1
    END,
    c.level NULLS LAST,
    ${codeNatural("c.code")}`;

export function createCards(
  db: DbFn,
  deps: {
    assertUnlocked: (deckId: string) => void;
    clampQuantityToRestriction: (
      deckId: string,
      cardId: string,
      wanted: number,
    ) => number;
  },
) {
  const { assertUnlocked, clampQuantityToRestriction } = deps;

  /**
   * Any user can read any deck's cards.
   *
   * Price comes back three ways, because the UI needs to tell them apart:
   *   · `manual_price` — what a person typed (the owner's row, or the legacy
   *     global one from single-user installs). Their authoritative intent.
   *   · `market_price` / `market_source` — the cheapest base-printing quote
   *     any shop has, in-stock preferred. Two shops are scraped now, and the
   *     cheaper of them is the honest default.
   *   · `price` — the first of those two: what the totals count.
   *
   * The split is what lets the tile show a typed price as a value and a shop
   * price as a placeholder — the number in force, not one someone chose.
   */
  function getDeckCards(deckId: string): DeckCardRow[] {
    const floor = `SELECT ep.price_yen FROM external_prices ep
                    WHERE ep.card_id = c.id AND ep.variant_type = 'base'
                    ORDER BY ep.in_stock DESC, ep.price_yen ASC LIMIT 1`;
    return db()
      .prepare(
        `SELECT c.*, dc.quantity, dc.purchased,
                COALESCE(
                  (SELECT p.price FROM user.card_prices p
                    WHERE p.card_id = c.id AND p.user_id = (SELECT user_id FROM user.decks WHERE id = ?)),
                  (SELECT p.price FROM user.card_prices p
                    WHERE p.card_id = c.id AND p.user_id IS NULL)
                ) AS manual_price,
                (${floor}) AS market_price,
                (SELECT ep.source FROM external_prices ep
                  WHERE ep.card_id = c.id AND ep.variant_type = 'base'
                  ORDER BY ep.in_stock DESC, ep.price_yen ASC LIMIT 1) AS market_source,
                (SELECT ep.item_code FROM external_prices ep
                  WHERE ep.card_id = c.id AND ep.variant_type = 'base'
                  ORDER BY ep.in_stock DESC, ep.price_yen ASC LIMIT 1) AS market_item_code,
                COALESCE(
                  (SELECT p.price FROM user.card_prices p
                    WHERE p.card_id = c.id AND p.user_id = (SELECT user_id FROM user.decks WHERE id = ?)),
                  (SELECT p.price FROM user.card_prices p
                    WHERE p.card_id = c.id AND p.user_id IS NULL),
                  (${floor})
                ) AS price
         FROM user.deck_cards dc
         JOIN cards c ON c.id = dc.card_id
         WHERE dc.deck_id = ?
         ORDER BY ${DECK_CARD_ORDER_BY}`,
      )
      .all(deckId, deckId, deckId) as DeckCardRow[];
  }

  function deckCardCount(deckId: string): number {
    const r = db()
      .prepare(
        `SELECT COALESCE(SUM(dc.quantity), 0) as n FROM user.deck_cards dc WHERE dc.deck_id = ?`,
      )
      .get(deckId) as { n: number };
    return r.n;
  }

  function setDeckCardQuantity(
    currentUserId: string,
    deckId: string,
    cardId: string,
    quantity: number,
  ): void {
    assertUnlocked(deckId);
    // Silent clamp against the official restrictions table. If the user
    // asks for "4 of a banned card", we record 0; their UI's optimistic
    // update then snaps back to 0 on the next refresh.
    quantity = clampQuantityToRestriction(
      deckId,
      cardId,
      Math.max(0, quantity),
    );

    const tx = db().transaction((q: number) => {
      // Verify ownership first — same WHERE clause we use everywhere else.
      const owned = db()
        .prepare(`SELECT 1 FROM user.decks WHERE id = ? AND user_id = ?`)
        .get(deckId, currentUserId);
      if (!owned) throw new OwnershipError(deckId);

      if (q <= 0) {
        db()
          .prepare(
            `DELETE FROM user.deck_cards WHERE deck_id = ? AND card_id = ?`,
          )
          .run(deckId, cardId);
      } else {
        db()
          .prepare(
            `INSERT INTO user.deck_cards (deck_id, card_id, quantity) VALUES (?, ?, ?)
             ON CONFLICT(deck_id, card_id) DO UPDATE SET quantity = excluded.quantity`,
          )
          .run(deckId, cardId, q);
      }
      db()
        .prepare(
          `UPDATE user.decks SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        )
        .run(deckId);
    });
    tx(quantity);
  }

  /** Locked too: 已购 is stored on the deck's own row, and "any change" was
   *  the point. Pool levelling skips locked decks rather than failing — see
   *  reconcilePoolCard. */
  function setDeckCardPurchased(
    currentUserId: string,
    deckId: string,
    cardId: string,
    purchased: number,
  ): void {
    assertUnlocked(deckId);
    const owned = db()
      .prepare(`SELECT 1 FROM user.decks WHERE id = ? AND user_id = ?`)
      .get(deckId, currentUserId);
    if (!owned) throw new OwnershipError(deckId);

    db()
      .prepare(
        `UPDATE user.deck_cards SET purchased = ? WHERE deck_id = ? AND card_id = ?`,
      )
      .run(Math.max(0, purchased), deckId, cardId);
    db()
      .prepare(
        `UPDATE user.decks SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      )
      .run(deckId);
  }

  function adjustDeckCardPurchased(
    currentUserId: string,
    deckId: string,
    cardId: string,
    delta: number,
  ): number {
    assertUnlocked(deckId);
    const cur =
      (
        db()
          .prepare(
            `SELECT purchased FROM user.deck_cards WHERE deck_id = ? AND card_id = ?`,
          )
          .get(deckId, cardId) as { purchased: number } | undefined
      )?.purchased ?? 0;
    const next = Math.max(0, cur + delta);
    setDeckCardPurchased(currentUserId, deckId, cardId, next);
    return next;
  }

  function adjustDeckCard(
    currentUserId: string,
    deckId: string,
    cardId: string,
    delta: number,
  ): number {
    assertUnlocked(deckId);
    const cur =
      (
        db()
          .prepare(
            `SELECT quantity FROM user.deck_cards WHERE deck_id = ? AND card_id = ?`,
          )
          .get(deckId, cardId) as { quantity: number } | undefined
      )?.quantity ?? 0;
    const next = Math.max(0, cur + delta);
    setDeckCardQuantity(currentUserId, deckId, cardId, next);
    return next;
  }

  return {
    getDeckCards,
    deckCardCount,
    setDeckCardQuantity,
    setDeckCardPurchased,
    adjustDeckCardPurchased,
    adjustDeckCard,
  };
}
