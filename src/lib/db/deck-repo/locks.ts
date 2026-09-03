/**
 * The lock gate.
 *
 * Its own two-function module because every other module depends on it and
 * nothing depends on them: a locked deck must refuse writes whichever route
 * reaches it — the deck page, the card page's 加入卡组 widget, the pool
 * reconciler, the purchase tracker.
 */

import { DeckLockedError, type DbFn } from "./context";

export function createLocks(db: DbFn) {
  /**
   * Is this deck closed to edits?
   *
   * Checked in the repo rather than in the Server Actions because there are
   * two dozen write paths and they don't all go through the deck page: the
   * card page's 加入卡组 widget, the group/pool reconciler and the purchase
   * tracker all reach deck_cards by other routes. One gate here covers every
   * one of them, the same way `clampQuantityToRestriction` does.
   */
  function isDeckLocked(deckId: string): boolean {
    const r = db()
      .prepare(`SELECT locked FROM user.decks WHERE id = ?`)
      .get(deckId) as { locked?: number } | undefined;
    return !!r?.locked;
  }

  function assertUnlocked(deckId: string): void {
    if (isDeckLocked(deckId)) throw new DeckLockedError(deckId);
  }

  return {
    isDeckLocked,
    assertUnlocked,
  };
}
