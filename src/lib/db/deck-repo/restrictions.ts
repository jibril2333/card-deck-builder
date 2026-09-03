/**
 * How many copies the banlist allows, and which pairs may not share a deck.
 *
 * Reads `card_restrictions` plus the card's own self-declared limit, and is
 * the only module that knows the difference. `clampQuantityToRestriction` is
 * the one the card writes call — it is not part of the repo's public surface,
 * it is a dependency handed to `createCards`.
 */

import { type RepoCtx } from "./context";

export function createRestrictions(ctx: RepoCtx) {
  const { db, restrictionSource, identityForCode, seedSeries, seedColor } = ctx;

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
  function findBannedPairConflicts(deckId: string, cardId: string): string[] {
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
  /**
   * Some cards license their own copy limit in rules text — Digimon's
   * "(Rule) You can include up to 50 copies of cards with this card's card
   * number in your deck." (Vemmon, Eosmon, ADR-02 Searcher, …). Without this
   * they'd be clamped to the standard 4 and the deck would silently lose
   * copies.
   *
   * Read off `cards.main_effect`, which is the canonical ENGLISH text
   * regardless of the language the user is reading in, so one pattern covers
   * every locale. Returns null for ordinary cards.
   */
  function selfDeclaredCopyLimit(cardId: string): number | null {
    const row = db()
      .prepare(`SELECT main_effect FROM cards WHERE id = ?`)
      .get(cardId) as { main_effect: string | null } | undefined;
    const m = row?.main_effect?.match(
      /include up to (\d+) copies of cards with this card's card number/i,
    );
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function clampQuantityToRestriction(
    deckId: string,
    cardId: string,
    requested: number,
  ): number {
    const standardMax = 4;
    const restriction = getRestrictionFor(cardId);
    // A banlist entry always wins: an official restriction on one of these
    // cards is precisely the case where its own rules text stops applying.
    const selfLimit = restriction ? null : selfDeclaredCopyLimit(cardId);
    const cap = restriction
      ? restriction.max_count
      : (selfLimit ?? standardMax);

    let otherSum = 0;
    if (restriction) {
      otherSum = deckIdentityCountExcluding(
        deckId,
        restriction.identity,
        cardId,
      );
    } else if (selfLimit !== null) {
      // The allowance is worded per CARD NUMBER, so alt-art printings share
      // the same pool of copies.
      const row = db()
        .prepare(`SELECT code FROM cards WHERE id = ?`)
        .get(cardId) as { code: string } | undefined;
      if (row) {
        otherSum = deckIdentityCountExcluding(
          deckId,
          identityForCode(row.code),
          cardId,
        );
      }
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
        .prepare(`SELECT ${cols.join(", ")} FROM user.decks WHERE id = ?`)
        .get(deckId) as
        | { locked_series?: string | null; locked_color?: string | null }
        | undefined;
      if (deck) {
        const lockedSeries = seedSeries ? (deck.locked_series ?? null) : null;
        const lockedColor = seedColor ? (deck.locked_color ?? null) : null;
        if (lockedSeries !== null || lockedColor !== null) {
          const card = db()
            .prepare(`SELECT series, color FROM cards WHERE id = ?`)
            .get(cardId) as
            { series: string | null; color: string | null } | undefined;
          if (card) {
            if (lockedSeries !== null && card.series !== lockedSeries) {
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
    selfDeclaredCopyLimit,
    listRestrictions,
    listBannedPairs,
    clampQuantityToRestriction,
  };
}
