/**
 * Pure parsers for the official Digimon cardlist HTML.
 *
 * Extracted from `scripts/scrape-digimon-metadata.ts` so the parsing logic can
 * be unit-tested without spinning up a DB connection or touching the network.
 *
 * The scrape script keeps the fetch / DB / orchestration layer; everything here
 * is synchronous, deterministic, side-effect-free, and accepts pre-fetched HTML.
 */

import * as cheerio from "cheerio";
// `AnyNode` was a public re-export in older versions of cheerio. In 1.x
// it has to be pulled from the underlying domhandler package directly.
import type { AnyNode } from "domhandler";

export type ScrapedCard = {
  code: string;
  name: string;
  rarity: string;
  card_type: string;
  level: number | null;
  color: string | null;
  color2: string | null;
  play_cost: number | null;
  dp: number | null;
  attribute: string | null;
  form: string | null;
  stage: string | null;
  digi_types: string | null;
  evolution_cost: string | null;
  evolution_requirements: string | null;
  main_effect: string | null;
  security_effect: string | null;
  inherited_effect: string | null;
  source_effect: string | null;
  set_names: string | null;
  image_url: string;
  /** ---- Dual cards (デジモン/オプション) -----------------------------------
   *  A Dual card is literally two cards on one piece of cardboard: a Digimon
   *  on top, an Option on the bottom. The official sites render the second
   *  half in its own `.dualCardCol` with its own name, colour, cost and text.
   *  Every field above describes the DIGIMON half only. */
  dual_name: string | null;
  /** Canonical English colour name, so `cards.dual_color` means the same
   *  thing whichever official site filled it in. */
  dual_color: string | null;
  dual_cost: number | null;
  dual_effect: string | null;
  /** [デュアルルール] — how the two halves interact (≪アーツ進化≫ &c.). */
  dual_rule: string | null;
  /** ---- Link cards (リンク) ------------------------------------------------
   *  A Link card plugs sideways into another Digimon; these describe what it
   *  contributes while plugged in. Stored as a NUMBER because the two official
   *  sites print the same value differently ("DP+2000" vs "+2000 DP") and the
   *  page should not read differently per language over a formatting quirk. */
  link_dp: number | null;
  link_requirement: string | null;
  link_effect: string | null;
  /** [特別ルール] — card-specific rules text, e.g. ≪オーバーフロー《-4》≫. */
  special_rule: string | null;
};

/**
 * The JP site (digimoncard.com) renders the exact same DOM as the EN site
 * (world.digimoncard.com) but with localized field labels. Parsers take a
 * LabelMap so the same code scrapes both.
 */
export type LabelMap = {
  color: string;
  cost: string;
  form: string;
  attribute: string;
  type: string;
  evoCost: string;
  /** 進化条件2 — a second, alternative digivolve line (20 cards have one). */
  evoCost2: string;
  /** 【特殊進化】 — DNA digivolve / ジョグレス and friends. */
  evoCondition: string;
  /** 【特殊登場】 — Assembly / DigiXros and other alternative PLAY costs.
   *  A separate block from evoCondition on the official site; missing it is
   *  why Assembly requirements never appeared outside English. */
  specialPlay: string;
  effect: string;
  security: string;
  inherited: string;
  source: string;
  notes: string;
  /** ---- Dual cards ---- labels live inside `.dualCardCol`. */
  dualColor: string;
  dualCost: string;
  dualEffect: string;
  dualRule: string;
  /** ---- Link cards ---- the 下段テキスト / "Card Text 2" section. A Link
   *  card plugs sideways into another Digimon, and these three blocks are
   *  what it contributes while plugged in. */
  linkDp: string;
  linkRequirement: string;
  linkEffect: string;
  /** [特別ルール] — card-specific rules text (Overflow &c.). The EN site also
   *  (mis)uses this label for a Link card's DP line; see parseCardBlock. */
  specialRule: string;
  /** Absolute prefix for relative image srcs. */
  imageBase: string;
};

