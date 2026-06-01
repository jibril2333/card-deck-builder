/**
 * Pure parsers for the Cardrush product-list page (cardrush-digimon.jp /
 * future siblings). Synchronous, no I/O, no DB — feed it the HTML and the
 * card code you were searching for, get back a price summary.
 *
 * Cardrush layout cheatsheet:
 *   - One `<li class="item_listed_block">` (or similar) per listing.
 *   - Inside each listing:
 *       <span class="goods_name">〔状態X〕(...) NAME 【RARITY】{CODE}《COLOR》</span>
 *       <span class="figure">XX,XXX円</span>
 *       <p class="stock">在庫数 N枚</p>           ← in stock
 *         OR
 *       <p class="stock soldout">在庫なし</p>     ← sold out
 *
 *   - "パラレル" anywhere in `goods_name` → alt-art / parallel printing.
 *     Cardrush doesn't expose _P1 / _P2 numbering; everything that's not the
 *     base printing is just labelled パラレル. So we collapse all of those
 *     into a single `variant_type: "parallel"` bucket.
 *
 *   - Condition grades appear in 〔状態X〕 at the start of the name:
 *       S / A+ / A / A-  → mint-ish
 *       B / C / 傷あり    → played / damaged
 *     For the "market price" headline we filter to S/A+/A/A-/A− (the mint
 *     band), since damaged copies skew way low and don't reflect what a
 *     buyer of a fresh deck would actually pay. Cards with no 〔状態X〕
 *     bracket (older listings) count as good condition.
 */

import * as cheerio from "cheerio";

export type CardrushListing = {
  /** Raw goods_name text, trimmed. */
  goods_name: string;
  /** "base" or "parallel". */
  variant_type: "base" | "parallel";
  /** Condition grade, e.g. "A-" / "B" / "傷あり". `null` if no 〔…〕 prefix. */
  condition: string | null;
  /** Illustrator credit, extracted from `(illust:NAME)` in goods_name. */
  illustrator: string | null;
  /** Price in yen, with commas and 円 stripped. */
  price_yen: number;
  in_stock: boolean;
};

/**
 * Cheapest mint-band price for a given (variant_type, illustrator) pair.
 * One entry per unique illustration the card has. Used to populate the
 * detail-page listing table.
 */
export type CardrushPricePerIllust = {
  variant_type: "base" | "parallel";
  illustrator: string;
  price_yen: number;
  in_stock: boolean;
};

export type CardrushPriceSummary = {
  /** The code you searched for (echoed back for traceability). */
  searched_code: string;
  /** Total listings parsed (any condition, any stock). */
  total_listings: number;
  /** Cheapest in-stock mint-band base printing. null if none in stock. */
  base_price: number | null;
  base_in_stock: boolean;
  /** Cheapest in-stock mint-band parallel. null if none in stock. */
  parallel_price: number | null;
  parallel_in_stock: boolean;
  /** Per-illustrator cheapest mint-band prices. Use this for the
   *  detail-page table when you want to see each illustration separately. */
  per_illust: CardrushPricePerIllust[];
  /** All listings parsed — useful for debugging / unit tests. */
  listings: CardrushListing[];
};

/**
 * Conditions we consider "good enough to represent market price".
 * Cardrush condition grades (in descending quality): S, A+, A, A-, B, C, 傷あり.
 * 〔状態A-〕 cards sometimes have a unicode minus (−) instead of ASCII (-);
 * we accept both. No prefix at all also counts as a mint-band listing.
 */
const MINT_CONDITIONS = new Set([null, "S", "A+", "A", "A-", "A−"]);

function parsePriceYen(raw: string): number | null {
  const m = raw.replace(/,/g, "").match(/(\d+)\s*円/);
  return m ? parseInt(m[1], 10) : null;
}

function extractCondition(goodsName: string): string | null {
  // Match 〔状態X〕 or 〔状態X-〕, where X is letter + optional grade suffix.
  // The 〔 and 〕 are full-width brackets. The grade text after 状態 stops at
  // 〕.
  const m = goodsName.match(/〔状態([^〕]+)〕/);
  return m ? m[1].trim() : null;
}

function isParallel(goodsName: string): boolean {
  return goodsName.includes("パラレル");
}

/**
 * Pull the illustrator name out of `(illust:NAME)` or `(パラレル/illust:NAME)`.
 * Returns null if no illust credit is present.
 */
