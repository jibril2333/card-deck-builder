/**
 * Query-term splitting, shared by the search itself and by the chips that show
 * what you searched for. Kept out of the DB module on purpose: the chips are a
 * client component, and importing from there would pull better-sqlite3 into the
 * browser bundle.
 */

/** How many space-separated terms one query may carry. Enough for any real
 *  search, and it stops a pasted paragraph from building a WHERE clause with
 *  hundreds of LIKEs in it. */
const MAX_TERMS = 6;

/**
 * Split a query into terms on whitespace — ASCII and U+3000, the full-width
 * space a Japanese or Chinese IME produces, which otherwise reads as an
 * ordinary character and makes the whole query match nothing.
 *
 * Every term has to match, which is what lets 「Imperialdramon Dragon」 find
 * "Imperialdramon: Dragon Mode". As one literal it never could: the colon sits
 * between the two words.
 */
export function splitTerms(q: string | undefined | null): string[] {
  if (!q) return [];
  return q
    .trim()
    .split(/[\s\u3000]+/)
    .filter(Boolean)
    .slice(0, MAX_TERMS);
}