export const EN_LABELS: LabelMap = {
  color: "Color",
  cost: "Cost",
  form: "Form",
  attribute: "Attribute",
  type: "Type",
  evoCost: "Digivolve Cost 1",
  evoCost2: "Digivolve Cost 2",
  evoCondition: "[Special Digivolution Condition]",
  specialPlay: "[Special Play Condition]",
  effect: "[Effect]",
  security: "[Security Effect]",
  inherited: "[Inherited Effect]",
  source: "[Source Effect]",
  notes: "Notes",
  dualColor: "DUAL Color",
  dualCost: "DUAL Cost",
  dualEffect: "[DUAL Effect]",
  dualRule: "[DUAL Rule]",
  linkDp: "[Link DP]",
  linkRequirement: "[Link Condition]",
  linkEffect: "[Link Effect]",
  specialRule: "[Special Rule]",
  imageBase: "https://world.digimoncard.com",
};

export const JA_LABELS: LabelMap = {
  color: "色",
  cost: "コスト",
  form: "形態",
  attribute: "属性",
  type: "タイプ",
  evoCost: "進化条件1",
  evoCost2: "進化条件2",
  evoCondition: "[特殊進化]",
  specialPlay: "[特殊登場]",
  effect: "[効果]",
  security: "[セキュリティ効果]",
  inherited: "[進化元効果]",
  source: "[ソース効果]",
  notes: "入手情報",
  dualColor: "デュアル条件色",
  dualCost: "デュアル使用コスト",
  dualEffect: "[デュアル効果]",
  dualRule: "[デュアルルール]",
  linkDp: "[リンクDP]",
  linkRequirement: "[リンク条件]",
  linkEffect: "[リンク中効果]",
  specialRule: "[特別ルール]",
  imageBase: "https://digimoncard.com",
};

/**
 * Colour words → the canonical English names already used by `cards.color`
 * (and by `colorHex` / `parseEvolutionCost` on the front end). The JP and EN
 * sites print the same colour in their own language; storing one canon means
 * a Dual card scraped from either site renders identically.
 */
const COLOR_CANON: Record<string, string> = {
  赤: "Red",
  青: "Blue",
  黄: "Yellow",
  緑: "Green",
  黒: "Black",
  紫: "Purple",
  白: "White",
  Red: "Red",
  Blue: "Blue",
  Yellow: "Yellow",
  Green: "Green",
  Black: "Black",
  Purple: "Purple",
  White: "White",
};

export function canonColor(s: string): string | null {
  return COLOR_CANON[s.trim()] ?? null;
}

