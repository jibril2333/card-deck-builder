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

/**
 * DUAL Rule markers, as CN writes them.
 *
 * The official sites label this block ([デュアルルール] / [DUAL Rule]); CN
 * appends it to the effect text as a trailing line instead. It describes how
 * the two faces interact, not what the Option does, so it belongs in its own
 * field like it does in the other two languages.
 *
 * The mechanic currently has exactly one member — 技艺进化 / アーツ進化 /
 * Arts Digivolve — in all three languages. Written as a list, and matched
 * regardless of which bracket style CN uses, so a new rule is one entry rather
 * than a rewrite. An unrecognized trailing line simply stays in the effect
 * text: worse layout, never lost text.
 */
const CN_DUAL_RULE_RE = /^[【《≪＜]\s*(?:技艺进化)\s*[】》≫＞]/;

/**
 * Split a Link card's blocks out of the CN inherited-effect field.
 *
 * Third variation on the same theme. The official JP site labels a Link card's
 * three lower-text blocks ([リンク条件] / [リンクDP] / [リンク中効果]); the CN
 * feed appends all of them to `envolutionEffect`, so what a Link card does
 * while plugged into another Digimon showed up as its 进化元效果 — a genuinely
 * different game concept.
 *
 * The shape is fixed and self-identifying: the condition line opens with the
 * 〈链接〉 keyword, the DP line is a bare 【DP±N】, and whatever follows is the
 * effect. Returns nulls when the text isn't a Link block, so ordinary
 * inherited effects pass straight through.
 */
const CN_LINK_HEAD_RE = /^[〈《＜<]\s*链接\s*[〉》＞>]/;
const CN_LINK_DP_RE = /^【\s*DP\s*([+\-＋－]\s*\d+)\s*】$/i;

export function splitCnLink(inherited: string | null): {
  inherited: string | null;
  linkRequirement: string | null;
  linkDp: number | null;
  linkEffect: string | null;
} {
  const none = {
    inherited,
    linkRequirement: null,
    linkDp: null,
    linkEffect: null,
  };
  if (!inherited) return { ...none, inherited: null };
  const lines = inherited.split("\n");
  if (!CN_LINK_HEAD_RE.test(lines[0].trim())) return none;

  const linkRequirement = lines[0].trim();
  const rest = lines.slice(1);
  let linkDp: number | null = null;
  const effectLines: string[] = [];
  for (const line of rest) {
    const m = line.trim().match(CN_LINK_DP_RE);
    if (m && linkDp === null) {
      linkDp = parseInt(m[1].replace(/[＋]/g, "+").replace(/[－]/g, "-").replace(/\s+/g, ""), 10);
      continue;
    }
    effectLines.push(line);
  }
  return {
    inherited: null,
    linkRequirement,
    linkDp,
    linkEffect: effectLines.join("\n").trim() || null,
  };
}

export function splitCnDual(inherited: string | null): {
  inherited: string | null;
  dualName: string | null;
  dualEffect: string | null;
  dualRule: string | null;
} {
  if (!inherited)
    return { inherited: null, dualName: null, dualEffect: null, dualRule: null };
  const lines = inherited.split("\n");
  const m = lines[0].trim().match(CN_DUAL_HEAD_RE);
  if (!m)
    return { inherited, dualName: null, dualEffect: null, dualRule: null };

  const body = lines.slice(1);
  // Take trailing rule lines off the end, keeping their original order.
  let end = body.length;
  while (end > 0 && CN_DUAL_RULE_RE.test(body[end - 1].trim())) end--;
  return {
    inherited: null,
    dualName: m[1].trim() || null,
    dualEffect: body.slice(0, end).join("\n").trim() || null,
    dualRule: body.slice(end).join("\n").trim() || null,
  };
}
