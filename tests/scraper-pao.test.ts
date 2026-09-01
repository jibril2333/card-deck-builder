import { describe, expect, it } from "vitest";
import { parsePaoSearchPage } from "@/lib/scraper/pao";

/** Shaped like the real page, down to the fuzzy hit from another game. */
const unit = (name: string, price: string, stock = "残りあと2個") => `
  <li class="itemList__unit">
    <a href="/view/item/000000080270" class="itemWrap">
      <p class="itemName">${name}</p>
      <p class="itemPrice">${price}<small>(税込)</small></p>
      <p class="itemstock"><small>${stock}</small></p>
    </a>
  </li>`;

const page = (...units: string[]) =>
  `<ul class="itemList">${units.join("")}</ul>`;

/** A discounted listing: two prices, and the sale one is what you pay. */
const saleUnit = (name: string, regular: string, sale: string) => `
  <li class="itemList__unit">
    <p class="itemName">${name}</p>
    <div class="price-stock-wrap">
      <p class="itemPrice itemPrice--regular">通常価格：${regular}<small>(税込)</small></p>
      <p class="itemPrice itemPrice--sale">特価価格：${sale}<small>(税込)</small></p>
      <p class="itemPrice--saleRate">30%OFF</p>
      <p class="itemstock itemstock--under-sale"><small>残りあと4個</small></p>
    </div>
  </li>`;

describe("parsePaoSearchPage", () => {
  it("takes the sale price, not the struck-through one", () => {
    const s = parsePaoSearchPage(
      page(saleUnit("★新弾特価★ ゾンビプルートモン SR BT26-079", "200円", "140円")),
      "BT26-079",
    );
    expect(s.base_price).toBe(140);
  });

  it("reads price, printing and condition off the name", () => {
    const s = parsePaoSearchPage(
      page(
        unit("（傷あり）オメガモン SR BT1-084", "140円"),
        unit("【プレイ用】オメガモン SR BT1-084", "180円"),
        unit("オメガモン SR BT1-084", "1,480円"),
        unit("オメガモン（パラレル） ★SR BT1-084", "3,800円"),
      ),
      "BT1-084",
    );
    expect(s.total_listings).toBe(4);
    // The mint copy, not the 140円 damaged one.
    expect(s.base_price).toBe(1480);
    expect(s.parallel_price).toBe(3800);
    expect(s.listings.map((l) => l.condition)).toEqual([
      "damaged",
      "played",
      "good",
      "good",
    ]);
  });

  it("ignores what the shop's fuzzy search dragged in", () => {
    // Searching BT15-076 returns a card from another game whose number only
    // looks similar.
    const s = parsePaoSearchPage(
      page(
        unit("魔獄棘臣 ミルメス DZ-BT15/076 C", "30円"),
        unit("ヴァンデモンACE SR BT15-076", "180円"),
      ),
      "BT15-076",
    );
    expect(s.total_listings).toBe(1);
    expect(s.base_price).toBe(180);
  });

  it("falls back through the conditions, best first", () => {
    // BT1-084 at PAO today: a damaged copy at 140 and a played one at 180.
    // The played one is the answer — cheapest is not the same as best.
    const s = parsePaoSearchPage(
      page(
        unit("（傷あり）オメガモン SR BT1-084", "140円"),
        unit("【プレイ用】オメガモン SR BT1-084", "180円"),
      ),
      "BT1-084",
    );
    expect(s.base_price).toBe(180);

    const only = parsePaoSearchPage(
      page(unit("【プレイ用】ロープレモン C BT26-010", "10円")),
      "BT26-010",
    );
    expect(only.base_price).toBe(10);
    expect(only.base_in_stock).toBe(true);
  });

  it("keeps a sold-out listing as a price, not as an offer", () => {
    const s = parsePaoSearchPage(
      page(
        unit("オメガモン SR BT1-084", "1,480円", "売り切れ"),
        unit("オメガモン SR BT1-084", "1,600円"),
      ),
      "BT1-084",
    );
    expect(s.base_price).toBe(1600);
    expect(s.base_in_stock).toBe(true);
  });

  it("comes back empty when the shop has none", () => {
    const s = parsePaoSearchPage(page(unit("PiCKeR 1-Q DZ-BT16/092 C", "20円")), "BT16-092");
    expect(s.total_listings).toBe(0);
    expect(s.base_price).toBeNull();
  });
});
