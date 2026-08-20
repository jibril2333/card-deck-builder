/**
 * Reading one account out of the database, and writing one back in.
 *
 * Kept out of db/digimon.ts because it is the only code here that crosses
 * between installs: everything else assumes "the database" is the one truth,
 * while this has to translate ids that mean nothing on the other side. See
 * lib/user-data.ts for what the file contains and what it deliberately omits.
 */

import { getDB } from "./connection";
import {
  USER_EXPORT_FORMAT,
  USER_EXPORT_VERSION,
  type ExportedDeck,
  type ImportReport,
  type UserExport,
} from "../user-data";

const db = () => getDB("digimon");

export function exportUserData(userId: string, note?: string): UserExport {
  const d = db();

  const decks = d
    .prepare(
      `SELECT id, name, notes, accent_color, accent_color2, cover_card_id,
              cover_variant, sort_order, pinned, version, locked,
              created_at, updated_at
         FROM user.decks WHERE user_id = ? ORDER BY sort_order, created_at`,
    )
    .all(userId) as (Omit<ExportedDeck, "cards" | "adjustments" | "cover_card_code"> & {
    cover_card_id: string | null;
  })[];

  // Card ids joined out to codes. A LEFT JOIN, not an inner one: a deck row
  // whose card vanished from the card database still belongs to the deck, and
  // dropping it silently here would make the export quietly lossy.
  const cardsFor = d.prepare(
    `SELECT COALESCE(c.code, dc.card_id) AS code, dc.quantity, dc.purchased
       FROM user.deck_cards dc
       LEFT JOIN cards c ON c.id = dc.card_id
      WHERE dc.deck_id = ?`,
  );
  const adjFor = d.prepare(
    `SELECT COALESCE(c.code, a.card_id) AS code, a.kind, a.quantity, a.note
       FROM user.deck_adjustments a
       LEFT JOIN cards c ON c.id = a.card_id
      WHERE a.deck_id = ?`,
  );

  const groups = (
    d
      .prepare(
        `SELECT id, name, created_at FROM user.deck_groups WHERE user_id = ?`,
      )
      .all(userId) as { id: string; name: string; created_at: string }[]
  ).map((g) => ({
    ...g,
    deckIds: (
      d
        .prepare(`SELECT deck_id FROM user.deck_group_members WHERE group_id = ?`)
        .all(g.id) as { deck_id: string }[]
    ).map((r) => r.deck_id),
  }));

  const collection = d
    .prepare(
      `SELECT COALESCE(c.code, cc.card_id) AS code, cc.variant, cc.quantity
         FROM user.card_collection cc
         LEFT JOIN cards c ON c.id = cc.card_id
        WHERE cc.user_id = ? AND cc.quantity > 0`,
    )
    .all(userId) as { code: string; variant: string; quantity: number }[];

  const prices = d
    .prepare(
      `SELECT COALESCE(c.code, p.card_id) AS code, p.price
         FROM user.card_prices p
         LEFT JOIN cards c ON c.id = p.card_id
        WHERE p.user_id = ?`,
    )
    .all(userId) as { code: string; price: number }[];

  return {
    format: USER_EXPORT_FORMAT,
    version: USER_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    source: { app: "card-deck-builder", note },
    decks: decks.map((deck) => ({
      ...deck,
      cover_card_code: deck.cover_card_id,
      cards: cardsFor.all(deck.id) as ExportedDeck["cards"],
      adjustments: adjFor.all(deck.id) as ExportedDeck["adjustments"],
    })),
    groups,
    collection,
    prices,
  };
}

/**
 * Write an export into this install, owned by `userId`.
 *
 * Every row is re-pointed at the importing user — that is the whole point, and
 * it's why the file carries no account. Deck ids are KEPT so that re-importing
 * an updated file updates the same decks instead of duplicating them; a deck
 * id that already belongs to somebody else is skipped and reported rather than
 * taken over.
 *
 * `replace` empties this user's own data first. Off by default: merging is
 * recoverable, and a mis-click that erases 55 decks is not.
 */
