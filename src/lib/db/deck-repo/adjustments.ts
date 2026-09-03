/**
 * 调整备忘 — the "considering these swaps" scratch list.
 *
 * Its own table, read by nothing else: none of this touches deck totals,
 * prices, shortfalls or the pool.
 */

import { MAX_ADJUSTMENT_QTY, OwnershipError, type DbFn } from "./context";

export function createAdjustments(
  db: DbFn,
  deps: {
    assertUnlocked: (deckId: string) => void;
  },
) {
  const { assertUnlocked } = deps;

  // ── Adjustments ────────────────────────────────────────────────────────
  // A scratch list of swaps the owner is considering. Read by NOTHING except
  // its own panel: no count, price, shortfall, pool or export query touches
  // this table, which is the whole point of it being separate from deck_cards.

  /**
   * The deck's considered swaps, joined to the card for display. Newest first
   * within each column so a card you just jotted down is at the top.
   */
  function listDeckAdjustments(deckId: string): {
    id: string;
    card_id: string;
    kind: "add" | "remove";
    quantity: number;
    note: string | null;
    code: string;
    name: string;
    image_url: string | null;
  }[] {
    return db()
      .prepare(
        `SELECT a.id, a.card_id, a.kind, a.quantity, a.note,
                c.code, c.name, c.image_url
           FROM user.deck_adjustments a
           JOIN cards c ON c.id = a.card_id
          WHERE a.deck_id = ?
          ORDER BY a.created_at DESC`,
      )
      .all(deckId) as ReturnType<typeof listDeckAdjustments>;
  }

  /** Owner-scoped: the deck must belong to the caller or nothing is written. */
  function addDeckAdjustment(
    currentUserId: string,
    deckId: string,
    cardId: string,
    kind: "add" | "remove",
  ): void {
    assertUnlocked(deckId);
    const owns = db()
      .prepare(`SELECT 1 FROM user.decks WHERE id = ? AND user_id = ?`)
      .get(deckId, currentUserId);
    if (!owns) throw new OwnershipError(deckId);
    // Re-adding a card you already noted bumps its count rather than stacking
    // a second row for the same card in the same column.
    db()
      .prepare(
        `INSERT INTO user.deck_adjustments (id, deck_id, card_id, kind, quantity)
         VALUES (?, ?, ?, ?, 1)
         ON CONFLICT(deck_id, card_id, kind)
           DO UPDATE SET quantity = MIN(quantity + 1, ${MAX_ADJUSTMENT_QTY})`,
      )
      .run(crypto.randomUUID(), deckId, cardId, kind);
  }

  /**
   * Set how many copies the note is about. Clamped to 1..MAX: zero would be a
   * confusing way to spell "remove the note", and the ✕ already does that.
   */
  function setDeckAdjustmentQuantity(
    currentUserId: string,
    id: string,
    quantity: number,
  ): void {
    const q = Math.max(1, Math.min(MAX_ADJUSTMENT_QTY, Math.trunc(quantity)));
    db()
      .prepare(
        `UPDATE user.deck_adjustments SET quantity = ?
          WHERE id = ?
            AND deck_id IN (
                  SELECT id FROM user.decks WHERE user_id = ? AND locked = 0
                )`,
      )
      .run(q, id, currentUserId);
  }

  /**
   * Ownership is checked through the parent deck, so passing someone else's
   * row id deletes nothing rather than erroring — same shape as reorderDecks.
   */
  function removeDeckAdjustment(currentUserId: string, id: string): void {
    db()
      .prepare(
        `DELETE FROM user.deck_adjustments
          WHERE id = ?
            AND deck_id IN (
                  SELECT id FROM user.decks WHERE user_id = ? AND locked = 0
                )`,
      )
      .run(id, currentUserId);
  }

  function setDeckAdjustmentNote(
    currentUserId: string,
    id: string,
    note: string,
  ): void {
    db()
      .prepare(
        `UPDATE user.deck_adjustments SET note = ?
          WHERE id = ?
            AND deck_id IN (
                  SELECT id FROM user.decks WHERE user_id = ? AND locked = 0
                )`,
      )
      .run(note.trim() || null, id, currentUserId);
  }

  return {
    listDeckAdjustments,
    addDeckAdjustment,
    setDeckAdjustmentQuantity,
    removeDeckAdjustment,
    setDeckAdjustmentNote,
  };
}
