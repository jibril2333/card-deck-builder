/**
 * A deck's edit-state version, for optimistic concurrency on the native API.
 *
 * ## What it is
 *
 * A hash of everything a write could collide with, and nothing else. The
 * client gets it with the deck, sends it back with the next write, and the
 * server refuses the write if the two disagree. That is the whole protocol:
 * no lock, no lease, and no field-level merge.
 *
 * ## Why a hash rather than a counter column
 *
 * A counter has to be incremented by every writer, and this deck has two:
 * the website's Server Actions and this API. A counter the website does not
 * know about would make its edits invisible — the app would happily overwrite
 * a change made in the browser thirty seconds earlier, which is precisely the
 * case the version exists to catch. Derived from the rows themselves, it sees
 * every writer, including a future one, and needs no migration.
 *
 * ## What goes in, and what must not
 *
 * In: the deck's editable metadata, its cards' quantities and held counts,
 * the lock flag, which pools it belongs to, and the same card/lock state of
 * every deck it shares a pool with. That last part is not decoration — a held
 * edit re-levels the peers, so a peer's state is genuinely part of what this
 * deck's next write depends on.
 *
 * Out: prices, translations, art, `updated_at`. A price scrape runs nightly
 * and touches thousands of rows; if a quote could invalidate a revision, the
 * reader's open deck page would start refusing edits every night for reasons
 * that have nothing to do with them.
 *
 * ## Why it is opaque
 *
 * Sixteen bytes of SHA-256, hex. Not a timestamp, not a row count, nothing a
 * client could be tempted to parse, compare for ordering, or synthesize. The
 * only valid operation is equality against one the server issued.
 */

import crypto from "node:crypto";

type RevisionDeck = {
  id: string;
  name: string;
  notes: string | null;
  locked: boolean;
  pinned: boolean;
  version: string | null;
  accent_color: string;
  accent_color2: string | null;
  cover_card_id: string | null;
  cover_variant: string;
};

/** One `deck_cards` row, from this deck or from a pooled peer. */
type RevisionCard = {
  deck_id: string;
  card_id: string;
  quantity: number;
  purchased: number;
};

/** A pool this deck is in, and one member of it. */
type RevisionMember = {
  group_id: string;
  deck_id: string;
  locked: boolean;
};

export type RevisionState = {
  deck: RevisionDeck;
  cards: RevisionCard[];
  members: RevisionMember[];
};

/** Ordering is part of the hash's definition, so it is applied here rather
 *  than trusted from the query. Two rows can never tie: the keys are unique. */
function canonical(state: RevisionState): string {
  const d = state.deck;
  const cards = [...state.cards]
    .sort(
      (a, b) =>
        a.deck_id.localeCompare(b.deck_id) ||
        a.card_id.localeCompare(b.card_id),
    )
    .map((c) => [c.deck_id, c.card_id, c.quantity, c.purchased]);
  const members = [...state.members]
    .sort(
      (a, b) =>
        a.group_id.localeCompare(b.group_id) ||
        a.deck_id.localeCompare(b.deck_id),
    )
    .map((m) => [m.group_id, m.deck_id, m.locked ? 1 : 0]);
  return JSON.stringify({
    deck: [
      d.id,
      d.name,
      d.notes ?? "",
      d.locked ? 1 : 0,
      d.pinned ? 1 : 0,
      d.version ?? "",
      d.accent_color,
      d.accent_color2 ?? "",
      d.cover_card_id ?? "",
      d.cover_variant ?? "",
    ],
    cards,
    members,
  });
}

export function deckRevision(state: RevisionState): string {
  return crypto
    .createHash("sha256")
    .update(canonical(state))
    .digest("hex")
    .slice(0, 32);
}
