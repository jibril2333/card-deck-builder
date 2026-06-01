/**
 * Shared deck-repository implementation for both games.
 *
 * Why this exists:
 *   Both `digimon.ts` and `unionarena.ts` ship ~15 functions that do the SAME
 *   thing — manipulate `user.decks` / `user.deck_cards` / `user.card_prices`.
 *   The only real differences are:
 *     - the row type (DigimonCard vs UACard, DigimonDeck vs UADeck)
 *     - the ORDER BY column inside getDeckCards (level vs energy_cost)
 *
 * Multi-user model:
 *   - Reads (list / get) return EVERY user's decks; the auth layer above
 *     enforces "your own decks first" via sort, but nothing is hidden.
 *     This implements the "friends can view each other's decks (read-only)"
 *     product decision.
 *   - Writes require a `userId` and use `WHERE id = ? AND user_id = ?` so a
 *     mutation against a deck the caller doesn't own affects 0 rows. The
 *     repo throws `OwnershipError` in that case; the action layer maps that
 *     to a 403-shaped response.
 */

import type Database from "better-sqlite3";
import { colorHex } from "@/lib/games";

type DeckCommon = {
  id: string;
  name: string;
  notes: string | null;
  accent_color: string;
  accent_color2: string | null;
  cover_card_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  user_id: string | null;
};

type RepoOptions = {
  /** Returns the live SQLite connection for this game. Called per-method so
   *  HMR-refreshed connections are picked up automatically. */
  db: () => Database.Database;
  /** ORDER BY clause body for `getDeckCards`. Differs by game's most-useful
   *  default sort (Digimon: level, UA: energy_cost). */
  deckCardOrderBy: string;
  /** Source key in `card_restrictions`, e.g. "digimon" / "unionarena". */
  restrictionSource: string;
  /** Map a `cards.code` to its restriction identity for deck-limit checks.
   *  - Digimon: identity = code (alt-art lives in card_images table)
   *  - UA: identity = code with `_pN` parallel suffix stripped
   *  The official wording for both games says restrictions cover all
   *  printings of the same card, so the identity collapses alt-art. */
  identityForCode: (code: string) => string;
  /** Game's default deck accent color — the literal string `createDeck`
   *  writes for new decks. Used as the "user hasn't customized yet"
   *  sentinel in setDeckCover (auto mode) and the optional first-card
   *  seeds below. Keep this in lock-step with the createDeck default. */
  defaultAccent: string;
  /** First-card seeding behavior. When ANY of these flags is on, adding a
   *  card to an empty deck will (conditionally) seed the corresponding
   *  field from the card. Each flag also enables ENFORCEMENT of the
   *  corresponding lock in `clampQuantityToRestriction` going forward.
   *
   *  Seed only fires for fields that aren't already set:
   *    - `accent`: deck.accent_color still equals `defaultAccent`
   *    - `series`: deck.locked_series IS NULL
   *    - `color`:  deck.locked_color  IS NULL
   *
   *  UA: `{ accent: true, series: true, color: true }` — official rules
   *      are single-作品 + single-color per deck.
   *  Digimon: omit — multicolor cards exist; no series/color lock.
   *
   *  Note: `series` and `color` flags assume the user.decks table has
   *  `locked_series` and `locked_color` columns. Only enable for games
   *  whose schema actually has them. */
  firstCardSeed?: {
    accent?: boolean;
    series?: boolean;
    color?: boolean;
  };
};

export type DeckWithCover<TDeck> = TDeck & {
  cover_image_url: string | null;
  cover_code: string | null;
  owner_id: string | null;
  owner_name: string | null;
};

export type DeckWithCardQty<TDeck> = TDeck & {
  card_qty: number;
  total: number;
};

export type DeckCardRow<TCard> = TCard & {
  quantity: number;
  purchased: number;
  price: number | null;
};

export class OwnershipError extends Error {
  constructor(deckId: string) {
    super(`deck ${deckId} not owned by current user (or does not exist)`);
    this.name = "OwnershipError";
  }
}

