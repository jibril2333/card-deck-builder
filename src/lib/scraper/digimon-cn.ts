/**
 * Pure text parsers for the official CN feed (dtcgweb-api.digimoncard.cn).
 *
 * Same reasoning as `digimon.ts`: the fetch/DB orchestration stays in
 * `scripts/scrape-digimon-cn.ts`, everything here is synchronous and
 * side-effect-free so it can be unit-tested.
 *
 * The CN feed carries fewer fields than the official JP/EN sites and crams the
 * missing ones into the effect bodies. These functions put them back where the
 * other two languages keep them, so the same card renders the same shape in
 * all three.
 */

/**
 * Effect-text cleaner. digimoncard.cn encodes line breaks as the literal token
 * "enter" (sometimes followed by a real newline, sometimes used alone as the
 * only separator). Normalize every "enter" to a newline and collapse the blank
 * lines that creates. Chinese card text never contains the English word, so
 * this is unambiguous.
 */
export function cleanEffect(s: string | null | undefined): string | null {
  const v = (s ?? "").trim();
  if (!v || v === "-") return null;
  return v
    .replace(/enter/g, "\n")
    .replace(/[ \t]*\n[ \t]*(?:\n[ \t]*)*/g, "\n")
    .trim();
}

/**
 * Split the leading requirement lines out of a CN effect body.
 *
 * The official JP/EN sites give the special-digivolve and alternative-play
 * conditions their own labelled blocks ([特殊進化] / [特殊登場]); the CN feed
 * has no such field and just runs them into the top of `effect`. That's why
 * the same card showed a 〔进化〕 line inside 主要效果 in Chinese but under
 * 进化条件 in Japanese.
 *
 * Only CONSECUTIVE LEADING lines are taken, and only ones opening with a
 * recognized marker — 〔进化〕〔合步〕〔应用合体〕〔爆裂进化〕 or a
 * 数码合体/应用合体/组装 requirement. Anything unfamiliar stays in the body,
 * so an unrecognized format degrades to today's behaviour instead of eating
 * the card's real text.
 */
const REQ_LINE_RE = /^(?:〔[^〕]+〕|(?:数码合体|应用合体|组装)[-‐–]?\d*[：:])/;

export function splitCnRequirements(effect: string | null): {
  main: string | null;
  req: string | null;
} {
  if (!effect) return { main: null, req: null };
  const lines = effect.split("\n");
  let i = 0;
  while (i < lines.length && REQ_LINE_RE.test(lines[i].trim())) i++;
  if (i === 0) return { main: effect, req: null };
  return {
    main: lines.slice(i).join("\n").trim() || null,
    req: lines.slice(0, i).join("\n").trim() || null,
  };
}

/**
 * Split the Option half out of a Dual card's CN text.
 *
 * A Dual card (デジモン/オプション) is two cards printed on one. The CN feed
 * has no field for the second face, so it appends the whole thing to
 * `envolutionEffect` — the INHERITED-effect field — behind a "选项：<名字>"
 * header. Left alone, the card page labels an Option card's text 进化元效果.
 *
 * Returns the input unchanged for the ~9600 cards that aren't Dual.
 */
const CN_DUAL_HEAD_RE = /^选项[：:]\s*(.+)$/;

export function splitCnDual(inherited: string | null): {
  inherited: string | null;
  dualName: string | null;
  dualEffect: string | null;
} {
  if (!inherited) return { inherited: null, dualName: null, dualEffect: null };
  const lines = inherited.split("\n");
  const m = lines[0].trim().match(CN_DUAL_HEAD_RE);
  if (!m) return { inherited, dualName: null, dualEffect: null };
  return {
    inherited: null,
    dualName: m[1].trim() || null,
    dualEffect: lines.slice(1).join("\n").trim() || null,
  };
}
