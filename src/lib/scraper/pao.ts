/**
 * Pure parser for PAO's search page (pao-onlineshop.com), a second price
 * source beside Cardrush.
 *
 * Layout, per result:
 *   <li class="itemList__unit">
 *     <p class="itemName">（傷あり）オメガモン SR BT1-084</p>
 *     <p class="itemPrice">140円<small>(税込)</small></p>
 *     <p class="itemstock"><small>残りあと2個</small></p>
 *
 * Two things the name carries and nothing else does:
 *   · condition — 【プレイ用】 played, （傷あり）damaged, unmarked mint;
 *   · printing — （パラレル） is the alt art, everything else the base.
 *
 * Search inside the Digimon category (`search_category=DC`) or the shop's
 * fuzzy matching hands back other games — BT15-076 also returns
 * "DZ-BT15/076". The code check below is the backstop for whatever the
 * category filter still lets through.
 *
 * A discounted item carries two prices, `通常価格` in `.itemPrice--regular`
 * and `特価価格` in `.itemPrice--sale`. The sale one is what you pay.
 */

import * as cheerio from "cheerio";

export type PaoCondition = "good" | "played" | "damaged";

export type PaoListing = {
  name: string;
  price_yen: number;
  in_stock: boolean;
  variant_type: "base" | "parallel";
  condition: PaoCondition;
};

export type PaoSummary = {
  searched_code: string;
  total_listings: number;
  /** Cheapest mint-band copy of each printing, and whether it is in stock. */
  base_price: number | null;
  base_in_stock: boolean | null;
  parallel_price: number | null;
  parallel_in_stock: boolean | null;
  listings: PaoListing[];
};

function conditionOf(name: string): PaoCondition {
  if (name.includes("傷あり") || name.includes("キズあり")) return "damaged";
  if (name.includes("プレイ用")) return "played";
  return "good";
}

export function parsePaoSearchPage(html: string, code: string): PaoSummary {
  const $ = cheerio.load(html);
  const listings: PaoListing[] = [];

  $(".itemList__unit").each((_i, el) => {
    const unit = $(el);
    const name = unit.find(".itemName").first().text().trim();
    if (!name || !name.includes(code)) return;

    const sale = unit.find(".itemPrice--sale").first();
    const priceText = (
      sale.length > 0 ? sale : unit.find(".itemPrice").first()
    ).text();
    const digits = priceText.replace(/[^\d]/g, "");
    if (!digits) return;
    const price_yen = Number(digits);
    if (!Number.isFinite(price_yen) || price_yen <= 0) return;

    const stockText = unit.text();
    const in_stock = !/売り切れ|在庫なし|SOLD\s*OUT/i.test(stockText);

    listings.push({
      name,
      price_yen,
      in_stock,
      variant_type: name.includes("パラレル") ? "parallel" : "base",
      condition: conditionOf(name),
    });
  });

  /**
   * Cheapest of one printing, best condition first: an unmarked copy if the
   * shop has one, otherwise a played one, and only then a damaged one. A
   * 傷あり copy at 140円 is not the price of a card you would sleeve up, but
   * it is the only number there is when nothing else is listed.
   */
  const pick = (variant: "base" | "parallel") => {
    const mine = listings.filter((l) => l.variant_type === variant);
    const tiers: PaoCondition[] = ["good", "played", "damaged"];
    const pool =
      tiers
        .map((c) => mine.filter((l) => l.condition === c))
        .find((tier) => tier.length > 0) ?? [];
    if (pool.length === 0) return { price: null, in_stock: null };
    const sorted = [...pool].sort((a, b) => {
      // In stock first, then cheapest: a sold-out listing is a record of a
      // price, not an offer.
      if (a.in_stock !== b.in_stock) return a.in_stock ? -1 : 1;
      return a.price_yen - b.price_yen;
    });
    return { price: sorted[0].price_yen, in_stock: sorted[0].in_stock };
  };

  const base = pick("base");
  const parallel = pick("parallel");

  return {
    searched_code: code,
    total_listings: listings.length,
    base_price: base.price,
    base_in_stock: base.in_stock,
    parallel_price: parallel.price,
    parallel_in_stock: parallel.in_stock,
    listings,
  };
}
