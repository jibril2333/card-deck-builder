/**
 * Pure parsers for the official UNION ARENA Japanese cardlist HTML.
 *
 * Two endpoints are used by the orchestration script:
 *   - List:   POST  /jp/cardlist/index.php?search=true   body: freewords=<prefix>
 *             → lightweight page with one <li class="cardImgCol"> per entry,
 *               carrying code (in <img alt>), image_url (data-src), and the
 *               iframe detail URL.
 *   - Detail: GET   /jp/cardlist/detail_iframe.php?card_no=<URL-encoded code>
 *             → 100-line HTML with all card fields. The cardNumData span shows
 *               the BASE code (parallel suffix stripped) even when the variant
 *               was requested — so callers must use the REQUESTED code as the
 *               canonical key, not what `cardNumData` says.
 *
 * Everything in this file is sync, dependency-light, and tested via fixtures.
 */

import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
// Relative path (not `@/`) so scripts/ — which is run via tsx and may not have
// tsconfig path aliases at runtime — can resolve this transitively.
import { stripAltArt } from "../alt-art";

const BASE_URL = "https://www.unionarena-tcg.com";

export type ListEntry = {
  /** e.g. `EX01BT/HTR-1-030_p1` */
  code: string;
  /** Card name as written in the list-row <img alt> attribute. */
  name: string;
  /** Absolute image URL with cache-buster (`?v8`) stripped. */
  image_url: string;
};

export type ScrapedUACard = {
  code: string;
  name: string;
  name_reading: string | null;
  series: string;
  /** "Red" / "Blue" / "Yellow" / "Green" / "Purple" / "Unknown" */
  color: string;
  /** Single-token rarity string like "C", "U", "R", "SR", "UR", "R★", "SR★",
   * "SR★★", "U★", "C★", or empty for some Action-Point cards. */
  rarity: string;
  /** "Character" / "Event" / "Action Point" / "フィールド" */
  card_type: string;
  energy_cost: number;
  ap_cost: number;
  bp: number;
  trigger_text: string | null;
  effect_text: string | null;
  image_url: string;
  source_url: string;
};

