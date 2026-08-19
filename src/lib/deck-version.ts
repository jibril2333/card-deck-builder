/**
 * Which pack a deck is built for.
 *
 * A deck list is only meaningful against a moment in the card pool: the same
 * "红混" from BT-24 and from BT-26 are different decks. `decks.version` records
 * that moment as a pack code, and this module works out what it should be.
 *
 * ## Which pack does a card belong to?
 *
 * Its EARLIEST one. A card printed in BT-05 and reprinted as a promo four
 * years later has been playable since BT-05 — that's the fact a version needs.
 * Taking the newest would date every deck by its reprints.
 *
 * Two sources, because neither alone is enough:
 *   · `set_names` carries the product codes in brackets — the only thing that
 *     knows an LM card is from LM-01, since its code (LM-001) doesn't say.
 *   · the card code's own prefix — the fallback for the 175 cards whose
 *     set_names is a bare product title with no code ("SPECIAL LIMITED SET").
 *
 * ## Why codes get normalized
 *
 * The same pack is written three ways across the sources we join: `BT-26` in
 * digimoncard.com's dropdown, `[LM01]` in our English set_names, `ST1` vs
 * `ST-01` between them. Everything is reduced to letters + an unpadded number
 * (`BT26`, `LM1`, `ST1`) before comparison, and the printed form is only used
 * for display.
 */

/** `BT-26` / `[LM01]` / `ST-1` → `BT26` / `LM1` / `ST1`. Null when there's no
 *  number, which is how promos ("P", "SPECIAL LIMITED SET") drop out. */
export function normalizeSetKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.trim().toUpperCase().match(/^([A-Z]+)[-_ ]?0*(\d+)$/);
  if (!m) return null;
  return `${m[1]}${Number(m[2])}`;
}

/** Pack codes a card could be dated by, normalized. */
export function setKeysForCard(
  code: string,
  setNames: string | null | undefined,
): string[] {
  const keys: string[] = [];
  for (const m of (setNames ?? "").matchAll(/\[([^\]]+)\]/g)) {
    const k = normalizeSetKey(m[1]);
    if (k) keys.push(k);
  }
  // The code's own prefix: BT26-001 → BT26. Promos (P-001) and the token
  // cards normalize to null and contribute nothing.
  const prefix = code.includes("-") ? code.slice(0, code.indexOf("-")) : "";
  const fromCode = normalizeSetKey(prefix);
  if (fromCode && !keys.includes(fromCode)) keys.push(fromCode);
  return keys;
}

export type SetOrder = {
  /** Normalized key → its printed code and position. */
  byKey: Map<string, { code: string; release_order: number }>;
};

export function buildSetOrder(
  sets: { code: string; release_order: number }[],
): SetOrder {
  const byKey = new Map<string, { code: string; release_order: number }>();
  for (const s of sets) {
    const k = normalizeSetKey(s.code);
    if (k) byKey.set(k, { code: s.code, release_order: s.release_order });
  }
  return { byKey };
}

/** The earliest pack this card was available in, or null if we can't date it. */
export function cardSet(
  card: { code: string; set_names?: string | null },
  order: SetOrder,
): { code: string; release_order: number } | null {
  let best: { code: string; release_order: number } | null = null;
  for (const k of setKeysForCard(card.code, card.set_names)) {
    const hit = order.byKey.get(k);
    if (hit && (best === null || hit.release_order < best.release_order)) {
      best = hit;
    }
  }
  return best;
}

/**
 * The version a deck list implies: the newest pack any of its cards needs.
 *
 * Null when nothing in the deck can be dated — an all-promo deck, or a card
 * pool scraped before `card_sets` was ever populated. Callers treat that as
 * "no version", never as "the oldest one".
 */
export function deckVersionOf(
  cards: { code: string; set_names?: string | null }[],
  order: SetOrder,
): string | null {
  let best: { code: string; release_order: number } | null = null;
  for (const c of cards) {
    const s = cardSet(c, order);
    if (s && (best === null || s.release_order > best.release_order)) best = s;
  }
  return best?.code ?? null;
}

/**
 * Cards that need a pack newer than the deck's declared version.
 *
 * The version is a label the owner controls, so this never edits anything —
 * it's what lets the deck page say "标着 BT-25,但里面有 BT-26 的卡".
 */
export function cardsNewerThan(
  version: string | null,
  cards: { code: string; set_names?: string | null }[],
  order: SetOrder,
): { code: string; set: string }[] {
  const v = normalizeSetKey(version);
  const at = v ? order.byKey.get(v) : undefined;
  if (!at) return [];
  const out: { code: string; set: string }[] = [];
  for (const c of cards) {
    const s = cardSet(c, order);
    if (s && s.release_order > at.release_order) out.push({ code: c.code, set: s.code });
  }
  return out;
}
