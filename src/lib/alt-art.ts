/**
 * Alt-art / parallel printing utilities — the one place to recognize, strip,
 * or extract the parallel suffix on a card code.
 *
 * Both games encode parallel printings with a `_pN` suffix on the code:
 *   - Digimon (uppercase):   "BT1-001_P1"            "BT1-001_P2" …
 *   - UNION ARENA (lower):   "EX01BT/HTR-1-030_p1"   "…_p2" …
 *
 * The two games' DB models for alt-art differ deeply (Digimon stores alt-art
 * in a side table `card_images`; UA stores each parallel as its own `cards`
 * row keyed by suffix), and that difference is justified by the underlying
 * scraper data — we don't try to paper over it. What we DO want to centralize
 * is the *string handling* of the suffix itself, so a refactor of the regex
 * happens in one place rather than several `.replace(/_[Pp]\d+$/, "")` calls
 * scattered across actions, db modules, and imports.
 */

const PARALLEL_RE = /_[Pp]\d+$/;

/**
 * Strip the parallel suffix from a card code. Returns the base printing's
 * code (or the original code unchanged if there's no suffix).
 *
 *   stripAltArt("BT1-001_P1")              === "BT1-001"
 *   stripAltArt("EX01BT/HTR-1-030_p1")     === "EX01BT/HTR-1-030"
 *   stripAltArt("BT1-001")                 === "BT1-001"
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