function normalize(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

function ndOrNull(s: string | undefined | null): string | null {
  const v = normalize(s ?? "");
  if (!v || v === "-") return null;
  return v;
}

function toInt(s: string | undefined | null): number {
  if (!s) return 0;
  const m = s.match(/-?\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

const JP_COLOR_TO_EN: Record<string, string> = {
  赤: "Red",
  青: "Blue",
  黄: "Yellow",
  緑: "Green",
  紫: "Purple",
};

const JP_CARDTYPE_TO_EN: Record<string, string> = {
  キャラクター: "Character",
  イベント: "Event",
  アクションポイント: "Action Point",
  // `フィールド` (Field) cards exist in our DB as the literal Japanese token
  // — preserve to avoid mass-rewriting existing rows.
  フィールド: "フィールド",
};

/**
 * Resolve a relative image URL (`/jp/images/...`) to absolute and strip the
 * cache-buster query string (`?v8`, `?v7`). Returns "" if the input was empty.
 */
function resolveImageUrl(src: string | undefined): string {
  if (!src) return "";
  let url = src.startsWith("/") ? `${BASE_URL}${src}` : src;
  url = url.replace(/\?[^"?]+$/, "");
  return url;
}

/**
 * Parse the list page (POST search). Returns one entry per `<li class="cardImgCol">`.
 *
 * The list does NOT carry rarity / cost / effect — those require a follow-up
 * detail fetch. But it IS the canonical source of which alt-art codes (`_p1`,
 * `_p2`, …) actually exist for a given set; treat it as the inventory step.
 */
export function parseListPage(html: string): ListEntry[] {
  const $ = cheerio.load(html);
  const out: ListEntry[] = [];
  $("li.cardImgCol").each((_i, el) => {
    const $li = $(el);
    const $a = $li.find("a.modalCardDataOpen").first();
    const href = $a.attr("href") ?? "";
    // href like `./detail_iframe.php?card_no=EX01BT/HTR-1-030_p1`
    const m = href.match(/card_no=([^&]+)/);
    if (!m) return;
    const code = decodeURIComponent(m[1]);
    const $img = $a.find("img").first();
    // The card image lives in `data-src` (lazy-loaded); `src` is the dummy gif.
    const image_url = resolveImageUrl(
      $img.attr("data-src") ?? $img.attr("src") ?? "",
    );
    const alt = normalize($img.attr("alt") ?? "");
    // alt = "<code> <name>" — strip the leading code and keep the rest.
    // We also tolerate base-code prefix here (alt-arts show base code in alt).
    let name = alt;
    const baseCode = stripAltArt(code);
    if (alt.startsWith(`${baseCode} `)) name = alt.slice(baseCode.length + 1);
    else if (alt.startsWith(`${code} `)) name = alt.slice(code.length + 1);
    out.push({ code, name, image_url });
  });
  return out;
}

/**
 * Parse one detail-iframe response. The requested `code` is REQUIRED because
 * the page itself strips parallel suffixes from `cardNumData` (it shows the
 * base code even for `_p1` requests), so we trust the caller's code as
 * canonical and derive everything else from the DOM.
 */
export function parseDetailPage(
  html: string,
  requestedCode: string,
): ScrapedUACard | null {
  const $ = cheerio.load(html);
  const $root = $(".cardDetailCol").first();
  if ($root.length === 0) return null;

  // ---- Name + reading ----
  const $title = $root.find(".cardNameCol").first().clone();
  const reading = normalize($title.find(".rubyData").first().text());
  $title.find(".rubyData").remove();
  const name = normalize($title.text());

  // ---- Series + (unused but extractable) series icon class ----
  const $titleImg = $root.find(".cardDataTitleCol img").first();
  const series = normalize($titleImg.attr("alt") ?? "");

  // ---- Rarity ----
  const rarity = normalize($root.find(".rareData").first().text());

  // ---- Card type (mapped to canonical English/preserved-Japanese) ----
  const rawType = normalize(
    $root.find("dl.categoryData .cardDataContents").first().text(),
  );
  const card_type = JP_CARDTYPE_TO_EN[rawType] ?? rawType;

  // ---- Energy color + cost from needEnergy icon, with generatedEnergy fallback ----
  const needAlt = normalize(
    $root.find("dl.needEnergyData .cardDataContents img").first().attr("alt") ??
      "",
  );
  const genAlt = normalize(
    $root
      .find("dl.generatedEnergyData .cardDataContents img")
      .first()
      .attr("alt") ?? "",
  );
  // alt like "黄3" or "青2" or "-". For AP / some Fields there's no img at all.
  function colorFromAlt(alt: string): string | null {
    const ch = alt.charAt(0);
    return JP_COLOR_TO_EN[ch] ?? null;
  }
  const color =
    colorFromAlt(needAlt) ?? colorFromAlt(genAlt) ?? "Unknown";
  const energy_cost = needAlt ? toInt(needAlt) : 0;

  // ---- AP cost + BP ----
  const ap_cost = toInt(
    $root.find("dl.apData .cardDataContents").first().text(),
  );
  const bp = toInt($root.find("dl.bpData .cardDataContents").first().text());

  // ---- Effect + trigger text ----
  // Both can contain <img alt="..."> icons (e.g. 登場時, ドロー) — preserve them
  // as bracketed labels so the text remains meaningful when rendered plain.
  function readEffectDD(selector: string): string | null {
    const $dd = $root.find(`${selector} .cardDataContents`).first().clone();
    if ($dd.length === 0) return null;
    // Replace icons with [<alt>]
    $dd.find("img").each((_i, el) => {
      const a = $(el).attr("alt") ?? "";
      $(el).replaceWith(a ? `[${a}]` : "");
    });
    // Preserve <br> as newlines via a sentinel (normalize() collapses \n).
    const SENTINEL = "__BR_SENTINEL__";
    $dd.find("br").replaceWith(SENTINEL);
    const text = normalize($dd.text()).replace(
      new RegExp(`\\s*${SENTINEL}\\s*`, "g"),
      "\n",
    );
    if (!text || text === "-") return null;
    return text;
  }
  const effect_text = readEffectDD("dl.effectData");
  const trigger_text = readEffectDD("dl.triggerData");

  // ---- Image ----
  const image_url = resolveImageUrl(
    $root.find(".cardDataImgCol img").first().attr("src"),
  );

  // ---- Canonical source URL (constructed; the page's share buttons agree) ----
  // encodeURIComponent encodes `/` → `%2F` and leaves `_` alone, which is what
  // we want — matches the format the share buttons emit.
  const source_url = `${BASE_URL}/jp/cardlist/detail.php?card_no=${encodeURIComponent(requestedCode)}`;

  return {
    code: requestedCode,
    name,
    name_reading: reading || null,
    series,
    color,
    rarity,
    card_type,
    energy_cost,
    ap_cost,
    bp,
    trigger_text,
    effect_text,
    image_url,
    source_url,
  };
}

/**
 * Build the DB primary-key id for a UA card. Matches the existing convention:
 * `jp-<code with `/` and `_` rewritten to `-`>`.
 *
 *   EX01BT/HTR-2-001        → jp-EX01BT-HTR-2-001
 *   EX01BT/HTR-1-030_p1     → jp-EX01BT-HTR-1-030-p1
 */
export function uaCardId(code: string): string {
  return `jp-${code.replace(/[/_]/g, "-")}`;
}

// Re-exported helpers (kept for tests).
export { normalize, ndOrNull, toInt, resolveImageUrl };

// Unused-now exports for completeness — domhandler type import keeps
// AnyNode referenced in case external consumers want strongly-typed callbacks.
export type { AnyNode };
