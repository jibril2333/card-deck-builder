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
  evoCondition: string;
  effect: string;
  security: string;
  inherited: string;
  source: string;
  notes: string;
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
  effect: "[Effect]",
  security: "[Security Effect]",
  inherited: "[Inherited Effect]",
  source: "[Source Effect]",
  notes: "Notes",
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
  effect: "[効果]",
  security: "[セキュリティ効果]",
  inherited: "[進化元効果]",
  source: "[ソース効果]",
  notes: "入手情報",
  imageBase: "https://digimoncard.com",
};

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

  const name = normalize($el.find(".cardTitle").first().text());
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
  $el.find("dl.cardInfoBox").each((_i, dl) => {
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
  const evolution_requirements = effectByLabel($, $el, L.evoCondition);

  const main_effect = effectByLabel($, $el, L.effect);
  const security_effect = effectByLabel($, $el, L.security);
  const inherited_effect = effectByLabel($, $el, L.inherited);
  // Source/Pool effects vary by translation; capture if present
  const source_effect = effectByLabel($, $el, L.source);

  const set_names = ndOrNull(dd(L.notes) ?? "");

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
  };
}

export function effectByLabel(
  $: cheerio.CheerioAPI,
  $el: cheerio.Cheerio<AnyNode>,
  label: string,
): string | null {
  let out: string | null = null;
  $el.find("dl.cardInfoBoxSmall").each((_i, dl) => {
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
