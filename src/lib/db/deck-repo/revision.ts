/**
 * The rows a deck's edit-state version is computed from.
 *
 * SQL only — what the numbers MEAN, and how they become a version string, is
 * `lib/deck-revision.ts`, which is pure and therefore testable without a
 * database. This module's whole job is to read the same state every time, in
 * one pass, so that two reads a millisecond apart cannot straddle a write.
 *
 * The pool half is the reason this is not a one-line query: a held edit on
 * this deck re-levels every deck it shares a pool with, so those decks' cards
 * and lock flags are part of what a write to THIS deck depends on.
 */

import type { RevisionState } from "@/lib/deck-revision";
import type { DbFn } from "./context";

export function createRevision(db: DbFn) {
  /**
   * Read everything the version covers, or null when the deck is gone.
   *
   * Call inside the same transaction as the write that will check it —
   * better-sqlite3 is synchronous, so "read, compare, write" is atomic as
   * long as nothing awaits in between.
   */
  function deckRevisionState(deckId: string): RevisionState | null {
    const deck = db()
      .prepare(
        // Four columns, not the whole row: the version covers what a write
        // can collide with, and `lib/deck-revision` says why the rest is
        // deliberately absent.
        `SELECT id, name, notes, locked FROM user.decks WHERE id = ?`,
      )
      .get(deckId) as
      | { id: string; name: string; notes: string | null; locked: number }
      | undefined;
    if (!deck) return null;

    // Every pool this deck is in, and every deck in those pools — including
    // this one, which is what makes the card query below a single statement.
    const members = db()
      .prepare(
        `SELECT m2.group_id, m2.deck_id, d.locked
           FROM user.deck_group_members m1
           JOIN user.deck_group_members m2 ON m2.group_id = m1.group_id
           JOIN user.decks d ON d.id = m2.deck_id
          WHERE m1.deck_id = ?`,
      )
      .all(deckId) as {
      group_id: string;
      deck_id: string;
      locked: number;
    }[];

    const deckIds = [...new Set([deckId, ...members.map((m) => m.deck_id)])];
    const cards = db()
      .prepare(
        `SELECT deck_id, card_id, quantity, purchased
           FROM user.deck_cards
          WHERE deck_id IN (${deckIds.map(() => "?").join(",")})`,
      )
      .all(...deckIds) as {
      deck_id: string;
      card_id: string;
      quantity: number;
      purchased: number;
    }[];

    return {
      deck: {
        id: deck.id,
        name: deck.name,
        notes: deck.notes,
        locked: !!deck.locked,
      },
      cards,
      members: members.map((m) => ({
        group_id: m.group_id,
        deck_id: m.deck_id,
        locked: !!m.locked,
      })),
    };
  }

  return { deckRevisionState };
}
