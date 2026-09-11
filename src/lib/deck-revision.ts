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
 * The test is narrow on purpose: **a field belongs here only if a concurrent
 * change to it could make this write wrong.** That is the API's three
 * editable fields (name, notes, locked), every card's quantity and held
 * count, and — this is the part that is easy to miss — the same card and
 * lock state of every deck sharing a pool with this one, because a held edit
 * re-levels the peers.
 *
 * Everything else stays out, and the reason is not thrift. A field in here
 * that no write depends on does not prevent a lost update; it only produces
 * conflicts that are not conflicts. `pinned` was the clearest case: the API
 * does not offer pinning, so including it meant a star clicked in the
 * browser would make the phone refuse the card edit it had queued —
 * a false alarm bought with nothing. Cover art, accent colours and the pack
 * version are the same argument with a lower click rate.
 *
 * Prices, translations and art timestamps are out for a louder version of
 * the same reason: the nightly price scrape touches thousands of rows, and a
 * quote could otherwise make every open deck page start refusing edits every
 * night.
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
    deck: [d.id, d.name, d.notes ?? "", d.locked ? 1 : 0],
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
