/**
 * The deck repository, assembled.
 *
 * One factory per area of the schema (`deck-repo/*.ts`), composed here into
 * the flat object `digimon.ts` destructures. It used to be one 1,758-line
 * closure, generic over a card and a deck row because the site once carried a
 * second game; the split is by what the functions touch, and the wiring below
 * is the whole dependency graph:
 *
 *   locks         ← nothing            (the lock gate every write asks)
 *   restrictions  ← nothing            (banlist + self-declared limits)
 *   meta          ← locks              (the deck row: list / order / cover)
 *   cards         ← locks, restrictions (deck_cards: quantity / purchased)
 *   pricing       ← nothing            (a typed price)
 *   adjustments   ← locks              (调整备忘)
 *   pools         ← nothing            (共享卡池)
 *
 * `assertUnlocked` and `clampQuantityToRestriction` are dependencies, not
 * API: they are destructured away before the modules are spread, so the
 * returned surface stays exactly what `digimon.ts` names.
 *
 * Every factory takes the connection and nothing else. What used to be an
 * options object — sort order, restriction source, code identity, default
 * accent, first-card seeding — was one game's values dressed as
 * configuration; each now sits in the module that reads it.
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

import { createAdjustments } from "./deck-repo/adjustments";
import { createCards } from "./deck-repo/cards";
import { createLocks } from "./deck-repo/locks";
import { createMeta } from "./deck-repo/meta";
import { createPools } from "./deck-repo/pools";
import { createPricing } from "./deck-repo/pricing";
import { createRestrictions } from "./deck-repo/restrictions";
import type { DbFn } from "./deck-repo/context";

export {
  DEFAULT_DECK_ACCENT,
  DeckLockedError,
  OwnershipError,
} from "./deck-repo/context";

export function createDeckRepo(db: DbFn) {
  const { assertUnlocked, ...lockApi } = createLocks(db);
  const { clampQuantityToRestriction, ...restrictionApi } =
    createRestrictions(db);

  return {
    ...lockApi,
    ...restrictionApi,
    ...createMeta(db, { assertUnlocked }),
    ...createCards(db, { assertUnlocked, clampQuantityToRestriction }),
    ...createPricing(db),
    ...createAdjustments(db, { assertUnlocked }),
    ...createPools(db),
  };
}
