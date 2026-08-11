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

/**
 * The CN digivolve-cost line, reshaped to match the other two languages.
 *
 * The feed gives "绿Lv.4起4；黑Lv.4起4" — alternatives separated by a full-width
 * semicolon. The official sites split the same thing across 進化条件1 and
 * 進化条件2, which the parser newline-joins, so newline-joining here puts all
 * three languages in one shape and EvolutionCost renders a row per alternative.
 *
 * The text itself stays verbatim Chinese: parseEvolutionCost only recognizes
 * English colour names and falls through to printing the string as-is, which is
 * the right outcome — a Chinese reader was previously shown the ENGLISH cost
 * line, because this field was hardcoded to null and the page fell back.
 */
export function cnEvolutionCost(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v || v === "-") return null;
  return (
    v
      .split(/[；;]/)
      .map((p) => p.trim())
      .filter(Boolean)
      .join("\n") || null
  );
}

// ── Artwork ─────────────────────────────────────────────────────────────────

/**
 * Split a CN feed `model` into the card code and its printing suffix.
 *
 * The feed does NOT repeat a card's code for its parallel printings the way the
 * other sources do. A reprint or alt art gets its own row under a SUFFIXED
 * model — `BT12-085_01`, `BT12-085_LM06`, `BT17-035_ST22`, `BT11-064_BT25` —
 * and only the original printing carries the bare code.
 *
 * Keying artwork on the raw `model` is what cost us Chinese alt art for almost
 * the whole game: every suffixed row hashed to a code our `cards` table has
 * never heard of and was dropped. The 188 that survived came from BT1–BT6 and
 * EX1/EX2, where the feed happens to repeat the BARE code for the parallel too.
 *
 * Safe to split on the first `_`: no Digimon card code contains one (checked
 * against the live table — 0 of 4370). UA codes do, but they come from a
 * different feed entirely.
 */
export function splitCnModel(model: string): {
  code: string;
  printing: string | null;
} {
  const i = model.indexOf("_");
  return i < 0
    ? { code: model, printing: null }
    : { code: model.slice(0, i), printing: model.slice(i + 1) || null };
}

/**
 * Order two printing suffixes. Plain numbers (`01`, `02`) first and in numeric
 * order, everything else after them alphabetically.
 *
 * Deterministic rather than feed-order, because the suffix decides the
 * `card_images.variant` key (`_P1`, `_P2`, …). Feed order is whatever the
 * paginated list happens to return, so using it would reshuffle which art is
 * `_P1` on a re-scrape.
 */
export function comparePrintings(a: string, b: string): number {
  const na = /^\d+$/.test(a) ? Number(a) : null;
  const nb = /^\d+$/.test(b) ? Number(b) : null;
  if (na !== null && nb !== null) return na - nb;
  if (na !== null) return -1;
  if (nb !== null) return 1;
  return a.localeCompare(b);
}

/** Trailing `_NN` in an image FILENAME, e.g. `BT1-009_01.png` → 1. */
function filenameParallelNo(url: string): number | null {
  const m = url.match(/_(\d+)\.[a-z]+$/i);
  return m ? parseInt(m[1], 10) : null;
}

export type CnArtRow = { model: string; imageCover: string | null };

/**
 * Group the feed's rows into one base print plus ordered alt arts per card
 * code.
 *
 * Two shapes have to be handled at once, because the feed uses both:
 *
 *   - suffixed models (everything since about BT7) — the suffix says which
 *     printing it is, so it decides both "is this an alt" and the ordering;
 *   - repeated BARE models (BT1–BT6, EX1/EX2, ST1–3) — two rows that both say
 *     `BT1-009`, told apart only by the filename (`BT1-009C.png` vs
 *     `BT1-009_01.png`).
 *
 * Numbered printings come first so `_P1`/`_P2` line up with the feed's own
 * `_01`/`_02` wherever it has them.
 */
export function groupCnArt(
  rows: CnArtRow[],
): Map<string, { base: string; alts: string[] }> {
  const bare = new Map<string, string[]>();
  const suffixed = new Map<string, Map<string, string>>();

  for (const r of rows) {
    const img = (r.imageCover ?? "").trim();
    if (!img || !r.model) continue;
    const { code, printing } = splitCnModel(r.model.trim());
    if (printing === null) {
      const list = bare.get(code) ?? [];
      if (!list.includes(img)) list.push(img);
      bare.set(code, list);
    } else {
      const m = suffixed.get(code) ?? new Map<string, string>();
      // Same printing seen twice: first wins, so a re-scrape is idempotent.
      if (!m.has(printing)) m.set(printing, img);
      suffixed.set(code, m);
    }
  }

  const out = new Map<string, { base: string; alts: string[] }>();
  for (const code of new Set([...bare.keys(), ...suffixed.keys()])) {
    const bareImgs = bare.get(code) ?? [];
    // Within the bare rows the base is the one whose filename has no `_NN`.
    const plain = bareImgs.filter((u) => filenameParallelNo(u) === null);
    const numbered = bareImgs
      .filter((u) => filenameParallelNo(u) !== null)
      .sort((a, b) => filenameParallelNo(a)! - filenameParallelNo(b)!);
    const fromSuffix = [...(suffixed.get(code) ?? new Map())]
      .sort(([a], [b]) => comparePrintings(a, b))
      .map(([, img]) => img);

    // Some codes never show up under their bare model at all — only as `_01`,
    // or with a `_NN` filename. Whichever printing sorts first stands in as the
    // base; dropping the card because the original print is missing would lose
    // the art entirely, which is worse than labelling a parallel as the base.
    const base = plain[0] ?? numbered.shift() ?? fromSuffix.shift();
    if (!base) continue;

    const alts: string[] = [];
    for (const u of [...numbered, ...fromSuffix]) {
      if (u !== base && !alts.includes(u)) alts.push(u);
    }
    out.set(code, { base, alts });
  }
  return out;
}

/**
 * Group feed rows by card code and pick the one that supplies that card's TEXT.
 *
 * A bare-model row always wins. A suffixed row is a reprint of the same card,
 * and its text is occasionally re-worded to newer errata — picking that over
 * the original printing would silently change what a card says, which is not
 * ours to decide.
 *
 * But some cards NEVER appear under their bare code: the CN feed carries
 * LM-054 only as `LM-054_LM07`, P-197 only as `P-197_TSPR`. Skipping every
 * suffixed row left those with no Chinese at all — 74 cards, nearly all of the
 * P and LM promos — and the deck view fell back to English for them. When the
 * bare row doesn't exist, the reprint IS the only printing we know about, so it
 * supplies the text.
 *
 * Ordering among suffixed candidates is `comparePrintings`, for the same reason
 * as the artwork: feed order is whatever pagination returned, and text that
 * changes between scrapes for no reason is worse than either choice.
 */
export function chooseCnTextRows<T extends { model: string }>(
  rows: T[],
): Map<string, T> {
  const bare = new Map<string, T>();
  const fallback = new Map<string, { printing: string; row: T }>();

  for (const r of rows) {
    const { code, printing } = splitCnModel((r.model ?? "").trim());
    if (!code) continue;
    if (printing === null) {
      // First bare row wins; later duplicates are parallel printings that the
      // old feed shape reports under the same model.
      if (!bare.has(code)) bare.set(code, r);
      continue;
    }
    const cur = fallback.get(code);
    if (!cur || comparePrintings(printing, cur.printing) < 0) {
      fallback.set(code, { printing, row: r });
    }
  }

  const out = new Map<string, T>(bare);
  for (const [code, { row }] of fallback) {
    if (!out.has(code)) out.set(code, row);
  }
  return out;
}