function extractIllustrator(goodsName: string): string | null {
  const m = goodsName.match(/illust:([^)/]+)/);
  return m ? m[1].trim() : null;
}

/**
 * Parse one Cardrush search results page. `searchedCode` is the code we asked
 * about (e.g. "BT1-084"); we keep listings whose goods_name explicitly
 * contains `{searchedCode}` to ignore unrelated matches the search may return.
 */
export function parseCardrushSearchPage(
  html: string,
  searchedCode: string,
): CardrushPriceSummary {
  const $ = cheerio.load(html);
  const listings: CardrushListing[] = [];

  // The goods_name spans live inside per-listing containers. The container
  // class differs across Cardrush layouts ("item_block", "item_listed_block",
  // etc.) — instead of betting on a stable wrapper, we walk every
  // .goods_name and look for the matching .figure + .stock among its
  // ancestors / siblings.
  $(".goods_name").each((_i, el) => {
    const $name = $(el);
    const goodsName = $name.text().replace(/\s+/g, " ").trim();
    if (!goodsName.includes(`{${searchedCode}}`)) return;

    // Walk up looking for the smallest ancestor that also contains a .figure
    // and .stock. Capped at ~6 hops to avoid escaping the listing.
    let scope: cheerio.Cheerio<typeof el> | null = null;
    let cur: cheerio.Cheerio<typeof el> = $name;
    for (let i = 0; i < 6; i++) {
      cur = cur.parent() as cheerio.Cheerio<typeof el>;
      if (cur.length === 0) break;
      if (cur.find(".figure").length > 0 && cur.find(".stock").length > 0) {
        scope = cur;
        break;
      }
    }
    if (!scope) return;

    const priceText = scope.find(".figure").first().text();
    const price = parsePriceYen(priceText);
    if (price == null) return;

    const stockText = scope.find(".stock").first();
    const inStock = !stockText.hasClass("soldout") &&
      !stockText.text().includes("在庫なし");

    listings.push({
      goods_name: goodsName,
      variant_type: isParallel(goodsName) ? "parallel" : "base",
      condition: extractCondition(goodsName),
      illustrator: extractIllustrator(goodsName),
      price_yen: price,
      in_stock: inStock,
    });
  });

  function pick(
    variant: "base" | "parallel",
  ): { price: number | null; in_stock: boolean } {
    const here = listings.filter((l) => l.variant_type === variant);
    const mint = here.filter((l) => MINT_CONDITIONS.has(l.condition));
    const inStockMint = mint.filter((l) => l.in_stock);
    if (inStockMint.length > 0) {
      return {
        price: Math.min(...inStockMint.map((l) => l.price_yen)),
        in_stock: true,
      };
    }
    // Fallback: cheapest mint-band (sold out) so we still record SOMETHING.
    if (mint.length > 0) {
      return {
        price: Math.min(...mint.map((l) => l.price_yen)),
        in_stock: false,
      };
    }
    return { price: null, in_stock: false };
  }

  const base = pick("base");
  const parallel = pick("parallel");

  // Per-illustrator buckets within each variant_type. Same mint-band filter
  // as `pick` but grouped finer so the detail page can show each printing.
  // Missing illust credit is grouped under "(unknown)".
  const perIllustMap = new Map<string, CardrushPricePerIllust>();
  for (const l of listings) {
    if (!MINT_CONDITIONS.has(l.condition)) continue;
    const illust = l.illustrator ?? "(unknown)";
    const key = `${l.variant_type}|${illust}`;
    const prior = perIllustMap.get(key);
    // Prefer in-stock over sold-out; within the same stock state, take min.
    if (
      !prior ||
      (l.in_stock && !prior.in_stock) ||
      (l.in_stock === prior.in_stock && l.price_yen < prior.price_yen)
    ) {
      perIllustMap.set(key, {
        variant_type: l.variant_type,
        illustrator: illust,
        price_yen: l.price_yen,
        in_stock: l.in_stock,
      });
    }
  }
  const per_illust = [...perIllustMap.values()].sort((a, b) => {
    // base before parallel, then cheapest first
    if (a.variant_type !== b.variant_type) {
      return a.variant_type === "base" ? -1 : 1;
    }
    return a.price_yen - b.price_yen;
  });

  return {
    searched_code: searchedCode,
    total_listings: listings.length,
    base_price: base.price,
    base_in_stock: base.in_stock,
    parallel_price: parallel.price,
    parallel_in_stock: parallel.in_stock,
    per_illust,
    listings,
  };
}