export function normalize(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

export function ndOrNull(s: string | undefined): string | null {
  const v = normalize(s);
  return v ? v : null;
}

export function toInt(s: string | undefined | null): number | null {
  if (!s) return null;
  const m = s.match(/-?\d+/);
  return m ? parseInt(m[0], 10) : null;
}

export function levelFromText(s: string | null): number | null {
  if (!s) return null;
  const m = s.match(/Lv\.?\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Every effect-block label the parser knows how to file.
 *
 * This exists so an UNKNOWN one can be reported. Three times now a mechanic
 * has shipped in a new block — [特殊登場], [デュアル効果], [リンク条件] — and
 * each time the parser silently ignored it and the text simply wasn't on the
 * site, with nothing to indicate anything was missing. `unknownBlockLabels`
 * turns that into a warning on the very first scrape after Bandai adds one.
 */
export function knownBlockLabels(L: LabelMap): Set<string> {
  return new Set([
    L.evoCondition,
    L.specialPlay,
    L.effect,
    L.security,
    L.inherited,
    L.source,
    L.dualEffect,
    L.dualRule,
    L.linkDp,
    L.linkRequirement,
    L.linkEffect,
    L.specialRule,
  ]);
}

/** Labels present in this block that `knownBlockLabels` doesn't cover. */
export function unknownBlockLabels(
  $: cheerio.CheerioAPI,
  block: AnyNode,
  L: LabelMap = EN_LABELS,
): string[] {
  const known = knownBlockLabels(L);
  const found = new Set<string>();
  $(block)
    .find("dl.cardInfoBoxSmall .cardInfoTitSmall")
    .each((_i, e) => {
      const label = normalize($(e).text());
      if (label && !known.has(label)) found.add(label);
    });
  return [...found];
}

export function parseCardBlock(
  $: cheerio.CheerioAPI,
  block: AnyNode,
  L: LabelMap = EN_LABELS,
): ScrapedCard | null {
  const $el = $(block);
  const code = normalize($el.find(".cardNo").first().text());
  if (!code) return null;

  // A Dual card's second half sits in `.dualCardCol` INSIDE this same block,
  // and it re-uses the same class names (.cardTitle, .cardInfoBox,
  // .cardInfoBoxSmall). Every main-side lookup below therefore has to exclude
  // that subtree, or a Dual card would silently pick up Option-side values.
  const notDual = (_i: number, e: AnyNode) => $(e).closest(".dualCardCol").length === 0;
  const $dual = $el.find(".dualCardCol").first();

  const name = normalize($el.find(".cardTitle").filter(notDual).first().text());
  const rarity = normalize($el.find(".cardRarity").first().text());
  let card_type = normalize($el.find(".cardType").first().text());
  // Normalize "Digimon/Option" (dual-mode cards) to existing convention "Dual"
  if (card_type.includes("/")) card_type = "Dual";
  // Official promo cards inconsistently write "Digi-egg"; normalize casing.
  if (/^digi-egg$/i.test(card_type)) card_type = "Digi-Egg";
  const levelText = normalize($el.find(".cardLv").first().text());
  const level = levelFromText(levelText);

  // Color: ONLY from the "Color" dl. Note other cells (Digivolve Cost) also use
  // cardColor_<name> spans, so we must scope to the dl whose <dt> is "Color".
  const colors: string[] = [];
  $el.find("dl.cardInfoBox").filter(notDual).each((_i, dl) => {
    const dt = $(dl).find(".cardInfoTit").first();
    if (normalize(dt.text()) !== L.color) return;
    $(dl)
      .find("dd span[class^='cardColor_']")
      .each((_j, s) => {
        const cls = $(s).attr("class") ?? "";
        const t = normalize($(s).text());
        if (cls !== "cardColor_" && t && !colors.includes(t)) colors.push(t);
      });
    return false; // found the Color cell, stop
  });
  const [color = null, color2 = null] = colors;

  // Helper: find dd by dt label text. Strips out any nested link list
  // (the "CARD LIST / PRODUCTS" buttons in the Notes field) before reading text.
  function dd(label: string): string | null {
    let result: string | null = null;
    $el
      .find("dl.cardInfoBox .cardInfoTit, dl.cardInfoBoxSmall .cardInfoTitSmall")
      .filter(notDual)
      .each((_i, e) => {
        if (normalize($(e).text()) === label) {
          const $dd = $(e).siblings("dd").first().clone();
          $dd.find("ul.cardInfoLink, .cardInfoLink").remove();
          result = normalize($dd.text());
          return false;
        }
      });
    return result;
  }

  const play_cost = toInt(dd(L.cost));
  const dp = toInt(dd("DP"));
  const form = ndOrNull(dd(L.form) ?? "");
  // Stage isn't a separate field on this site - reuse Form (DB has both)
  const stage = form;
  const attribute = ndOrNull(dd(L.attribute) ?? "");
  const digi_types = ndOrNull(dd(L.type) ?? "");
  // Some cards offer a second, alternative digivolve line ("Red from a Tamer"
  // alongside "Red from Lv.2"). Only the first was ever read, so 20 cards were
  // missing half their digivolve options. Newline-joined; the renderer splits.
  const evolution_cost =
    [dd(L.evoCost), dd(L.evoCost2)]
      .map((v) => normalize(v ?? ""))
      .filter((v) => v !== "")
      .join("\n") || null;
  // Both blocks describe "how else this card can hit the field", so they share
  // one field. Kept in page order (digivolve first) and newline-joined.
  const evolution_requirements =
    [
      effectByLabel($, $el, L.evoCondition),
      effectByLabel($, $el, L.specialPlay),
    ]
      .filter((v): v is string => !!v && v.trim() !== "")
      .join("\n") || null;

  const main_effect = effectByLabel($, $el, L.effect);
  const security_effect = effectByLabel($, $el, L.security);
  let inherited_effect = effectByLabel($, $el, L.inherited);
  // Source/Pool effects vary by translation; capture if present
  const source_effect = effectByLabel($, $el, L.source);

  const set_names = ndOrNull(dd(L.notes) ?? "");

  // ---- Link card: the 下段テキスト / "Card Text 2" blocks --------------------
  // The JP site labels all three properly. The EN site does not, and gets it
  // wrong in two separate ways on the same card, so both need repairing here
  // rather than at 13 call sites:
  //   · it labels the Link DP block [Special Rule]
  //   · it has no Link Condition / Link Effect blocks at all and instead
  //     concatenates both into [Inherited Effect] — the very slot that means
  //     "what this card gives the Digimon it's underneath", which is a
  //     different thing from what a Link card gives the Digimon it's plugged
  //     into. 12 of 13 BT21 Link cards look like this.
  let link_dp = toInt(effectByLabel($, $el, L.linkDp));
  let link_requirement = effectByLabel($, $el, L.linkRequirement);
  let link_effect = effectByLabel($, $el, L.linkEffect);
  let special_rule = effectByLabel($, $el, L.specialRule);

  // The Link condition always opens with the ＜Link＞ / 〈リンク〉 keyword, so a
  // block starting with it is a Link block wherever the site filed it.
  const LINK_HEAD_RE = /^[＜<〈《≪]\s*(?:Link|リンク|链接|鏈接)\s*[＞>〉》≫]/;
  if (inherited_effect && LINK_HEAD_RE.test(inherited_effect)) {
    // Only adopt the text when the proper blocks are absent — but clear the
    // slot either way. An inherited effect can never begin with the Link
    // keyword, so this block is a Link block wherever the site filed it.
    // (P-190's EN page prints BOTH the real [Link Condition] block AND a
    // duplicate under [Inherited Effect]; a guard on link_requirement alone
    // left the duplicate showing as 进化元效果.)
    if (!link_requirement) {
      const [first, ...rest] = inherited_effect.split("\n");
      link_requirement = first.trim();
      link_effect = link_effect ?? (rest.join("\n").trim() || null);
    }
    inherited_effect = null;
  }
  // Only reinterpret [Special Rule] once we know this really is a Link card
  // and the DP block is otherwise missing — BT21-051's [特別ルール] is a
  // genuine rules line (≪オーバーフロー《-4》≫) and must stay put.
  if (link_dp === null && link_requirement && special_rule) {
    const dp = toInt(special_rule);
    if (dp !== null && /dp/i.test(special_rule)) {
      link_dp = dp;
      special_rule = null;
    }
  }

  // ---- Dual card: the Option half in `.dualCardCol` -------------------------
  // Without this the second half vanished entirely from the JP text, and the
  // English row got it filed under `inherited_effect` by digimoncard.io — the
  // same block landing in a different (wrong) place in each language.
  let dual_name: string | null = null;
  let dual_color: string | null = null;
  let dual_cost: number | null = null;
  let dual_effect: string | null = null;
  let dual_rule: string | null = null;
  if ($dual.length > 0) {
    dual_name = ndOrNull($dual.find(".cardTitle").first().text());
    const dcolors: string[] = [];
    $dual.find("dl.cardInfoBox").each((_i, dl) => {
      if (normalize($(dl).find(".cardInfoTit").first().text()) !== L.dualColor)
        return;
      $(dl)
        .find("dd span[class^='cardColor_']")
        .each((_j, s) => {
          const c = canonColor(normalize($(s).text()));
          if (c && !dcolors.includes(c)) dcolors.push(c);
        });
      return false;
    });
    dual_color = dcolors.length > 0 ? dcolors.join("") : null;
    $dual.find("dl.cardInfoBox").each((_i, dl) => {
      if (normalize($(dl).find(".cardInfoTit").first().text()) !== L.dualCost)
        return;
      dual_cost = toInt(normalize($(dl).find("dd").first().text()));
      return false;
    });
    dual_effect = effectByLabel($, $el, L.dualEffect, true);
    dual_rule = effectByLabel($, $el, L.dualRule, true);
  }

  // Image
  let img = $el.find(".cardImg img").attr("src") ?? "";
  if (img.startsWith("../")) {
    img = `${L.imageBase}/` + img.replace(/^\.\.\//, "");
  } else if (img.startsWith("/")) {
    img = L.imageBase + img;
  }
  // Strip cache-buster query string
  img = img.replace(/\?[^"?]+$/, "");

  return {
    code,
    name,
    rarity,
    card_type,
    level,
    color,
    color2,
    play_cost,
    dp,
    attribute,
    form,
    stage,
    digi_types,
    evolution_cost,
    evolution_requirements,
    main_effect,
    security_effect,
    inherited_effect,
    source_effect,
    set_names,
    image_url: img,
    dual_name,
    dual_color,
    dual_cost,
    dual_effect,
    dual_rule,
    link_dp,
    link_requirement,
    link_effect,
    special_rule,
  };
}

/**
 * Read one labelled effect block.
 *
 * `dual` picks which half of a Dual card to read from: the default (false)
 * skips the `.dualCardCol` subtree, `true` reads only inside it. Dual and
 * main labels happen to differ today ([効果] vs [デュアル効果]), but relying
 * on that would break the moment the site reuses a label.
 */
export function effectByLabel(
  $: cheerio.CheerioAPI,
  $el: cheerio.Cheerio<AnyNode>,
  label: string,
  dual = false,
): string | null {
  let out: string | null = null;
  $el.find("dl.cardInfoBoxSmall").each((_i, dl) => {
    if (($(dl).closest(".dualCardCol").length > 0) !== dual) return;
    const dt = $(dl).find(".cardInfoTitSmall").first();
    if (normalize(dt.text()) === label) {
      const dd = $(dl).find("dd.cardInfoData").first();
      // Keep <br> as newlines. normalize() (below) collapses ALL whitespace —
      // including the literal "\n" we'd get from replaceWith("\n") — so we
      // stash a sentinel that survives normalize, then swap it for "\n" after.
      const SENTINEL = "__BR_SENTINEL__";
      dd.find("br").replaceWith(SENTINEL);
      out = normalize(dd.text()).replace(
        new RegExp(`\\s*${SENTINEL}\\s*`, "g"),
        "\n",
      );
      return false;
    }
  });
  return out;
}

/**
 * Parse a full result page (one `<div class="popupCol">` per printing).
 *
 * The site renders one popupCol per *printing* (base + each parallel), and they
 * all share the same id (= code). Dedupe by code, preferring the base-art
 * printing (image_url with no _P<digit> suffix).
 */
/** One official Q&A entry for a card (from the JP site's カードQ&A block). */
export type ScrapedRuling = {
  code: string;
  q_number: string; // "Q6309"
  date: string; // "2026.05.08" (the "更新" suffix stripped)
  question: string;
  answer: string;
};

/**
 * Parse the official card Q&A out of a result page. Each `.popupCol` (one per
 * printing) may carry a `ul.cardFaqList`; we key the entries by the printing's
 * code and dedupe by code+q_number across the parallel printings. Newlines in
 * answers (the site uses <br>) are preserved.
 *
 * Source is the JP cardlist (digimoncard.com), the authoritative Q&A — the EN
 * site doesn't carry these, and the CN site exposes no rulings API.
 */
export function parseRulingsAll(html: string): ScrapedRuling[] {
  const $ = cheerio.load(html);
  const out: ScrapedRuling[] = [];
  const seen = new Set<string>(); // code|qnum
  $(".popupCol").each((_i, el) => {
    const $el = $(el);
    const code = normalize($el.find(".cardNo").first().text());
    if (!code) return;
    $el.find("ul.cardFaqList li.cardFaqListItem").each((_j, li) => {
      const $li = $(li);
      const q_number = normalize($li.find(".cardFaqNum").first().text());
      const date = normalize($li.find(".cardFaqDate").first().text())
        .replace(/\s*更新\s*$/, "")
        .trim();
      const question = normalize($li.find(".cardFaqQuestion").first().text());
      const $ans = $li.find(".cardFaqAnswer").first().clone();
      const SENT = "__BR__";
      $ans.find("br").replaceWith(SENT);
      const answer = normalize($ans.text()).replace(
        new RegExp(`\\s*${SENT}\\s*`, "g"),
        "\n",
      );
      if (!q_number || (!question && !answer)) return;
      const key = `${code}|${q_number}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ code, q_number, date, question, answer });
    });
  });
  return out;
}

/**
 * Block labels seen in the last `parseAll` that no field maps to.
 *
 * Module-level rather than a return value so adding this didn't change
 * `parseAll`'s signature for its five callers; the scrapers read it right
 * after their own parseAll call.
 */
export let lastUnknownLabels: Map<string, string[]> = new Map();

export function parseAll(html: string, labels: LabelMap = EN_LABELS): ScrapedCard[] {
  const $ = cheerio.load(html);
  const byCode = new Map<string, ScrapedCard[]>();
  lastUnknownLabels = new Map();
  $(".popupCol").each((_i, el) => {
    const c = parseCardBlock($, el, labels);
    if (!c) return;
    const unknown = unknownBlockLabels($, el, labels);
    if (unknown.length > 0) {
      for (const u of unknown) {
        const codes = lastUnknownLabels.get(u) ?? [];
        if (codes.length < 5) codes.push(c.code);
        lastUnknownLabels.set(u, codes);
      }
    }
    byCode.set(c.code, [...(byCode.get(c.code) ?? []), c]);
  });
  return [...byCode.values()].map(mergePrintings);
}

/**
 * Text fields that describe the CARD, so every printing of it must agree.
 * Excluded on purpose: rarity, image_url and card_type, which legitimately
 * differ between a base print and its parallels.
 */
const MERGEABLE_FIELDS = [
  "main_effect",
  "security_effect",
  "inherited_effect",
  "source_effect",
  "evolution_cost",
  "evolution_requirements",
  "digi_types",
  "attribute",
  "form",
  "stage",
  "set_names",
  "dual_name",
  "dual_color",
  "dual_effect",
  "dual_rule",
  "link_requirement",
  "link_effect",
  "special_rule",
] as const satisfies readonly (keyof ScrapedCard)[];

const MERGEABLE_NUMBERS = [
  "dual_cost",
  "link_dp",
] as const satisfies readonly (keyof ScrapedCard)[];

/**
 * Collapse every printing of one card into a single row.
 *
 * The base print wins on identity (rarity, image), but any field it leaves
 * EMPTY is filled from a parallel. This is not tidiness — the official site
 * genuinely contradicts itself between printings of the same card. P-148 and
 * P-149 label their one text block [Security Effect] on the base print and
 * [Inherited Effect] on both parallels; taking the base print wholesale meant
 * a Digi-Egg with a security effect and an empty inherited slot, which is not
 * a thing that can exist.
 */
export function mergePrintings(printings: ScrapedCard[]): ScrapedCard {
  const base =
    printings.find((c) => !/_P\d+\.png$/i.test(c.image_url)) ?? printings[0];
  if (printings.length === 1) return fixDigiEggSecurity(base);
  const merged: ScrapedCard = { ...base };
  for (const f of MERGEABLE_FIELDS) {
    if (merged[f] != null && merged[f] !== "") continue;
    const found = printings.find((c) => c[f] != null && c[f] !== "");
    if (found) (merged[f] as string | null) = found[f] as string | null;
  }
  for (const f of MERGEABLE_NUMBERS) {
    if (merged[f] != null) continue;
    const found = printings.find((c) => c[f] != null);
    if (found) (merged[f] as number | null) = found[f] as number | null;
  }
  return fixDigiEggSecurity(merged);
}

/**
 * A Digi-Egg cannot have a security effect: it lives in the egg deck and never
 * enters the security stack. So when the site prints one — which it does, on
 * the base printings of P-148 and P-149 — it is the inherited effect wearing
 * the wrong label, and an inherited effect is the only kind a Digi-Egg has.
 */
function fixDigiEggSecurity(c: ScrapedCard): ScrapedCard {
  if (c.card_type !== "Digi-Egg" || !c.security_effect) return c;
  return {
    ...c,
    inherited_effect: c.inherited_effect || c.security_effect,
    security_effect: null,
  };
}

/**
 * The site's card-type words, in the canonical English `cards.card_type` uses.
 *
 * A closed vocabulary — the whole JP corpus is these five values — so
 * `canonicalJpType` returns undefined for anything unlisted rather than
 * guessing. It exists because WHAT a card is, like which fields it has, is a
 * fact about the printed card and not about the language, and this site is the
 * one that gets it right: world.digimoncard.com calls all twelve of
 * LM-027…038 "Digimon" when they are Options, and the EN scraper assigns
 * `card_type` unconditionally, so its verdict was final and the type filter
 * never returned those cards.
 */
export const JP_CARD_TYPE: Record<string, string> = {
  デジモン: "Digimon",
  オプション: "Option",
  テイマー: "Tamer",
  デジタマ: "Digi-Egg",
  // Already English by the time it gets here: the parser composes it from the
  // two halves the site prints separately.
  Dual: "Dual",
};

/** Canonical English for a JP type word, or undefined if we don't model it. */
export function canonicalJpType(t: string | null | undefined): string | undefined {
  return t ? JP_CARD_TYPE[t.trim()] : undefined;
}
