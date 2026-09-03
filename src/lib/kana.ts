/**
 * Hiragana and katakana are the same word typed two ways.
 *
 * Japanese card names are written in katakana — アグモン, グレイモン — but an
 * IME hands you hiragana until you convert it, and a reader who types あぐもん
 * and presses nothing else got no results at all. The two scripts sit at a
 * fixed distance in Unicode, so the query can simply be searched for in both.
 *
 * Only the query is converted; nothing is stored. That keeps this out of the
 * schema and the refresh, and it costs one extra LIKE per kana term.
 *
 * What it does NOT do is readings: 石田ヤマト cannot be found by いしだ, because
 * the reading of the kanji is not in the data at all. Kana against kana is the
 * part that is knowable from the text itself.
 */

const HIRA_START = 0x3041; // ぁ
const KATA_START = 0x30a1; // ァ
const GAP = KATA_START - HIRA_START;

export function toKatakana(s: string): string {
  return s.replace(/[ぁ-ゖ]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) + GAP),
  );
}

export function toHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - GAP),
  );
}

/** Does this string carry kana that could have been typed the other way? */
export function hasKana(s: string): boolean {
  return /[ぁ-ゖァ-ヶ]/.test(s);
}

/**
 * The forms of a search term worth looking for: the term as typed first, then
 * its other script. A term with no kana in it comes back alone, so a Latin or
 * Chinese search builds exactly the query it always did.
 */
export function kanaVariants(term: string): string[] {
  if (!hasKana(term)) return [term];
  const out = [term];
  for (const v of [toKatakana(term), toHiragana(term)]) {
    if (v !== term && !out.includes(v)) out.push(v);
  }
  return out;
}
