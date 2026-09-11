/**
 * The four deck-card writes, with their 共享卡池 consequences — once.
 *
 * These rules used to live inside the Server Actions, which was fine while
 * the website was the only writer. It is not any more: `/api/v1` performs the
 * same four operations, and a second copy of "a ± in purchase mode moves the
 * POOL's held count, then re-levels every member deck, each capped at its own
 * quantity" is a second copy of the one piece of behaviour in this app that
 * nobody can hold in their head. The actions now call these functions; so do
 * the routes.
 *
 * What stays out: cache invalidation (a Next concern the API has no use for)
 * and HTTP (a route concern the actions have no use for). Each caller reads
 * `pooled` from the result and decides what to do about it — the website
 * revalidates a wider path, the API does nothing.
 *
 * SQL stays in `db/`. This module only orders the repo calls.
 */

import * as digimon from "@/lib/db/digimon";

export type WriteResult = {
  /** Whether the write went through a shared pool (more than one deck). */
  pooled: boolean;
  /** What the deck actually holds now — the clamp may have moved it. */
  quantity: number;
  /** The deck's own held count after the write. */
  purchased: number;
  /** The pool's shared held count, or this deck's own when not pooled. */
  owned: number;
};

/** Decks sharing a pool with this one, including itself. Empty when solo. */
function poolPeers(userId: string, deckId: string): string[] {
  const peers = digimon.decksSharingPoolWith(userId, deckId);
  return peers.length > 1 ? peers : [];
}

function result(
  userId: string,
  deckId: string,
  cardId: string,
  peers: string[],
): WriteResult {
  const { quantity, purchased } = digimon.getDeckCardCounts(deckId, cardId);
  return {
    pooled: peers.length > 1,
    quantity,
    purchased,
    owned:
      peers.length > 1 ? digimon.pooledOwnedForCard(peers, cardId) : purchased,
  };
}

/**
 * The held count a ± moves: the pool's when pooled, this deck's when not.
 *
 * The distinction is the whole of the pool's purchase behaviour — see
 * `adjustCardPurchased` — and a caller that wants to report "you asked for
 * 4, you got 3" has to know which number it was counting from.
 */
export function currentOwned(
  userId: string,
  deckId: string,
  cardId: string,
): number {
  const peers = poolPeers(userId, deckId);
  return peers.length > 1
    ? digimon.pooledOwnedForCard(peers, cardId)
    : digimon.getDeckCardCounts(deckId, cardId).purchased;
}

/**
 * Set how many copies this deck runs.
 *
 * A pooled deck inherits the pool's existing held count for the card (capped
 * at its own new quantity) so a copy just added shows as already owned. Only
 * THIS deck is reconciled: changing how many you run must never change how
 * many you physically hold, so it must never lower a sibling's held count.
 */
export function setCardQuantity(
  userId: string,
  deckId: string,
  cardId: string,
  quantity: number,
): WriteResult {
  digimon.setDeckCardQuantity(userId, deckId, cardId, quantity);
  const peers = poolPeers(userId, deckId);
  if (peers.length > 1) {
    digimon.reconcilePoolCard(
      [deckId],
      cardId,
      digimon.pooledOwnedForCard(peers, cardId),
    );
  }
  return result(userId, deckId, cardId, peers);
}

/** `setCardQuantity` relative to what the deck holds now. */
export function adjustCardQuantity(
  userId: string,
  deckId: string,
  cardId: string,
  delta: number,
): WriteResult {
  const { quantity } = digimon.getDeckCardCounts(deckId, cardId);
  return setCardQuantity(userId, deckId, cardId, Math.max(0, quantity + delta));
}

/**
 * Set the held count.
 *
 * In a pool this is the SHARED number — one physical set of cards — so it is
 * capped at the most any member deck needs and then applied to all of them,
 * each capped at its own quantity. Outside a pool it is just this deck's.
 */
export function setCardPurchased(
  userId: string,
  deckId: string,
  cardId: string,
  purchased: number,
): WriteResult {
  const peers = poolPeers(userId, deckId);
  if (peers.length > 1) {
    const owned = Math.min(
      Math.max(0, purchased),
      digimon.maxNeedForCard(peers, cardId),
    );
    digimon.reconcilePoolCard(peers, cardId, owned);
  } else {
    digimon.setDeckCardPurchased(userId, deckId, cardId, purchased);
  }
  return result(userId, deckId, cardId, peers);
}

/**
 * Move the held count by ±1.
 *
 * The delta applies to the POOL's current held, not to this deck's capped
 * view of it. With a 2-copy deck and a 4-copy deck sharing 3 held, pressing −
 * in the small deck takes the pool to 2 — not to 1, which is what deriving
 * the base from the small deck's own (capped) 2 would do.
 */
export function adjustCardPurchased(
  userId: string,
  deckId: string,
  cardId: string,
  delta: number,
): WriteResult {
  const peers = poolPeers(userId, deckId);
  if (peers.length > 1) {
    const owned = Math.min(
      Math.max(0, digimon.pooledOwnedForCard(peers, cardId) + delta),
      digimon.maxNeedForCard(peers, cardId),
    );
    digimon.reconcilePoolCard(peers, cardId, owned);
  } else {
    digimon.adjustDeckCardPurchased(userId, deckId, cardId, delta);
  }
  return result(userId, deckId, cardId, peers);
}
