/** A card's manually typed price, per user. The shop-scraped side lives in `digimon.ts`. */

import { type DbFn } from "./context";

export function createPricing(db: DbFn) {
  /**
   * Resolve "the price this user paid attention to" for a card. Composite-PK
   * card_prices means a single card_id can have many rows. Lookup order:
   *   1. The caller's own entry (user_id = currentUserId).
   *   2. The legacy "global" entry (user_id IS NULL) — written by older
   *      single-user installs. Treated as a read-only default.
   */
  function getCardPrice(currentUserId: string, cardId: string): number | null {
    const r = db()
      .prepare(
        `SELECT price FROM user.card_prices
         WHERE card_id = ?
           AND (user_id = ? OR user_id IS NULL)
         ORDER BY user_id IS NULL ASC
         LIMIT 1`,
      )
      .get(cardId, currentUserId) as { price: number } | undefined;
    return r ? r.price : null;
  }

  function setCardPrice(
    currentUserId: string,
    cardId: string,
    price: number | null,
  ): void {
    if (price === null || !Number.isFinite(price)) {
      db()
        .prepare(
          `DELETE FROM user.card_prices WHERE card_id = ? AND user_id = ?`,
        )
        .run(cardId, currentUserId);
      return;
    }
    db()
      .prepare(
        `INSERT INTO user.card_prices (user_id, card_id, price) VALUES (?, ?, ?)
         ON CONFLICT(user_id, card_id) DO UPDATE SET
           price = excluded.price,
           updated_at = CURRENT_TIMESTAMP`,
      )
      .run(currentUserId, cardId, price);
  }

  return {
    getCardPrice,
    setCardPrice,
  };
}
