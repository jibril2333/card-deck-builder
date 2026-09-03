/**
 * 共享卡池 — decks that share one physical set of cards.
 *
 * The largest module and the one with the most rules of its own: held counts
 * are shared across member decks, so a change to one deck re-levels every
 * other deck in the pool (`levelGroupPurchased`), capped per deck at what
 * that deck actually needs.
 */

import { OwnershipError, type DbFn } from "./context";

export function createPools(db: DbFn) {
  // ────────────────────────────────────────────────────────────────────
  // Deck groups — several decks that SHARE one physical card pool. The owner
  // buys each shared card only once (the max any single member deck needs)
  // and reassembles whichever deck they're playing. All scoped to the group.
  // ────────────────────────────────────────────────────────────────────

  type DeckGroupLite = {
    id: string;
    name: string;
    accent_color: string;
    accent_color2: string | null;
  };
  type DeckGroupSummary = {
    id: string;
    name: string;
    user_id: string;
    created_at: string;
    decks: DeckGroupLite[];
  };

  function listGroups(currentUserId: string): DeckGroupSummary[] {
    const groups = db()
      .prepare(
        `SELECT id, name, user_id, created_at FROM user.deck_groups
         WHERE user_id = ? ORDER BY created_at DESC`,
      )
      .all(currentUserId) as Omit<DeckGroupSummary, "decks">[];
    if (groups.length === 0) return [];
    const members = db()
      .prepare(
        `SELECT m.group_id, d.id, d.name, d.accent_color, d.accent_color2
         FROM user.deck_group_members m
         JOIN user.decks d ON d.id = m.deck_id
         WHERE m.group_id IN (${groups.map(() => "?").join(",")})
         ORDER BY d.sort_order, d.name`,
      )
      .all(...groups.map((g) => g.id)) as (DeckGroupLite & {
      group_id: string;
    })[];
    const byGroup = new Map<string, DeckGroupLite[]>();
    for (const m of members) {
      const { group_id, ...deck } = m;
      (byGroup.get(group_id) ?? byGroup.set(group_id, []).get(group_id)!).push(
        deck,
      );
    }
    return groups.map((g) => ({ ...g, decks: byGroup.get(g.id) ?? [] }));
  }

  function getGroup(
    currentUserId: string,
    groupId: string,
  ): DeckGroupSummary | undefined {
    const g = db()
      .prepare(
        `SELECT id, name, user_id, created_at FROM user.deck_groups
         WHERE id = ? AND user_id = ?`,
      )
      .get(groupId, currentUserId) as
      Omit<DeckGroupSummary, "decks"> | undefined;
    if (!g) return undefined;
    const decks = db()
      .prepare(
        `SELECT d.id, d.name, d.accent_color, d.accent_color2
         FROM user.deck_group_members m
         JOIN user.decks d ON d.id = m.deck_id
         WHERE m.group_id = ?
         ORDER BY d.sort_order, d.name`,
      )
      .all(groupId) as DeckGroupLite[];
    return { ...g, decks };
  }

  function createGroup(currentUserId: string, name: string): string {
    const id = crypto.randomUUID();
    db()
      .prepare(
        `INSERT INTO user.deck_groups (id, name, user_id) VALUES (?, ?, ?)`,
      )
      .run(id, name, currentUserId);
    return id;
  }

  function renameGroup(
    currentUserId: string,
    groupId: string,
    name: string,
  ): void {
    const r = db()
      .prepare(
        `UPDATE user.deck_groups SET name = ? WHERE id = ? AND user_id = ?`,
      )
      .run(name, groupId, currentUserId);
    if (r.changes === 0) throw new OwnershipError(groupId);
  }

  function deleteGroup(currentUserId: string, groupId: string): void {
    // Members cascade via FK. Ownership enforced by the WHERE.
    db()
      .prepare(`DELETE FROM user.deck_groups WHERE id = ? AND user_id = ?`)
      .run(groupId, currentUserId);
  }

  /** Replace a group's membership with `deckIds` (only decks the user owns). */
  function setGroupDecks(
    currentUserId: string,
    groupId: string,
    deckIds: string[],
  ): void {
    const owns = db()
      .prepare(`SELECT 1 FROM user.deck_groups WHERE id = ? AND user_id = ?`)
      .get(groupId, currentUserId);
    if (!owns) throw new OwnershipError(groupId);
    const tx = db().transaction(() => {
      db()
        .prepare(`DELETE FROM user.deck_group_members WHERE group_id = ?`)
        .run(groupId);
      const ins = db().prepare(
        `INSERT OR IGNORE INTO user.deck_group_members (group_id, deck_id)
         SELECT ?, id FROM user.decks WHERE id = ? AND user_id = ?`,
      );
      for (const deckId of deckIds) ins.run(groupId, deckId, currentUserId);
    });
    tx();
    // Newly-pooled decks inherit the best-stocked deck's held count per card.
    levelGroupPurchased(groupId);
  }

  /**
   * The same membership edit seen from one deck: which pools this deck is in.
   * `setGroupDecks` can only be driven from a group, so a deck page had no way
   * to pool a deck without first knowing which group to open.
   *
   * A group only ever holds its own owner's decks (`setGroupDecks` inserts via
   * a `user_id`-checked SELECT), so scoping both sides to `currentUserId` is
   * enough to keep one user's edit out of another's pool.
   */
  function setDeckGroups(
    currentUserId: string,
    deckId: string,
    groupIds: string[],
  ): void {
    const ownsDeck = db()
      .prepare(`SELECT 1 FROM user.decks WHERE id = ? AND user_id = ?`)
      .get(deckId, currentUserId);
    if (!ownsDeck) throw new OwnershipError(deckId);

    const before = (
      db()
        .prepare(
          `SELECT m.group_id FROM user.deck_group_members m
             JOIN user.deck_groups g ON g.id = m.group_id
            WHERE m.deck_id = ? AND g.user_id = ?`,
        )
        .all(deckId, currentUserId) as { group_id: string }[]
    ).map((r) => r.group_id);

    const tx = db().transaction(() => {
      db()
        .prepare(
          `DELETE FROM user.deck_group_members
            WHERE deck_id = ?
              AND group_id IN (SELECT id FROM user.deck_groups WHERE user_id = ?)`,
        )
        .run(deckId, currentUserId);
      const ins = db().prepare(
        `INSERT OR IGNORE INTO user.deck_group_members (group_id, deck_id)
         SELECT id, ? FROM user.deck_groups WHERE id = ? AND user_id = ?`,
      );
      for (const groupId of groupIds) ins.run(deckId, groupId, currentUserId);
    });
    tx();
    // Every pool whose membership moved has to re-level, exactly as it would
    // have if the same edit had been made from the group side.
    for (const groupId of new Set([...before, ...groupIds])) {
      levelGroupPurchased(groupId);
    }
  }

  type GroupPoolCard = {
    card_id: string;
    code: string;
    name: string;
    card_type: string;
    color: string | null;
    image_url: string | null;
    /** deckId → quantity in that deck. */
    perDeck: Record<string, number>;
    /** Copies to physically own = the most any single member deck needs. */
    need: number;
    /** Copies if every deck were stocked separately = sum across decks. */
    separate: number;
    /** Pooled held count = the shared `purchased` (max across member decks). */
    owned: number;
  };

  /**
   * The pooled card requirement for a group: one row per distinct card across
   * all member decks, with its per-deck quantities, the `need` (max — what to
   * own when you swap), `separate` (sum — buying per-deck), and `owned` (the
   * shared held count, kept in sync across the member decks' `purchased`).
   */
  function getGroupPool(groupId: string): GroupPoolCard[] {
    const rows = db()
      .prepare(
        `SELECT dc.deck_id, dc.card_id, dc.quantity, dc.purchased,
                c.code, c.name, c.card_type, c.color, c.image_url
         FROM user.deck_group_members m
         JOIN user.deck_cards dc ON dc.deck_id = m.deck_id
         JOIN cards c ON c.id = dc.card_id
         WHERE m.group_id = ?`,
      )
      .all(groupId) as {
      deck_id: string;
      card_id: string;
      quantity: number;
      purchased: number;
      code: string;
      name: string;
      card_type: string;
      color: string | null;
      image_url: string | null;
    }[];

    const byCard = new Map<string, GroupPoolCard>();
    for (const r of rows) {
      let g = byCard.get(r.card_id);
      if (!g) {
        g = {
          card_id: r.card_id,
          code: r.code,
          name: r.name,
          card_type: r.card_type,
          color: r.color,
          image_url: r.image_url,
          perDeck: {},
          need: 0,
          separate: 0,
          owned: 0,
        };
        byCard.set(r.card_id, g);
      }
      g.perDeck[r.deck_id] = r.quantity;
      g.need = Math.max(g.need, r.quantity);
      g.separate += r.quantity;
      g.owned = Math.max(g.owned, r.purchased);
    }
    return [...byCard.values()];
  }

  // ── Pooled "held" sync ────────────────────────────────────────────────
  // A pool shares one physical card set, so a card's held count is shared by
  // all member decks: each deck's `purchased` is kept at min(its qty, owned).
  // Editing held anywhere recomputes `owned` and re-applies that invariant.

  /** Member deck ids of a group (no ownership check — callers gate the group). */
  function groupMemberDeckIds(groupId: string): string[] {
    return (
      db()
        .prepare(
          `SELECT deck_id FROM user.deck_group_members WHERE group_id = ?`,
        )
        .all(groupId) as { deck_id: string }[]
    ).map((r) => r.deck_id);
  }

  /**
   * All of the user's decks that share at least one pool with `deckId`,
   * INCLUDING `deckId` itself. Used to propagate a per-deck held edit.
   */
  function decksSharingPoolWith(
    currentUserId: string,
    deckId: string,
  ): string[] {
    const rows = db()
      .prepare(
        `SELECT DISTINCT m2.deck_id
         FROM user.deck_group_members m1
         JOIN user.deck_group_members m2 ON m2.group_id = m1.group_id
         JOIN user.decks d ON d.id = m2.deck_id
         WHERE m1.deck_id = ? AND d.user_id = ?`,
      )
      .all(deckId, currentUserId) as { deck_id: string }[];
    const ids = rows.map((r) => r.deck_id);
    // If the deck is in no group, `ids` is empty — caller treats that as
    // "not pooled" and falls back to single-deck behavior.
    return ids;
  }

  /**
   * Current shared held for a card across a set of decks. Each deck's real
   * held is min(purchased, quantity) — capped so a stale over-purchase or a
   * just-added 0-held copy can't distort the pool — and the pool's held is the
   * max of those.
   */
  function pooledOwnedForCard(deckIds: string[], cardId: string): number {
    if (deckIds.length === 0) return 0;
    const r = db()
      .prepare(
        `SELECT COALESCE(MAX(MIN(purchased, quantity)), 0) AS owned
         FROM user.deck_cards
         WHERE card_id = ? AND deck_id IN (${deckIds.map(() => "?").join(",")})`,
      )
      .get(cardId, ...deckIds) as { owned: number };
    return r.owned;
  }

  /** Highest quantity any of the decks runs of a card (the pool's `need`). */
  function maxNeedForCard(deckIds: string[], cardId: string): number {
    if (deckIds.length === 0) return 0;
    const r = db()
      .prepare(
        `SELECT COALESCE(MAX(quantity), 0) AS n FROM user.deck_cards
         WHERE card_id = ? AND deck_id IN (${deckIds.map(() => "?").join(",")})`,
      )
      .get(cardId, ...deckIds) as { n: number };
    return r.n;
  }

  /**
   * Apply the shared-held invariant for one card across `deckIds`: every deck
   * that runs the card gets purchased = min(its quantity, owned). Bumps the
   * touched decks' timestamps.
   */
  function reconcilePoolCard(
    deckIds: string[],
    cardId: string,
    owned: number,
  ): void {
    if (deckIds.length === 0) return;
    const placeholders = deckIds.map(() => "?").join(",");
    const tx = db().transaction(() => {
      db()
        .prepare(
          // Locked peers are skipped, not refused: one closed deck in a pool
          // must not stop the others from being levelled.
          `UPDATE user.deck_cards SET purchased = MIN(quantity, ?)
           WHERE card_id = ? AND deck_id IN (${placeholders})
             AND deck_id IN (SELECT id FROM user.decks WHERE locked = 0)`,
        )
        .run(Math.max(0, owned), cardId, ...deckIds);
      db()
        .prepare(
          `UPDATE user.decks SET updated_at = CURRENT_TIMESTAMP
           WHERE id IN (${placeholders})`,
        )
        .run(...deckIds);
    });
    tx();
  }

  /**
   * Level a group's held counts: for every card across its member decks, set
   * the shared held to the current max(purchased) and re-apply the invariant.
   * Called when a group's membership changes so newly-pooled decks inherit the
   * best-stocked deck's held count.
   */
  function levelGroupPurchased(groupId: string): void {
    const members = groupMemberDeckIds(groupId);
    if (members.length < 2) return;
    const placeholders = members.map(() => "?").join(",");
    const cards = db()
      .prepare(
        `SELECT card_id, MAX(purchased) AS owned FROM user.deck_cards
         WHERE deck_id IN (${placeholders})
         GROUP BY card_id`,
      )
      .all(...members) as { card_id: string; owned: number }[];
    const tx = db().transaction(() => {
      for (const c of cards) {
        if (c.owned <= 0) continue;
        db()
          .prepare(
            `UPDATE user.deck_cards SET purchased = MIN(quantity, ?)
             WHERE card_id = ? AND deck_id IN (${placeholders})
               AND deck_id IN (SELECT id FROM user.decks WHERE locked = 0)`,
          )
          .run(c.owned, c.card_id, ...members);
      }
      db()
        .prepare(
          `UPDATE user.decks SET updated_at = CURRENT_TIMESTAMP
           WHERE id IN (${placeholders})`,
        )
        .run(...members);
    });
    tx();
  }

  return {
    listGroups,
    getGroup,
    createGroup,
    renameGroup,
    deleteGroup,
    setGroupDecks,
    setDeckGroups,
    getGroupPool,
    groupMemberDeckIds,
    decksSharingPoolWith,
    pooledOwnedForCard,
    maxNeedForCard,
    reconcilePoolCard,
  };
}
