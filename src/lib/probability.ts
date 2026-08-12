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

/**
 * P(NOT ONE of `k` target copies is among `seen` cards) — the complement of
 * `pAtLeastOne`, spelled out because that is the question a curve check asks.
 *
 * "97.5% to see a Lv.3" and "2.5% to brick on Lv.3" are the same number, but
 * only the second one is small enough to compare across levels at a glance:
 * the difference between 99.4% and 97.5% reads as nothing, while 0.6% versus
 * 2.5% reads as four times the risk.
 *
 * Note the k = 0 case: a level you play none of has probability 1 of not
 * appearing, not 0. `pAtLeastOne` returns 0 there, so the complement is
 * already right.
 */
export function pNone(n: number, k: number, seen: number): number {
  return 1 - pAtLeastOne(n, k, seen);
}
