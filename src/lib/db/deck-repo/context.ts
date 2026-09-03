/**
 * Shared types, errors and constants for the deck repository.
 *
 * The repository itself is assembled in `../deck-shared.ts` out of the
 * modules next to this file; everything they all need lives here so none of
 * them has to import a sibling.
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
import type { DigimonCard, DigimonDeck } from "../digimon-types";

/**
 * The live connection, read per call so an HMR-refreshed one is picked up.
 * Every factory in this directory takes exactly this and nothing else — the
 * per-game options object went away with the second game.
 */
export type DbFn = () => Database.Database;

/**
 * A new deck's colour, and the sentinel for "the owner hasn't picked one".
 * `setDeckCover`'s auto mode paints the deck from its cover card only while
 * the colour is still this one, so `createDeck` must write exactly this.
 */
export const DEFAULT_DECK_ACCENT = "#f59e0b";

export type DeckWithCover = DigimonDeck & {
  cover_image_url: string | null;
  cover_code: string | null;
  owner_id: string | null;
  owner_name: string | null;
};

export type DeckWithCardQty = DigimonDeck & {
  card_qty: number;
  total: number;
};

export type DeckCardRow = DigimonCard & {
  quantity: number;
  purchased: number;
  /** What the card is worth here: the typed price, or the shop floor. */
  price: number | null;
  /** Only what a person typed — null when `price` came from a shop. */
  manual_price: number | null;
  /** The shop floor itself, and which shop it came from. */
  market_price: number | null;
  market_source: string | null;
  /** That shop's product id for the listing, when it has one. */
  market_item_code: string | null;
};

/** Upper bound for an adjustment's copy count — a memo, not a rules engine,
 *  but an unbounded number is just a typo waiting to happen. */
export const MAX_ADJUSTMENT_QTY = 20;

export class OwnershipError extends Error {
  constructor(deckId: string) {
    super(`deck ${deckId} not owned by current user (or does not exist)`);
    this.name = "OwnershipError";
  }
}

/**
 * Thrown by every write path when the deck is locked.
 *
 * Its own type rather than an OwnershipError so callers can tell "not yours"
 * (a 404-ish condition, don't explain) apart from "yours, but you closed it"
 * (worth saying out loud, with the way to undo it).
 */
export class DeckLockedError extends Error {
  constructor(public readonly deckId: string) {
    super(`deck ${deckId} is locked`);
    this.name = "DeckLockedError";
  }
}
