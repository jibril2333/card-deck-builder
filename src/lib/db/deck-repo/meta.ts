/**
 * The deck row itself: listing, ordering, cover, lock flag, deletion.
 *
 * Everything here is about the deck as an object in a list — nothing in this
 * module touches `deck_cards`. That is `cards.ts`.
 */

import { colorHex } from "@/lib/games";
import {
  OwnershipError,
  type DeckCommon,
  type DeckWithCardQty,
  type DeckWithCover,
  type RepoCtx,
} from "./context";

export function createMeta<TDeck extends DeckCommon>(
  ctx: RepoCtx,
  deps: {
    assertUnlocked: (deckId: string) => void;
  },
) {
  const { db, defaultAccent, seedSeries, seedColor } = ctx;
  const { assertUnlocked } = deps;

  /**
   * All decks across all users. Decks owned by `currentUserId` come first;
   * within each ownership group, most-recently-updated first.
   */
  function listDecks(currentUserId: string): (TDeck & {
    owner_id: string | null;
    owner_name: string | null;
  })[] {
    return db()
      .prepare(
        `SELECT d.*, u.id AS owner_id, u.display_name AS owner_name
         FROM user.decks d
         LEFT JOIN user.users u ON u.id = d.user_id
         ORDER BY (d.user_id = ?) DESC, d.updated_at DESC`,
      )
      .all(currentUserId) as (TDeck & {
      owner_id: string | null;
      owner_name: string | null;
    })[];
  }

  /** Same as listDecks plus cover image join. */
  function listDecksWithCover(currentUserId: string): DeckWithCover<TDeck>[] {
    return db()
      .prepare(
        `SELECT d.*,
                -- Japanese art first: the physical cards are the JP printings,
                -- and the cover is a picture of the deck you actually own. Falls
                -- back to English, then to the card's own image for anything we
                -- haven't probed.
                COALESCE(
                  (SELECT ci.image_url FROM card_images ci
                    WHERE ci.code = c.code
                      AND ci.variant = COALESCE(d.cover_variant, '')
                    ORDER BY (ci.lang = 'ja') DESC, (ci.lang = 'en') DESC
                    LIMIT 1),
                  c.image_url)
                AS cover_image_url,
                c.code AS cover_code,
                u.id AS owner_id,
                u.display_name AS owner_name
         FROM user.decks d
         LEFT JOIN cards c ON c.id = d.cover_card_id
         LEFT JOIN user.users u ON u.id = d.user_id
         ORDER BY (d.user_id = ?) DESC, d.pinned DESC,
                  d.sort_order ASC, d.updated_at DESC`,
      )
      .all(currentUserId) as DeckWithCover<TDeck>[];
  }

  /**
   * Mark a deck as one the owner actually plays (pinned) or just keeps on
   * record. Owner-scoped: the WHERE clause makes this a no-op for anyone
   * else's deck, so a forged deck id can't touch another user's row.
   *
   * `updated_at` is deliberately NOT bumped — it means "last edited the deck's
   * cards", and the deck list surfaces it as such.
   */
  /**
   * Close a deck to edits, or open it again.
   *
   * The one write that works ON a locked deck — otherwise there'd be no way
   * back. Ownership is checked the same way everything else here checks it.
   */
  function setDeckLocked(
    currentUserId: string,
    deckId: string,
    locked: boolean,
  ): void {
    const r = db()
      .prepare(`UPDATE user.decks SET locked = ? WHERE id = ? AND user_id = ?`)
      .run(locked ? 1 : 0, deckId, currentUserId);
    if (r.changes === 0) throw new OwnershipError(deckId);
  }

  function setDeckPinned(
    currentUserId: string,
    deckId: string,
    pinned: boolean,
  ): void {
    db()
      .prepare(`UPDATE user.decks SET pinned = ? WHERE id = ? AND user_id = ?`)
      .run(pinned ? 1 : 0, deckId, currentUserId);
  }

  /**
   * Choose WHICH printing of the cover card to show — '' for the base art, or
   * a `card_images.variant` key like '_P1' for an alt art.
   *
   * The key is deliberately NOT validated against card_images: an unknown one
   * falls back to the base image in listDecksWithCover, so if a printing ever
   * disappears upstream the deck degrades to plain art instead of showing a
   * broken cover.
   */
  function setDeckCoverVariant(
    currentUserId: string,
    deckId: string,
    variant: string,
  ): void {
    assertUnlocked(deckId);
    const r = db()
      .prepare(
        `UPDATE user.decks SET cover_variant = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND user_id = ?`,
      )
      .run(variant, deckId, currentUserId);
    if (r.changes === 0) throw new OwnershipError(deckId);
  }

  /**
   * Reorder a contiguous batch of decks. Only the caller's own decks can be
   * reordered — any IDs in `orderedIds` that don't belong to `currentUserId`
   * are silently skipped (no error: the UI passes the whole on-screen order
   * and we just no-op for foreign rows).
   */
  function reorderDecks(currentUserId: string, orderedIds: string[]): void {
    const stmt = db().prepare(
      `UPDATE user.decks SET sort_order = ? WHERE id = ? AND user_id = ?`,
    );
    const tx = db().transaction((ids: string[]) => {
      ids.forEach((id, i) => stmt.run(i, id, currentUserId));
    });
    tx(orderedIds);
  }

  /**
   * Backfill the series/color lock for a LEGACY deck — one that has cards
   * but NULL locks because it was built before the first-card-lock feature
   * existed (the auto-lock only fires when adding to an *empty* deck).
   *
   * Idempotent and owner-scoped:
   *   - no-op for games without the lock flags (Digimon)
   *   - no-op if the deck already has both locks (or the relevant one)
   *   - no-op if the deck is empty (nothing to infer from)
   *   - locks `series` only if every card shares one series; same for color.
   *     A legacy deck with mixed series/colors (pre-enforcement) gets locked
   *     on whichever dimension is unambiguous, and stays unlocked on the
   *     other — so a genuinely non-conforming deck won't be force-collapsed.
   *
   * Called lazily from the deck page when an owner views their UA deck, so
   * legacy decks "heal" into the locked model on first view. Cheap: a couple
   * of indexed SELECTs that bail immediately once a deck is locked.
   */
  function backfillLockFromCards(currentUserId: string, deckId: string): void {
    if (!seedSeries && !seedColor) return;
    const cols: string[] = [];
    if (seedSeries) cols.push("locked_series");
    if (seedColor) cols.push("locked_color");
    const deck = db()
      .prepare(
        `SELECT ${cols.join(", ")} FROM user.decks WHERE id = ? AND user_id = ?`,
      )
      .get(deckId, currentUserId) as
      | { locked_series?: string | null; locked_color?: string | null }
      | undefined;
    if (!deck) return; // not found / not the owner
    const needSeries = seedSeries && deck.locked_series == null;
    const needColor = seedColor && deck.locked_color == null;
    if (!needSeries && !needColor) return; // already locked

    const rows = db()
      .prepare(
        `SELECT DISTINCT c.series, c.color
           FROM user.deck_cards dc
           JOIN cards c ON c.id = dc.card_id
          WHERE dc.deck_id = ? AND dc.quantity > 0`,
      )
      .all(deckId) as { series: string | null; color: string | null }[];
    if (rows.length === 0) return; // empty deck — nothing to infer

    const distinctSeries = new Set(rows.map((r) => r.series));
    const distinctColor = new Set(rows.map((r) => r.color));
    const sets: string[] = [];
    const params: unknown[] = [];
    if (needSeries && distinctSeries.size === 1) {
      sets.push("locked_series = ?");
      params.push([...distinctSeries][0]);
    }
    if (needColor && distinctColor.size === 1) {
      sets.push("locked_color = ?");
      params.push([...distinctColor][0]);
    }
    if (sets.length === 0) return; // mixed — can't safely lock
    params.push(deckId, currentUserId);
    db()
      .prepare(
        `UPDATE user.decks SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`,
      )
      .run(...params);
  }

  /**
   * Set (or clear, when `cardId === null`) the cover card for a deck.
   *
   * Color-sync semantics:
   *   - `mode = "auto"` (default): only sync accent_color(s) from the new
   *     cover card if BOTH conditions hold —
   *         1. deck.accent_color === defaultAccent  (user hasn't picked one)
   *         2. deck.cover_card_id IS NULL           (no prior cover)
   *     This makes the very first cover-set seed colors, but subsequent
   *     cover swaps respect whatever colors the user has chosen.
   *   - `mode = "force"`: always sync, regardless of prior state. Used by
   *     `applyCoverColor` (the explicit "match deck color to cover" button).
   *
   * Clearing the cover (`cardId === null`) never touches accent colors —
   * removing the cover shouldn't clobber the user's chosen palette.
   */
  function setDeckCover(
    currentUserId: string,
    deckId: string,
    cardId: string | null,
    mode: "auto" | "force" = "auto",
  ): void {
    assertUnlocked(deckId);
    if (cardId === null) {
      const r = db()
        .prepare(
          `UPDATE user.decks
             SET cover_card_id = NULL, cover_variant = '',
                 updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND user_id = ?`,
        )
        .run(deckId, currentUserId);
      if (r.changes === 0) throw new OwnershipError(deckId);
      return;
    }
    // Should we sync colors? Depends on mode + current state.
    let shouldSync = mode === "force";
    if (mode === "auto") {
      const cur = db()
        .prepare(
          `SELECT accent_color, cover_card_id FROM user.decks WHERE id = ?`,
        )
        .get(deckId) as
        { accent_color: string; cover_card_id: string | null } | undefined;
      if (cur?.accent_color === defaultAccent && cur?.cover_card_id === null) {
        shouldSync = true;
      }
    }

    // A variant key is only meaningful for the card it came from, so switching
    // cover cards resets to that card's base art.
    const sets: string[] = ["cover_card_id = ?", "cover_variant = ''"];
    const params: unknown[] = [cardId];
    if (shouldSync) {
      // Read the card's color(s). UA cards only have `color`; Digimon cards
      // have `color` + optional `color2`. readCardColors handles both via
      // a try/catch fallback.
      const colors = readCardColors(cardId);
      const accent = colors.color ? colorHex(colors.color) : null;
      const accent2 = colors.color2 ? colorHex(colors.color2) : null;
      if (accent) {
        sets.push("accent_color = ?");
        params.push(accent);
      }
      // Always write accent_color2 when syncing — either the new value or
      // NULL when the new cover is single-color (so the deck visually
      // matches).
      sets.push("accent_color2 = ?");
      params.push(accent2);
    }
    sets.push("updated_at = CURRENT_TIMESTAMP");
    params.push(deckId, currentUserId);
    const r = db()
      .prepare(
        `UPDATE user.decks SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`,
      )
      .run(...params);
    if (r.changes === 0) throw new OwnershipError(deckId);
  }

  /**
   * Pull `{ color, color2 }` for a card by id. UA's cards table has no
   * `color2`, so we try the two-column query first and fall back to the
   * single-column query on error. Cheaper than reading PRAGMA columns
   * every call.
   */
  function readCardColors(cardId: string): {
    color: string | null;
    color2: string | null;
  } {
    try {
      const r = db()
        .prepare(`SELECT color, color2 FROM cards WHERE id = ?`)
        .get(cardId) as
        { color: string | null; color2: string | null } | undefined;
      return { color: r?.color ?? null, color2: r?.color2 ?? null };
    } catch {
      const r = db()
        .prepare(`SELECT color FROM cards WHERE id = ?`)
        .get(cardId) as { color: string | null } | undefined;
      return { color: r?.color ?? null, color2: null };
    }
  }

  /**
   * "Add this card to which of MY decks" — used by the card-detail widget.
   * Filtered to the caller's own decks; we don't want users adding cards to
   * a friend's deck.
   */
  /**
   * Every deck of this user, with how many copies of one card each holds.
   *
   * Ordered by CREATION time, not by last edit. Sorting by `updated_at` meant
   * that adding a copy re-sorted the list under the reader's finger: the deck
   * you just clicked jumped to the top, and the next deck you meant to click
   * had moved. Creation order is stable while you work through a card.
   */
  function listDecksWithCardQty(
    currentUserId: string,
    cardId: string,
  ): DeckWithCardQty<TDeck>[] {
    return db()
      .prepare(
        `SELECT d.*,
                COALESCE((SELECT quantity FROM user.deck_cards WHERE deck_id = d.id AND card_id = ?), 0) AS card_qty,
                COALESCE((SELECT SUM(quantity) FROM user.deck_cards WHERE deck_id = d.id), 0) AS total
         FROM user.decks d
         WHERE d.user_id = ?
         ORDER BY d.created_at DESC, d.id`,
      )
      .all(cardId, currentUserId) as DeckWithCardQty<TDeck>[];
  }

  /** Any user can read any deck (friend-readable). */
  /**
   * For each deck this user owns, decide whether every card in the deck has
   * been fully purchased FOR THAT DECK. A deck_card counts as "covered" when
   * its per-deck `purchased` counter is at least its required `quantity`.
   *
   * This intentionally mirrors the "缺卡统计" tool's definition of missing
   * (`purchased < quantity`) so the ✓ badge on the decks grid and the deck
   * pill inside the tool always agree. We do NOT check the global
   * `card_collection` here — that's a separate concept (what cards the
   * user physically owns), and the user could legitimately have copies in
   * their collection without having earmarked them for this specific deck.
   *
   * Returns a Set of deck_ids that are complete (every card satisfied).
   * Decks with zero cards count as incomplete — an empty deck isn't really
   * "ready", and showing a ✓ on it would be misleading.
   */
  function getCompletedDeckIds(currentUserId: string): Set<string> {
    const rows = db()
      .prepare(
        `SELECT d.id AS deck_id
         FROM user.decks d
         WHERE d.user_id = ?
           AND EXISTS (SELECT 1 FROM user.deck_cards dc WHERE dc.deck_id = d.id)
           AND NOT EXISTS (
             SELECT 1 FROM user.deck_cards dc
             WHERE dc.deck_id = d.id
               AND dc.purchased < dc.quantity
           )`,
      )
      .all(currentUserId) as { deck_id: string }[];
    return new Set(rows.map((r) => r.deck_id));
  }

  function getDeck(id: string): TDeck | undefined {
    return db().prepare(`SELECT * FROM user.decks WHERE id = ?`).get(id) as
      TDeck | undefined;
  }

  function deleteDeck(currentUserId: string, id: string): void {
    // Deleting isn't editing, but it's the one thing a lock most obviously
    // has to stop — unlock first, deliberately.
    assertUnlocked(id);
    const r = db()
      .prepare(`DELETE FROM user.decks WHERE id = ? AND user_id = ?`)
      .run(id, currentUserId);
    if (r.changes === 0) throw new OwnershipError(id);
  }

  return {
    listDecks,
    listDecksWithCover,
    setDeckLocked,
    setDeckPinned,
    setDeckCoverVariant,
    reorderDecks,
    backfillLockFromCards,
    setDeckCover,
    listDecksWithCardQty,
    getCompletedDeckIds,
    getDeck,
    deleteDeck,
  };
}
