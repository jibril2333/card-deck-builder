/**
 * Which bracketed tags mean what, per language.
 *
 * The brackets alone don't tell you. Two problems forced this list to exist,
 * and both come from assuming a bracket family maps to one meaning:
 *
 *   1. English writes timing tags AND trait/card-name references in the same
 *      square brackets — [On Play] next to [Greymon] and [X Antibody]. Painting
 *      every one of them navy put a timing colour on 8000+ trait references,
 *      while Japanese wrote the same things as 【登場時】 and 「グレイモン」 and
 *      got them right. Same card, two languages, two different results.
 *
 *   2. Chinese wraps whole DigiXros requirement LINES in 【】 —
 *      【数码合体-2：“奇美拉兽”×“无限龙兽”】 — so a full sentence rendered as a
 *      navy timing chip. 75 of the 95 distinct 【】 values in the CN text are
 *      this, not timings.
 *
 * Timings, limiters and special-digivolve markers are CLOSED vocabularies —
 * roughly 20 each, fixed by the rules of the game. Traits and card names are
 * open-ended and grow with every set. So the closed sets are listed here and
 * everything else in a bracket is a name reference, which also makes the three
 * languages agree: EN [Greymon] now renders like JA 「グレイモン」.
 *
 * Every entry below was taken from the card corpus, not from memory: the
 * distinct contents of 【】 in Japanese (20 values), 〔〕 in Japanese and
 * Chinese, and the English [] values that are neither a known trait nor a card
 * name. Counts in comments are occurrences at the time of writing.
 */

/** When an effect happens. Navy on the card. */
const TIMING = new Set([
  // ---- 日本語 — the complete set of 【】 values in the JP text.
  "進化時", "登場時", "自分のターン", "メイン", "セキュリティ", "お互いのターン",
  "アタック時", "消滅時", "相手のターン", "自分のメインフェイズ開始時",
  "自分のターン終了時", "自分のターン開始時", "カウンター", "アタック終了時",
  "相手のターン終了時", "リンク時", "移動時", "お互いのターン終了時",
  "相手のメインフェイズ開始時", "相手のターン開始時",
  // ---- 中文
  "进化时", "登场时", "我方的回合", "双方的回合", "安防", "攻击时", "主要",
  "消灭时", "我方的主要阶段开始时", "对方的回合", "反击", "我方的回合结束时",
  "我方的回合开始时", "攻击结束时", "对方的回合结束时", "链接时", "移动时",
  "双方的回合结束时", "对方的主要阶段开始时", "对方的回合开始时",
  // The CN source misspells this one on 6 cards (我放 for 我方); it is still
  // a timing, and dropping it would leave those cards with an italic tag.
  "我放的回合",
  // ---- English. [Security] is here and NOT treated as a trait even though
  // "Security" is also in the official trait vocabulary — timings win, or 966
  // timing tags would render as name references.
  "When Digivolving", "On Play", "Your Turn", "Security", "Main", "All Turns",
  "When Attacking", "On Deletion", "Start of Your Main Phase",
  "End of Your Turn", "Start of Your Turn", "Counter", "End of Attack",
  "When Linking", "When Moving", "End of All Turns",
  "Start of Opponent's Main Phase", "Start of Opponent's Turn",
  // The EN text uses both a straight and a curly apostrophe for these.
  "Opponent's Turn", "Opponent’s Turn",
  "End of Opponent's Turn", "End of Opponent’s Turn",
  "At End of Opponent's Turn",
  // Play-location tags. Written with braces in English — {Hand} [Counter] —
  // and normalized to the same set here.
  "Hand", "Trash", "Breeding", "Open",
]);

/** How often it may be used. RED on the card, next to the navy timing. */
const LIMITER = new Set([
  "Once Per Turn", "Once per Turn", "Once Per turn", "Twice Per Turn",
]);

/**
 * Alternative ways onto the field — a different mechanic from a timing window,
 * and a blue-VIOLET on the card, close to but not the same as the timing blue. English files these in the same square brackets as
 * timings ([Digivolve] alone is 1241 occurrences), which is why they need
 * naming rather than inferring from the bracket.
 */
const SPECIAL = new Set([
  // 日本語 — the complete set of 〔〕 values.
  "進化", "ジョグレス", "アプ合体", "バースト進化",
  // 中文
  "进化", "合步", "应用合体", "爆裂进化",
  // English
  "Digivolve", "DNA Digivolve", "DNA Digivolution", "App Fusion",
  "Burst Digivolve",
]);

/**
 * A requirement line printed WITHOUT brackets: "アセンブリ-6:「ネガーモン」4枚",
 * "DigiXros-2: …", "数码合体-2：…". Two mechanics, one fixed shape — a name, a
 * numeric suffix, then a colon — so it can be recognized structurally instead
 * of by scanning prose for vocabulary words.
 *
 * That distinction matters: matching the official keyword list against plain
 * text chipped 511 things that were not keywords, including every "(Draw 1
 * card from your deck.)" reminder and every "ジョグレス進化できる" in ordinary
 * prose, while missing all 144 DigiXros lines because the scraped vocabulary
 * didn't contain デジクロス at all.
 */
export const BARE_REQUIREMENT_RE =
  /(?:アセンブリ|デジクロス|数码合体|组装|应用合体|Assembly|DigiXros)\s*[-－–]\s*[0-9０-９]+\s*[:：]/g;

/**
 * 〈…〉 (U+3008) is NOT the ＜…＞ (U+FF1C) the EN text uses, and it was missing
 * from the tokenizer entirely — 498 tags went unstyled. It carries two things:
 * the Link condition, which English writes as the orange ＜Link＞, and a rules
 * note, which English writes as a plain "(Rule)" with no chip at all. Listing
 * the rules markers keeps the languages showing the same thing.
 */
const RULES_NOTE = new Set(["ルール", "规则", "規則", "Rule"]);

export type TagKind = "timing" | "limiter" | "keyword" | "special" | "name";

/**
 * Classify the contents of a bracket.
 *
 * `bracket` is the opening character, which still carries real information:
 * ≪≫《》＜＞ is unambiguously a keyword ability in every language, and 「」“”
 * is unambiguously a quoted name. Only the square/lenticular brackets are
 * overloaded, and those are what the vocabularies above resolve.
 */
export function classifyTag(bracket: string, inner: string): TagKind {
  const body = inner.trim();
  switch (bracket) {
    case "《":
    case "≪":
    case "＜":
    case "〈":
      return RULES_NOTE.has(body) ? "name" : "keyword";
    case "「":
    case "“":
      return "name";
  }
  if (LIMITER.has(body)) return "limiter";
  if (TIMING.has(body)) return "timing";
  if (SPECIAL.has(body)) return "special";
  // 〔〕 is the special-digivolve bracket, so an unlisted value there is still
  // that family — a new mechanic, not a name.
  if (bracket === "〔") return "special";
  // A whole requirement line the CN source wrapped in 【】.
  if (new RegExp(BARE_REQUIREMENT_RE.source).test(body)) return "special";
  // Everything else in a square/lenticular bracket is a trait or a card name.
  // Open-ended by nature, so it's the default rather than the exception.
  return "name";
}
