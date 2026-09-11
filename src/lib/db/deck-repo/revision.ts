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
        `SELECT id, name, notes, locked, pinned, version,
                accent_color, accent_color2, cover_card_id, cover_variant
           FROM user.decks WHERE id = ?`,
      )
      .get(deckId) as
      | {
          id: string;
          name: string;
          notes: string | null;
          locked: number;
          pinned: number;
          version: string | null;
          accent_color: string;
          accent_color2: string | null;
          cover_card_id: string | null;
          cover_variant: string | null;
        }
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
        pinned: !!deck.pinned,
        version: deck.version,
        accent_color: deck.accent_color,
        accent_color2: deck.accent_color2,
        cover_card_id: deck.cover_card_id,
        cover_variant: deck.cover_variant ?? "",
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
