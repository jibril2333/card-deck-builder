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
  imageBase: "https://world.digimoncard.com",
};

export const JA_LABELS: LabelMap = {
  color: "色",
  cost: "コスト",
  form: "形態",
  attribute: "属性",
  type: "タイプ",
  evoCost: "進化条件1",
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
  const evolution_cost = ndOrNull(dd(L.evoCost) ?? "");
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
  const inherited_effect = effectByLabel($, $el, L.inherited);
  // Source/Pool effects vary by translation; capture if present
  const source_effect = effectByLabel($, $el, L.source);

  const set_names = ndOrNull(dd(L.notes) ?? "");

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

export function parseAll(html: string, labels: LabelMap = EN_LABELS): ScrapedCard[] {
  const $ = cheerio.load(html);
  const byCode = new Map<string, ScrapedCard>();
  $(".popupCol").each((_i, el) => {
    const c = parseCardBlock($, el, labels);
    if (!c) return;
    const isBase = !/_P\d+\.png$/i.test(c.image_url);
    const existing = byCode.get(c.code);
    if (!existing) {
      byCode.set(c.code, c);
    } else if (isBase && /_P\d+\.png$/i.test(existing.image_url)) {
      // Replace alt-art entry with the base one
      byCode.set(c.code, c);
    }
  });
  return [...byCode.values()];
}
