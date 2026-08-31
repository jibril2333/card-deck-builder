/**
 * Which Japanese and Chinese term on a card is the same keyword as an English
 * one — worked out from the cards themselves.
 *
 * The official sites publish a keyword list per language (that is what the
 * refresh scrapes into `card_keywords`), but the three lists have no key
 * joining them: the English page says "Detach", the Japanese page says
 * 分離《特徴「セブンコード」》, and nothing says those are the same thing. What
 * does say it is the printing: a card carrying ＜Detach＞ in English carries
 * ≪分離…≫ in Japanese, on the same line of the same card.
 *
 * So: collect the bracketed terms per card in each language, then for each
 * English keyword pick the term whose set of cards best overlaps its own (F1,
 * i.e. counting both the cards it misses and the cards it over-claims). A term
 * that merely happens to be common — ≪ブロッカー≫ is on hundreds of cards —
 * scores badly against a keyword that is on six, which is exactly why raw
 * co-occurrence is not enough.
 *
 * Below MIN_SCORE nothing is returned. A blank on the page is a small gap; a
 * confidently wrong translation is a lie, and this runs unattended.
 *
 * Measured against the 45 hand-checked pairs in lib/keywords.ts: 40 exact,
 * 5 not derived (their keyword is not printed in brackets at all — ［Arts
 * Digivolve］, ＜Overflow＞ and friends live in their own rules sections), 0 wrong.
 */

/**
 * Entries in the official dropdown that are not keywords:
 *   Rule           — the rules-note marker; no section defines it.
 *   BlockerDraw 1  — two <option>s run together on the official page.
 */
export const NON_KEYWORDS = new Set(["Rule", "BlockerDraw"]);

/** Agreement below which a candidate is treated as no answer. */
const MIN_SCORE = 0.34;

/**
 * The keyword without its per-card variant: ＜Draw 2＞ and ＜Draw 1＞ are one
 * keyword by rule 16-2, and so are 分離《特徴「セブンコード」》 and 分離.
 */
export function keywordBase(name: string): string {
  return name
    .split(/[《〈「（(＜<≪]/)[0]
    .replace(/\s*[＋+\-−][0-9０-９]+\s*$/, "") // Recovery +1 ≪Deck≫
    .replace(/^[0-9０-９]+/, "") // 1ドロー
    .replace(/[0-9０-９]+$/, "") // デジクロス2
    .replace(/[0-9０-９]+张/, "") // 抽1张卡 → 抽卡
    .trim();
}

/** Bracketed English keywords on one card: ＜…＞ and ［…］. */
export function englishTerms(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of (text ?? "").matchAll(/[<＜［[]([^>＞］\]]+)[>＞］\]]/g)) {
    const k = m[1]
      .replace(/[（(].*$/, "") // ＜Detach ([Seven Code] trait)＞
      .replace(/\s*[+-]?\d+\s*$/, "")
      .trim();
    if (k && k.length <= 28) out.add(k);
  }
  return out;
}

/**
 * Bracketed CJK keywords on one card. The opening bracket is ≪ 《 or ［, and
 * the term ends at the first nested bracket — ≪分離《特徴「セブンコード」》≫
 * is the keyword 分離 with its condition attached.
 */
export function cjkTerms(text: string, allowed?: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const m of (text ?? "").matchAll(/[≪《［[]([^≪《］\]]{1,26}?)(?=[《「〈≫》］\]])/g)) {
    const k = keywordBase(m[1]);
    if (!k || k.length > 12) continue;
    // When the language has an official list, a candidate has to be on it.
    // Card text is full of bracketed things that are not keywords at all.
    if (allowed && allowed.size > 0 && !allowed.has(k)) continue;
    out.add(k);
  }
  return out;
}

export type CardText = {
  /** All English effect text of one card, concatenated. */
  en: string;
  ja?: string | null;
  zh?: string | null;
};

/**
 * `official English keyword` → the term the same cards use in ja / zh.
 * Either side may be null when nothing scored high enough.
 */
export function deriveKeywordNames(
  cards: CardText[],
  officialJa: string[] = [],
): Map<string, { ja: string | null; zh: string | null }> {
  const allowedJa = new Set(officialJa.map(keywordBase).filter(Boolean));
  const pairs = new Map<string, number>(); // "en\tlang\tterm" → cards
  const enN = new Map<string, number>();
  const langN = { ja: new Map<string, number>(), zh: new Map<string, number>() };

  for (const c of cards) {
    const en = englishTerms(c.en);
    const terms = {
      ja: cjkTerms(c.ja ?? "", allowedJa),
      zh: cjkTerms(c.zh ?? ""),
    };
    for (const e of en) {
      enN.set(e, (enN.get(e) ?? 0) + 1);
      for (const lang of ["ja", "zh"] as const) {
        for (const t of terms[lang]) {
          const key = `${e}\t${lang}\t${t}`;
          pairs.set(key, (pairs.get(key) ?? 0) + 1);
        }
      }
    }
    for (const lang of ["ja", "zh"] as const) {
      for (const t of terms[lang]) {
        langN[lang].set(t, (langN[lang].get(t) ?? 0) + 1);
      }
    }
  }

  const best = new Map<string, { ja: string | null; zh: string | null }>();
  const score = new Map<string, number>();
  for (const [key, n] of pairs) {
    const [en, lang, term] = key.split("\t") as [string, "ja" | "zh", string];
    const f1 = (2 * n) / ((enN.get(en) ?? 0) + (langN[lang].get(term) ?? 0));
    if (f1 < MIN_SCORE) continue;
    const cur = best.get(en) ?? { ja: null, zh: null };
    const sKey = `${en}\t${lang}`;
    if (f1 > (score.get(sKey) ?? 0)) {
      score.set(sKey, f1);
      cur[lang] = term;
      best.set(en, cur);
    }
  }
  for (const en of enN.keys()) if (!best.has(en)) best.set(en, { ja: null, zh: null });
  return best;
}