export function createDeckRepo<TCard, TDeck extends DeckCommon>(
  opts: RepoOptions,
) {
  const { db, deckCardOrderBy, restrictionSource, identityForCode } = opts;
  const defaultAccent = opts.defaultAccent;
  const seedAccent = !!opts.firstCardSeed?.accent;
  const seedSeries = !!opts.firstCardSeed?.series;
  const seedColor = !!opts.firstCardSeed?.color;
  /** Has *any* first-card behavior — gates expensive pre-write SELECTs. */
  const hasAnyFirstCardSeed = seedAccent || seedSeries || seedColor;

  /**
   * Look up the official banlist / restricted-list cap for the card the
   * deck is trying to add. Returns null if no restriction applies (the
   * card uses the standard 4-copy limit).
   */
  function getRestrictionFor(cardId: string): {
    identity: string;
    max_count: number;
  } | null {
    const row = db()
      .prepare(`SELECT code FROM cards WHERE id = ?`)
      .get(cardId) as { code: string } | undefined;
    if (!row) return null;
    const identity = identityForCode(row.code);
    const r = db()
      .prepare(
        `SELECT max_count FROM card_restrictions
         WHERE source = ? AND identity = ?`,
      )
      .get(restrictionSource, identity) as { max_count: number } | undefined;
    if (!r) return null;
    return { identity, max_count: r.max_count };
  }

  /**
   * Given a restriction identity, return how many copies the deck already
   * contains across all cards that share this identity, EXCLUDING the one
   * the caller is about to change. Used to clamp the new quantity so the
   * total identity-wide stays at-or-below the restriction.
   */
  function deckIdentityCountExcluding(
    deckId: string,
    identity: string,
    excludeCardId: string,
  ): number {
    const rows = db()
      .prepare(
        `SELECT dc.quantity, c.code
         FROM user.deck_cards dc
         JOIN cards c ON c.id = dc.card_id
         WHERE dc.deck_id = ? AND dc.card_id != ?`,
      )
      .all(deckId, excludeCardId) as { quantity: number; code: string }[];
    let total = 0;
    for (const r of rows) {
      if (identityForCode(r.code) === identity) total += r.quantity;
    }
    return total;
  }

  /**
   * For the deck + card pair, find every OTHER card currently in the deck
   * that the official banlist says can't coexist with this one (Digimon's
   * "Banned Pair" rule). Check is symmetric: it doesn't matter whether
   * the incoming card is the "A" trigger or one of the "B" banned cards —
   * both directions return a conflict.
   *
   * Identity matching: like restrictions, banned_pairs stores base codes
   * (no `_pN` suffix). Both the incoming card and the deck's existing
   * cards are reduced to identity via the same `_p`-stripping CASE so
   * parallel printings count.
   *
   * Returns `card_id`s actually present in the deck (not just identities)
   * so the caller / UI can name the offender concretely.
   */
  function findBannedPairConflicts(
    deckId: string,
    cardId: string,
  ): string[] {
    const row = db()
      .prepare(`SELECT code FROM cards WHERE id = ?`)
      .get(cardId) as { code: string } | undefined;
    if (!row) return [];
    const myIdentity = identityForCode(row.code);

    // Symmetric lookup: this identity could be the trigger (A) or the
    // banned (B) side. UNION returns the OPPOSING identities either way.
    const opposing = db()
      .prepare(
        `SELECT banned_identity  AS other FROM banned_pairs
            WHERE source = ? AND trigger_identity = ?
          UNION
          SELECT trigger_identity AS other FROM banned_pairs
            WHERE source = ? AND banned_identity  = ?`,
      )
      .all(restrictionSource, myIdentity, restrictionSource, myIdentity) as {
      other: string;
    }[];
    if (opposing.length === 0) return [];

    const placeholders = opposing.map(() => "?").join(",");
    const hits = db()
      .prepare(
        `SELECT dc.card_id
           FROM user.deck_cards dc
           JOIN cards c ON c.id = dc.card_id
          WHERE dc.deck_id = ?
            AND dc.quantity > 0
            AND CASE
              WHEN instr(c.code, '_p') > 0
                THEN substr(c.code, 1, instr(c.code, '_p') - 1)
              ELSE c.code
            END IN (${placeholders})`,
      )
      .all(deckId, ...opposing.map((o) => o.other)) as { card_id: string }[];
    return hits.map((r) => r.card_id);
  }

  /**
   * Clamp a requested quantity for `cardId` in `deckId` to whatever the
   * official restriction allows. Standard cards default to ≤4; banned →
   * 0; limited_1 → 1; limited_2 → 2. UA's "※パラレル含む" is handled by
   * the identity collapsing alt-arts.
   *
   * Also enforces banned-pair rules: if the deck already contains a card
   * whose identity is paired with `cardId`'s identity in `banned_pairs`,
   * the requested quantity collapses to 0 — matching the existing strict
   * behavior for single-card banlist entries. (Means: touching either
   * side of an existing pair conflict will remove the side you touched.
   * That self-heals broken decks one edit at a time without us having to
   * proactively mutate user data on banlist updates.)
   */
  function clampQuantityToRestriction(
    deckId: string,
    cardId: string,
    requested: number,
  ): number {
    const standardMax = 4;
    const restriction = getRestrictionFor(cardId);
    const cap = restriction ? restriction.max_count : standardMax;

    let otherSum = 0;
    if (restriction) {
      otherSum = deckIdentityCountExcluding(deckId, restriction.identity, cardId);
    }
    const allowed = Math.max(0, cap - otherSum);
    const capped = Math.min(requested, allowed);
    if (capped <= 0) return 0;

    // Banned-pair check is independent of cap. Only matters when the
    // caller wants quantity > 0; if they're zeroing the card out we let
    // the removal proceed.
    const pairConflicts = findBannedPairConflicts(deckId, cardId);
    if (pairConflicts.length > 0) return 0;

    // Series + color lock enforcement (UA only — gated by the same flags
    // that drive first-card seeding). For games whose schema doesn't have
    // these columns (Digimon), the flags are off so no SELECT runs.
    if (seedSeries || seedColor) {
      const cols: string[] = [];
      if (seedSeries) cols.push("locked_series");
      if (seedColor) cols.push("locked_color");
      const deck = db()
        .prepare(
          `SELECT ${cols.join(", ")} FROM user.decks WHERE id = ?`,
        )
        .get(deckId) as
        | { locked_series?: string | null; locked_color?: string | null }
        | undefined;
      if (deck) {
        const lockedSeries = seedSeries ? deck.locked_series ?? null : null;
        const lockedColor = seedColor ? deck.locked_color ?? null : null;
        if (lockedSeries !== null || lockedColor !== null) {
          const card = db()
            .prepare(`SELECT series, color FROM cards WHERE id = ?`)
            .get(cardId) as
            | { series: string | null; color: string | null }
            | undefined;
          if (card) {
            if (
              lockedSeries !== null &&
              card.series !== lockedSeries
            ) {
              return 0;
            }
            if (lockedColor !== null && card.color !== lockedColor) {
              return 0;
            }
          }
        }
      }
    }

    return capped;
  }

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
                c.image_url AS cover_image_url,
                c.code AS cover_code,
                u.id AS owner_id,
                u.display_name AS owner_name
         FROM user.decks d
         LEFT JOIN cards c ON c.id = d.cover_card_id
         LEFT JOIN user.users u ON u.id = d.user_id
         ORDER BY (d.user_id = ?) DESC, d.sort_order ASC, d.updated_at DESC`,
      )
      .all(currentUserId) as DeckWithCover<TDeck>[];
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
    if (cardId === null) {
      const r = db()
        .prepare(
          `UPDATE user.decks
             SET cover_card_id = NULL, updated_at = CURRENT_TIMESTAMP
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
        | { accent_color: string; cover_card_id: string | null }
        | undefined;
      if (
        cur?.accent_color === defaultAccent &&
        cur?.cover_card_id === null
      ) {
        shouldSync = true;
      }
    }

    const sets: string[] = ["cover_card_id = ?"];
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
        .get(cardId) as { color: string | null; color2: string | null } | undefined;
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
         ORDER BY d.updated_at DESC`,
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
    return db()
      .prepare(`SELECT * FROM user.decks WHERE id = ?`)
      .get(id) as TDeck | undefined;
  }

  /**
   * Any user can read any deck's cards. The `price` column is resolved via a
   * three-tier fallback:
   *   1. The deck-owner's manually-entered price (user.card_prices).
   *   2. The legacy "global" manual price (user.card_prices with NULL user_id).
   *   3. The scraped Cardrush market price for the base printing
   *      (external_prices).
   *
   * That is: manual numbers always win — they're the user's authoritative
   * intent ("this card is worth ¥X to me"). External prices only fill in the
   * gaps, so deck totals reflect real market value for cards the user hasn't
   * bothered to tag.
   */
  function getDeckCards(deckId: string): DeckCardRow<TCard>[] {
    return db()
      .prepare(
        `SELECT c.*, dc.quantity, dc.purchased,
                COALESCE(
                  (SELECT p.price FROM user.card_prices p
                    WHERE p.card_id = c.id AND p.user_id = (SELECT user_id FROM user.decks WHERE id = ?)),
                  (SELECT p.price FROM user.card_prices p
                    WHERE p.card_id = c.id AND p.user_id IS NULL),
                  (SELECT ep.price_yen FROM external_prices ep
                    WHERE ep.card_id = c.id
                      AND ep.source = 'cardrush'
                      AND ep.variant_type = 'base')
                ) AS price
         FROM user.deck_cards dc
         JOIN cards c ON c.id = dc.card_id
         WHERE dc.deck_id = ?
         ORDER BY ${deckCardOrderBy}`,
      )
      .all(deckId, deckId) as DeckCardRow<TCard>[];
  }

  /**
   * Resolve "the price this user paid attention to" for a card. Composite-PK
   * card_prices means a single card_id can have many rows. Lookup order:
   *   1. The caller's own entry (user_id = currentUserId).
   *   2. The legacy "global" entry (user_id IS NULL) — written by older
   *      single-user installs. Treated as a read-only default.
   */
  function getCardPrice(
    currentUserId: string,
    cardId: string,
  ): number | null {
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

  function deckCardCount(deckId: string): number {
    const r = db()
      .prepare(
        `SELECT COALESCE(SUM(dc.quantity), 0) as n FROM user.deck_cards dc WHERE dc.deck_id = ?`,
      )
      .get(deckId) as { n: number };
    return r.n;
  }

  function deleteDeck(currentUserId: string, id: string): void {
    const r = db()
      .prepare(`DELETE FROM user.decks WHERE id = ? AND user_id = ?`)
      .run(id, currentUserId);
    if (r.changes === 0) throw new OwnershipError(id);
  }

  function setDeckCardQuantity(
    currentUserId: string,
    deckId: string,
    cardId: string,
    quantity: number,
  ): void {
    // Silent clamp against the official restrictions table. If the user
    // asks for "4 of a banned card", we record 0; their UI's optimistic
    // update then snaps back to 0 on the next refresh.
    quantity = clampQuantityToRestriction(deckId, cardId, Math.max(0, quantity));

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
          .prepare(
            `SELECT ${cols.join(", ")} FROM user.decks WHERE id = ?`,
          )
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
            | { color: string | null; series: string | null }
            | undefined;
          if (card) {
            const next: FirstCardSeed = {};
            if (
              seedAccent &&
              deckRow.accent_color === defaultAccent &&
              card.color
            ) {
              next.accent_color = colorHex(card.color);
            }
            if (
              seedSeries &&
              deckRow.locked_series == null &&
              card.series
            ) {
              next.locked_series = card.series;
            }
            if (
              seedColor &&
              deckRow.locked_color == null &&
              card.color
            ) {
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

  function setDeckCardPurchased(
    currentUserId: string,
    deckId: string,
    cardId: string,
    purchased: number,
  ): void {
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

  /**
   * Full banlist / limited-list dump for the restrictions page.
   *
   * Joins each restriction to its base-print card row (cards.code = identity)
   * so the UI can render thumbnails + names without a second round-trip. For
   * UA, the identity is already the base code (no `_p` suffix), so the simple
   * equality join hits the base print. For digimon, identity == cards.code by
   * construction. Cards with no matching row come back with null card fields
   * (caller renders a placeholder).
   *
   * Sorted: banned first, then limited_1, then limited_2; alphabetic within
   * each group. The grouping matches how restriction status is taxonomized,
   * so the page can group-render without a second sort pass.
   */
  function listRestrictions(): {
    identity: string;
    status: "banned" | "limited_1" | "limited_2";
    max_count: number;
    since_date: string | null;
    includes_parallel: number; // 0/1 from SQLite
    fetched_at: string;
    card_id: string | null;
    card_code: string | null;
    card_name: string | null;
    card_image_url: string | null;
    card_color: string | null;
    card_type: string | null;
  }[] {
    return db()
      .prepare(
        `SELECT r.identity, r.status, r.max_count, r.since_date,
                r.includes_parallel, r.fetched_at,
                c.id AS card_id, c.code AS card_code, c.name AS card_name,
                c.image_url AS card_image_url, c.color AS card_color,
                c.card_type AS card_type
           FROM card_restrictions r
           LEFT JOIN cards c ON c.code = r.identity
          WHERE r.source = ?
          ORDER BY
            CASE r.status
              WHEN 'banned' THEN 0
              WHEN 'limited_1' THEN 1
              WHEN 'limited_2' THEN 2
              ELSE 9
            END,
            r.identity`,
      )
      .all(restrictionSource) as ReturnType<typeof listRestrictions>;
  }

  /**
   * Full banned-pair dump for the restrictions page (or whoever wants it).
   *
   * Returns one row per A→B edge (the raw schema shape). The page is
   * responsible for grouping by trigger if it wants A-led groupings.
   * Each row JOINs the cards table twice (once per side) so the renderer
   * has names + thumbnails for both ends with no extra round-trips.
   *
   * Sort: by trigger code, then banned code, for stable rendering.
   */
  function listBannedPairs(): {
    trigger_identity: string;
    banned_identity: string;
    fetched_at: string;
    trigger_code: string | null;
    trigger_name: string | null;
    trigger_image_url: string | null;
    trigger_color: string | null;
    banned_code: string | null;
    banned_name: string | null;
    banned_image_url: string | null;
    banned_color: string | null;
  }[] {
    return db()
      .prepare(
        `SELECT p.trigger_identity, p.banned_identity, p.fetched_at,
                ca.code        AS trigger_code,
                ca.name        AS trigger_name,
                ca.image_url   AS trigger_image_url,
                ca.color       AS trigger_color,
                cb.code        AS banned_code,
                cb.name        AS banned_name,
                cb.image_url   AS banned_image_url,
                cb.color       AS banned_color
           FROM banned_pairs p
           LEFT JOIN cards ca ON ca.code = p.trigger_identity
           LEFT JOIN cards cb ON cb.code = p.banned_identity
          WHERE p.source = ?
          ORDER BY p.trigger_identity, p.banned_identity`,
      )
      .all(restrictionSource) as ReturnType<typeof listBannedPairs>;
  }

  return {
    listDecks,
    listDecksWithCover,
    reorderDecks,
    setDeckCover,
    backfillLockFromCards,
    listDecksWithCardQty,
    getCompletedDeckIds,
    getDeck,
    getDeckCards,
    getCardPrice,
    setCardPrice,
    deckCardCount,
    deleteDeck,
    setDeckCardQuantity,
    setDeckCardPurchased,
    adjustDeckCardPurchased,
    listRestrictions,
    listBannedPairs,
    adjustDeckCard,
  };
}
