/**
 * Alt-art / parallel printing utilities — the one place to recognize, strip,
 * or extract the parallel suffix on a card code.
 *
 * A parallel printing is the base code plus a `_PN` suffix: "BT1-001_P1",
 * "BT1-001_P2" … The art itself lives in the side table `card_images`, keyed
 * off the base code, so a parallel is never its own `cards` row — which is
 * why the suffix only ever appears in strings, and why the string handling
 * belongs in one place rather than in several scattered
 * `.replace(/_[Pp]\d+$/, "")` calls across actions, db modules and imports.
 *
 * The regex stays case-insensitive: imported decklists write it either way.
 */

const PARALLEL_RE = /_[Pp]\d+$/;

/**
 * Strip the parallel suffix from a card code. Returns the base printing's
 * code (or the original code unchanged if there's no suffix).
 *
 *   stripAltArt("BT1-001_P1")   === "BT1-001"
 *   stripAltArt("BT1-001_p1")   === "BT1-001"
 *   stripAltArt("BT1-001")      === "BT1-001"
 */
export function stripAltArt(code: string): string {
  return code.replace(PARALLEL_RE, "");
}

/**
 * True if `code` carries a parallel suffix (e.g. ends in `_P1` / `_p2`).
 *
 *   isAltArt("BT1-001_P1")          === true
 *   isAltArt("EX01BT/HTR-1-030_p1") === true
 *   isAltArt("BT1-001")             === false
 */
export function isAltArt(code: string): boolean {
  return PARALLEL_RE.test(code);
}

/**
 * Returns the parallel suffix, including the leading underscore, or `""` if
 * the code is a base printing.
 *
 *   altArtSuffix("BT1-001_P1")              === "_P1"
 *   altArtSuffix("EX01BT/HTR-1-030_p1")     === "_p1"
 *   altArtSuffix("BT1-001")                 === ""
 */
export function altArtSuffix(code: string): string {
  return code.match(PARALLEL_RE)?.[0] ?? "";
}
