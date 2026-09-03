/**
 * `user.deck_cards`: what is in a deck and how much of it is already bought.
 *
 * The heavy module — `setDeckCardQuantity` alone carries the restriction
 * clamp, the first-card seeding and the lock check, which is why the
 * restriction rules live next door rather than inline.
 */

import { colorHex } from "@/lib/games";
import { OwnershipError, type DeckCardRow, type RepoCtx } from "./context";

export function createCards<TCard>(
  ctx: RepoCtx,
  deps: {
    assertUnlocked: (deckId: string) => void;
    clampQuantityToRestriction: (
      deckId: string,
      cardId: string,
      wanted: number,
    ) => number;
  },
) {
  const {
    db,
    deckCardOrderBy,
    defaultAccent,
    seedAccent,
    seedSeries,
    seedColor,
    hasAnyFirstCardSeed,
  } = ctx;
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
  function getDeckCards(deckId: string): DeckCardRow<TCard>[] {
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
         ORDER BY ${deckCardOrderBy}`,
      )
      .all(deckId, deckId, deckId) as DeckCardRow<TCard>[];
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

    // First-card seeds (UA opts in via factory option; Digimon doesn't).
    // We sample the pre-state BEFORE the write so we can detect "this is
    // the very first card going into an otherwise empty deck", and for
    // each enabled seed also check "this field hasn't been customized
    // yet" before agreeing to overwrite it.
    //
    // Each individual seed has its own "not yet set" sentinel:
    //   - accent: accent_color still equals defaultAccent
    //   - series: locked_series IS NULL
    //   - color:  locked_color  IS NULL
    //
    // Once decided here, the actual UPDATE runs AFTER the tx — keeping
    // the write side-effect out of the card-insert transaction so a
    // seed-write failure can't roll back the user's actual card add.
    type FirstCardSeed = {
      accent_color?: string;
      locked_series?: string;
      locked_color?: string;
    };
    let seed: FirstCardSeed | null = null;
    if (hasAnyFirstCardSeed && quantity > 0) {
      const cnt = db()
        .prepare(
          `SELECT COALESCE(SUM(quantity), 0) AS n
             FROM user.deck_cards WHERE deck_id = ?`,
        )
        .get(deckId) as { n: number } | undefined;
      if ((cnt?.n ?? 0) === 0) {
        // Build a column list narrowed to what we actually need so we
        // never reach for `locked_series` on a game whose schema lacks
        // it (Digimon).
        const cols: string[] = [];
        if (seedAccent) cols.push("accent_color");
        if (seedSeries) cols.push("locked_series");
        if (seedColor) cols.push("locked_color");
        const deckRow = db()
          .prepare(`SELECT ${cols.join(", ")} FROM user.decks WHERE id = ?`)
          .get(deckId) as
          | {
              accent_color?: string;
              locked_series?: string | null;
              locked_color?: string | null;
            }
          | undefined;
        if (deckRow) {
          const card = db()
            .prepare(`SELECT color, series FROM cards WHERE id = ?`)
            .get(cardId) as
            { color: string | null; series: string | null } | undefined;
          if (card) {
            const next: FirstCardSeed = {};
            if (
              seedAccent &&
              deckRow.accent_color === defaultAccent &&
              card.color
            ) {
              next.accent_color = colorHex(card.color);
            }
            if (seedSeries && deckRow.locked_series == null && card.series) {
              next.locked_series = card.series;
            }
            if (seedColor && deckRow.locked_color == null && card.color) {
              next.locked_color = card.color;
            }
            if (Object.keys(next).length > 0) seed = next;
          }
        }
      }
    }

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

    // Post-write seed UPDATE. Outside the tx because it's a "nice to
    // have" — a failure here shouldn't roll back the actual card add.
    // We re-check ownership implicitly via the WHERE clause.
    if (seed) {
      const sets: string[] = [];
      const params: unknown[] = [];
      if (seed.accent_color !== undefined) {
        sets.push("accent_color = ?");
        params.push(seed.accent_color);
      }
      if (seed.locked_series !== undefined) {
        sets.push("locked_series = ?");
        params.push(seed.locked_series);
      }
      if (seed.locked_color !== undefined) {
        sets.push("locked_color = ?");
        params.push(seed.locked_color);
      }
      sets.push("updated_at = CURRENT_TIMESTAMP");
      params.push(deckId, currentUserId);
      db()
        .prepare(
          `UPDATE user.decks SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`,
        )
        .run(...params);
    }

    // Auto-clear locks when the deck empties. Since the meta form has no
    // manual "clear lock" control by design, removing every card is the
    // ONLY way to switch a deck to a different series/color — emptying it
    // resets the locks so the next first card can re-lock. Only relevant
    // for games that have these columns + enforcement (UA).
    if ((seedSeries || seedColor) && quantity <= 0) {
      const cnt = db()
        .prepare(
          `SELECT COALESCE(SUM(quantity), 0) AS n
             FROM user.deck_cards WHERE deck_id = ?`,
        )
        .get(deckId) as { n: number } | undefined;
      if ((cnt?.n ?? 0) === 0) {
        const sets: string[] = [];
        if (seedSeries) sets.push("locked_series = NULL");
        if (seedColor) sets.push("locked_color = NULL");
        sets.push("updated_at = CURRENT_TIMESTAMP");
        db()
          .prepare(
            `UPDATE user.decks SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`,
          )
          .run(deckId, currentUserId);
      }
    }
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
