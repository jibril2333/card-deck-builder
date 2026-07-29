/**
 * Parsing for `cards.set_names` — the list of products a card can be pulled
 * from. A card is often in several: promos especially (P-007 is in seven).
 *
 * The scrapers join them with "; ". An older splitter here assumed " | " and
 * so treated a multi-product card's whole string as ONE set, which is why the
 * browse page's set filter listed 73 entries like
 * "3rd Anniversary Survey Pack; AD-01: ADVANCED BOOSTER…".
 */
const SEPARATOR = /\s*;\s*/;

/** Split a `set_names` value into its individual product names. */
export function splitSetNames(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(SEPARATOR)) {
    const t = part.trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/**
 * Shorten a product name for tight spaces, preferring the set code the name
 * carries: "Booster DUAL REVOLUTION [BT-25]" → "BT-25",
 * "BT01-03: Release Special Booster Ver.1.0" → "BT01-03".
 * Falls back to the full name when there's no code to pull out.
 */
export function shortSetName(name: string): string {
  const bracket = name.match(/\[([^\]]+)\]\s*$/);
  if (bracket) return bracket[1].trim();
  const prefix = name.match(/^([A-Z]{1,3}[-\d]*\d)\s*:/);
  if (prefix) return prefix[1].trim();
  return name;
}
