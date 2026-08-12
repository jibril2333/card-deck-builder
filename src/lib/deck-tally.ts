/**
 * The two deck-composition tallies that aren't a plain group-by.
 *
 * Out here rather than inline on the deck page because both have a rule worth
 * pinning down, and because the deck page renders the colour breakdown TWICE —
 * as chips under the banner and as bars in 卡组分布. They disagreed before.
 */

export type TallyCard = {
  color?: string | null;
  color2?: string | null;
  level?: number | null;
  quantity: number;
};

/** The label the multi-colour bucket goes under. */
export const MULTI_COLOR = "多色";

/**
 * Levels the game actually prints. Kept as a floor rather than derived purely
 * from the deck, so a missing rung shows as a gap instead of closing up — the
 * shape of a curve is the point, and "no Lv.5" is information.
 */
const PRINTED_LEVELS = [2, 3, 4, 5, 6, 7];

/**
 * Colour counts where a card counts for EVERY colour it has.
 *
 * A two-colour card used to land only under its first colour, so a deck built
 * around red/black read as a red deck with a black splash. Both halves count
 * now, which means the numbers deliberately sum to MORE than the deck size.
 *
 * `多色` is a separate bucket on top of that, not instead of it: it answers
 * "how much of this deck is two-colour", which neither per-colour number can.
 * It sorts last for the same reason — every card in it is already counted
 * above, so leading with it would read as a seventh colour.
 */
export function tallyColors(
  cards: TallyCard[],
): { label: string; value: number }[] {
  const byColor = new Map<string, number>();
  let multi = 0;

  for (const c of cards) {
    // `color2` is an empty string, not null, on most single-colour cards.
    const colors = [...new Set([c.color, c.color2].map((x) => (x ?? "").trim()).filter(Boolean))];
    for (const col of colors) {
      byColor.set(col, (byColor.get(col) ?? 0) + c.quantity);
    }
    if (colors.length > 1) multi += c.quantity;
  }

  const bars = [...byColor.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  if (multi > 0) bars.push({ label: MULTI_COLOR, value: multi });
  return bars;
}

/**
 * Level counts with the empty rungs kept.
 *
 * A group-by drops what isn't there, so a deck with nothing at Lv.5 showed
 * Lv.4 sitting next to Lv.6 and the hole in the curve was invisible. Returns
 * nothing at all when the deck has no levelled cards, so a Tamer/Option-only
 * deck doesn't get a panel of six zeros.
 */
export function tallyLevels(
  cards: TallyCard[],
): { label: string; value: number }[] {
  const byLevel = new Map<number, number>();
  for (const c of cards) {
    if (c.level == null) continue;
    byLevel.set(c.level, (byLevel.get(c.level) ?? 0) + c.quantity);
  }
  if (byLevel.size === 0) return [];

  // Union with the printed range, so an unexpected level still shows up rather
  // than being silently dropped by a hardcoded list.
  const levels = [...new Set([...PRINTED_LEVELS, ...byLevel.keys()])].sort(
    (a, b) => a - b,
  );
  return levels.map((lv) => ({ label: `Lv.${lv}`, value: byLevel.get(lv) ?? 0 }));
}