export function importUserData(
  userId: string,
  data: UserExport,
  opts: { replace?: boolean } = {},
): ImportReport {
  const d = db();
  const report: ImportReport = {
    decks: { created: 0, updated: 0 },
    cards: 0,
    groups: 0,
    collection: 0,
    prices: 0,
    missingCards: [],
    conflicts: [],
  };

  // code → id for every card this install knows. One query instead of one per
  // row: an export with 1000 deck_cards would otherwise be 1000 lookups.
  const idByCode = new Map<string, string>();
  for (const r of d.prepare(`SELECT id, code FROM cards`).all() as {
    id: string;
    code: string;
  }[]) {
    idByCode.set(r.code, r.id);
  }
  const missing = new Set<string>();
  const cardId = (code: string): string | null => {
    const id = idByCode.get(code);
    if (!id) missing.add(code);
    return id ?? null;
  };

  const ownerOf = d.prepare(`SELECT user_id FROM user.decks WHERE id = ?`);

  d.transaction(() => {
    if (opts.replace) {
      const mine = (
        d.prepare(`SELECT id FROM user.decks WHERE user_id = ?`).all(userId) as {
          id: string;
        }[]
      ).map((r) => r.id);
      for (const id of mine) {
        d.prepare(`DELETE FROM user.deck_cards WHERE deck_id = ?`).run(id);
        d.prepare(`DELETE FROM user.deck_adjustments WHERE deck_id = ?`).run(id);
        d.prepare(`DELETE FROM user.deck_group_members WHERE deck_id = ?`).run(id);
      }
      d.prepare(`DELETE FROM user.decks WHERE user_id = ?`).run(userId);
      d.prepare(`DELETE FROM user.deck_groups WHERE user_id = ?`).run(userId);
      d.prepare(`DELETE FROM user.card_collection WHERE user_id = ?`).run(userId);
      d.prepare(`DELETE FROM user.card_prices WHERE user_id = ?`).run(userId);
    }

    for (const deck of data.decks) {
      const existing = ownerOf.get(deck.id) as { user_id: string | null } | undefined;
      if (existing && existing.user_id !== userId) {
        report.conflicts.push(deck.name);
        continue;
      }
      const cover = deck.cover_card_code ? cardId(deck.cover_card_code) : null;
      d.prepare(
        `INSERT INTO user.decks
           (id, name, notes, accent_color, accent_color2, cover_card_id,
            cover_variant, sort_order, pinned, version, locked,
            created_at, updated_at, user_id)
         VALUES (@id, @name, @notes, @accent_color, @accent_color2, @cover,
                 @cover_variant, @sort_order, @pinned, @version, @locked,
                 @created_at, @updated_at, @user_id)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, notes = excluded.notes,
           accent_color = excluded.accent_color,
           accent_color2 = excluded.accent_color2,
           cover_card_id = excluded.cover_card_id,
           cover_variant = excluded.cover_variant,
           sort_order = excluded.sort_order, pinned = excluded.pinned,
           version = excluded.version, locked = excluded.locked,
           updated_at = excluded.updated_at`,
      ).run({
        id: deck.id,
        name: deck.name,
        notes: deck.notes,
        accent_color: deck.accent_color,
        accent_color2: deck.accent_color2,
        cover,
        cover_variant: deck.cover_variant ?? "",
        sort_order: deck.sort_order ?? 0,
        pinned: deck.pinned ?? 0,
        version: deck.version ?? null,
        locked: deck.locked ?? 0,
        created_at: deck.created_at,
        updated_at: deck.updated_at,
        user_id: userId,
      });
      if (existing) report.decks.updated++;
      else report.decks.created++;

      // The deck's contents are replaced wholesale rather than merged: a card
      // removed in the source should not survive in the destination.
      d.prepare(`DELETE FROM user.deck_cards WHERE deck_id = ?`).run(deck.id);
      for (const c of deck.cards) {
        const id = cardId(c.code);
        if (!id) continue;
        d.prepare(
          `INSERT INTO user.deck_cards (deck_id, card_id, quantity, purchased)
           VALUES (?, ?, ?, ?)`,
        ).run(deck.id, id, c.quantity, c.purchased ?? 0);
        report.cards++;
      }

      d.prepare(`DELETE FROM user.deck_adjustments WHERE deck_id = ?`).run(deck.id);
      for (const a of deck.adjustments ?? []) {
        const id = cardId(a.code);
        if (!id) continue;
        d.prepare(
          `INSERT INTO user.deck_adjustments (id, deck_id, card_id, kind, quantity, note)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(crypto.randomUUID(), deck.id, id, a.kind, a.quantity ?? 1, a.note ?? null);
      }
    }

    for (const g of data.groups ?? []) {
      d.prepare(
        `INSERT INTO user.deck_groups (id, name, user_id, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name`,
      ).run(g.id, g.name, userId, g.created_at);
      d.prepare(`DELETE FROM user.deck_group_members WHERE group_id = ?`).run(g.id);
      for (const deckId of g.deckIds) {
        // Only decks that actually landed — a conflicted deck must not leave a
        // membership row pointing at somebody else's deck.
        const owner = ownerOf.get(deckId) as { user_id: string | null } | undefined;
        if (!owner || owner.user_id !== userId) continue;
        d.prepare(
          `INSERT OR IGNORE INTO user.deck_group_members (group_id, deck_id) VALUES (?, ?)`,
        ).run(g.id, deckId);
      }
      report.groups++;
    }

    for (const c of data.collection ?? []) {
      const id = cardId(c.code);
      if (!id) continue;
      d.prepare(
        `INSERT INTO user.card_collection (user_id, card_id, variant, quantity)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, card_id, variant) DO UPDATE SET
           quantity = excluded.quantity, updated_at = CURRENT_TIMESTAMP`,
      ).run(userId, id, c.variant ?? "", c.quantity);
      report.collection++;
    }

    for (const p of data.prices ?? []) {
      const id = cardId(p.code);
      if (!id) continue;
      d.prepare(
        `INSERT INTO user.card_prices (user_id, card_id, price)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id, card_id) DO UPDATE SET
           price = excluded.price, updated_at = CURRENT_TIMESTAMP`,
      ).run(userId, id, p.price);
      report.prices++;
    }
  })();

  report.missingCards = [...missing].sort();
  return report;
}
