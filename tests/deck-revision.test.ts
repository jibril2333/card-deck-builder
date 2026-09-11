/**
 * The native API's optimistic-concurrency version.
 *
 * Two properties matter, and they pull against each other:
 *
 *  · It must change when anything a write could collide with changes —
 *    including a change to a POOLED PEER, which is the half that is easy to
 *    forget and impossible to notice in testing by hand.
 *  · It must NOT change when the rows are merely read back in a different
 *    order. SQLite makes no promise about row order without an ORDER BY, and
 *    a version that depended on it would fire spurious conflicts forever.
 *
 * Pure function, no database: that is the point of keeping the hash and the
 * query that feeds it in separate modules.
 */

import { describe, expect, it } from "vitest";
import { deckRevision, type RevisionState } from "@/lib/deck-revision";

const base: RevisionState = {
  deck: {
    id: "d1",
    name: "红混",
    notes: "店赛用",
    locked: false,
    pinned: true,
    version: "BT-26",
    accent_color: "#f59e0b",
    accent_color2: null,
    cover_card_id: "c-omni",
    cover_variant: "",
  },
  cards: [
    { deck_id: "d1", card_id: "c-omni", quantity: 3, purchased: 1 },
    { deck_id: "d1", card_id: "c-agu", quantity: 4, purchased: 4 },
    { deck_id: "d2", card_id: "c-omni", quantity: 2, purchased: 1 },
  ],
  members: [
    { group_id: "g1", deck_id: "d1", locked: false },
    { group_id: "g1", deck_id: "d2", locked: false },
  ],
};

/** `base` with one thing changed, as a fresh object. */
function edit(f: (s: RevisionState) => void): RevisionState {
  const copy = structuredClone(base);
  f(copy);
  return copy;
}

describe("deckRevision", () => {
  it("is stable across row order", () => {
    const shuffled = edit((s) => {
      s.cards = [s.cards[2], s.cards[0], s.cards[1]];
      s.members = [s.members[1], s.members[0]];
    });
    expect(deckRevision(shuffled)).toBe(deckRevision(base));
  });

  it("is stable across repeated calls", () => {
    expect(deckRevision(base)).toBe(deckRevision(structuredClone(base)));
  });

  it("is opaque: 32 hex characters, not a number or a date", () => {
    expect(deckRevision(base)).toMatch(/^[0-9a-f]{32}$/);
  });

  const changes: [string, (s: RevisionState) => void][] = [
    ["the name", (s) => (s.deck.name = "红混 v2")],
    ["the note", (s) => (s.deck.notes = "改了")],
    ["a blank note vs no note", (s) => (s.deck.notes = "")],
    ["the lock", (s) => (s.deck.locked = true)],
    ["the pin", (s) => (s.deck.pinned = false)],
    ["the pack version", (s) => (s.deck.version = "BT-25")],
    ["the accent", (s) => (s.deck.accent_color = "#000000")],
    ["the cover", (s) => (s.deck.cover_card_id = "c-agu")],
    ["the cover printing", (s) => (s.deck.cover_variant = "_P1")],
    ["a quantity", (s) => (s.cards[0].quantity = 2)],
    ["a held count", (s) => (s.cards[0].purchased = 0)],
    ["a card being removed", (s) => s.cards.splice(1, 1)],
    [
      "a card being added",
      (s) =>
        s.cards.push({
          deck_id: "d1",
          card_id: "c-new",
          quantity: 1,
          purchased: 0,
        }),
    ],
    // The pool half. A phone editing d1 depends on d2's state, because a
    // held edit re-levels every member deck.
    ["a POOLED PEER's quantity", (s) => (s.cards[2].quantity = 4)],
    ["a POOLED PEER's held count", (s) => (s.cards[2].purchased = 2)],
    ["a POOLED PEER's lock", (s) => (s.members[1].locked = true)],
    ["the pool losing a member", (s) => s.members.splice(1, 1)],
    [
      "the pool gaining a member",
      (s) => s.members.push({ group_id: "g1", deck_id: "d3", locked: false }),
    ],
    [
      "the deck joining a second pool",
      (s) => s.members.push({ group_id: "g2", deck_id: "d1", locked: false }),
    ],
  ];

  for (const [what, change] of changes) {
    it(`changes when ${what} changes`, () => {
      expect(deckRevision(edit(change))).not.toBe(deckRevision(base));
    });
  }

  it("does not collide on a swapped deck id and card id", () => {
    // A naive join of the fields with no separator would hash these two the
    // same, and the client would happily write over the other deck.
    const a = edit((s) => {
      s.cards[0] = {
        deck_id: "d1",
        card_id: "c-omni",
        quantity: 3,
        purchased: 1,
      };
    });
    const b = edit((s) => {
      s.cards[0] = {
        deck_id: "d1c",
        card_id: "omni",
        quantity: 3,
        purchased: 1,
      };
    });
    expect(deckRevision(a)).not.toBe(deckRevision(b));
  });
});
