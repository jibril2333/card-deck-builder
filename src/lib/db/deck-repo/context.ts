/**
 * Shared types, errors and per-game configuration for the deck repository.
 *
 * The repository itself is assembled in `../deck-shared.ts` out of the
 * modules next to this file; everything they all need lives here so none of
 * them has to import a sibling.
 *
 * Why the repository exists at all:
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

export type DeckCommon = {
  id: string;
  name: string;
  notes: string | null;
  accent_color: string;
  accent_color2: string | null;
  cover_card_id: string | null;
  sort_order: number;
  /** 1 = a deck the owner actually plays; floats to the top of the deck list. */
  pinned: number;
  /** Which printing of the cover card to show: '' = base art, else a
   *  `card_images.variant` key such as '_P1'. */
  cover_variant: string;
  created_at: string;
  updated_at: string;
  user_id: string | null;
};

export type RepoOptions = {
  /** Returns the live SQLite connection for this game. Called per-method so
   *  HMR-refreshed connections are picked up automatically. */
  db: () => Database.Database;
  /** ORDER BY clause body for `getDeckCards`. Differs by game's most-useful
   *  default sort (Digimon: level, UA: energy_cost). */
  deckCardOrderBy: string;
  /** Source key in `card_restrictions`, e.g. "digimon". */
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

/**
 * What every module gets: the connection plus the per-game knobs, already
 * unpacked. One object rather than seven arguments, and read-only — a module
 * that wants to change how a game behaves has to say so in `RepoOptions`.
 */
export type RepoCtx = {
  db: () => Database.Database;
  deckCardOrderBy: string;
  restrictionSource: string;
  identityForCode: (code: string) => string;
  defaultAccent: string;
  seedAccent: boolean;
  seedSeries: boolean;
  seedColor: boolean;
  /** Has *any* first-card behavior — gates expensive pre-write SELECTs. */
  hasAnyFirstCardSeed: boolean;
};

export function toCtx(opts: RepoOptions): RepoCtx {
  const seedAccent = !!opts.firstCardSeed?.accent;
  const seedSeries = !!opts.firstCardSeed?.series;
  const seedColor = !!opts.firstCardSeed?.color;
  return {
    db: opts.db,
    deckCardOrderBy: opts.deckCardOrderBy,
    restrictionSource: opts.restrictionSource,
    identityForCode: opts.identityForCode,
    defaultAccent: opts.defaultAccent,
    seedAccent,
    seedSeries,
    seedColor,
    hasAnyFirstCardSeed: seedAccent || seedSeries || seedColor,
  };
}
