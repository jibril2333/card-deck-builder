/**
 * Hypergeometric draw probabilities for deck playtesting.
 *
 * Model: the cards a player has SEEN by some point (opening hand + per-turn
 * draws) form a uniformly random subset of the deck. This holds even for
 * Digimon's face-down security stack: hand and draws come from fixed
 * positions of a uniformly shuffled deck, so excluding the 5 security
 * positions doesn't bias which cards land in the seen set.
 *
 * Not modeled (all of these only RAISE the real-world odds): mulligan,
 * search/tutor effects, draw effects, <Draw N> security triggers.
 */

/**
 * P(at least one of `k` target copies is among `seen` cards drawn from a
 * deck of `n`). Computed as 1 − P(none): a running product instead of
 * binomial coefficients, so nothing overflows.
 */
export function pAtLeastOne(n: number, k: number, seen: number): number {
  if (k <= 0 || n <= 0 || seen <= 0) return 0;
  if (k >= n || seen >= n) return 1;
  if (seen > n - k) return 1; // pigeonhole: can't avoid all k copies
  let pNone = 1;
  for (let i = 0; i < seen; i++) pNone *= (n - k - i) / (n - i);
  return 1 - pNone;
}

/** Expected number of target copies among `seen` cards (linearity). */
export function expectedCount(n: number, k: number, seen: number): number {
  if (n <= 0) return 0;
  return (Math.min(seen, n) * k) / n;
}
