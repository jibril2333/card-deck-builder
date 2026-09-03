/**
 * The Cardrush price parser.
 *
 * One of the two shops the deck prices come from, and the one with almost no
 * coverage: the kana reading it also pulls off this page had a test, the
 * prices did not. That is backwards — a price is what the deck totals and the
 * cart script are built on, and this parser is exactly the kind of code that
 * fails without failing: the shop changes a class name, every card comes back
 * with no listings, and the run still exits 0. (`lib/scrape-health.ts` is the
 * alarm for that; this is the part that says what "working" means.)
 *
 * The HTML is shaped like the real page — separate spans for name, price and
 * stock, wrapped in a per-listing container the parser has to find by walking
 * up rather than by class name, because Cardrush's wrapper class has changed
 * more than once.
 */
import { describe, expect, it } from "vitest";
import { parseCardrushSearchPage } from "@/lib/scraper/cardrush";

const listing = (
  name: string,
  yen: string,
  stock: "in" | "out" = "in",
) => `
  <li class="item_listed_block">
    <div class="item_inner">
      <span class="goods_name">${name}</span>
      <span class="figure">${yen}円</span>
      ${
        stock === "in"
          ? '<p class="stock">在庫数 3枚</p>'
          : '<p class="stock soldout">在庫なし</p>'
      }
    </div>
  </li>`;

const page = (...items: string[]) => `<ul class="item_list">${items.join("")}</ul>`;

describe("which listings count", () => {
  it("keeps only the code that was searched for", () => {
    // The shop's search is fuzzy: asking for BT1-084 also returns BT1-0840
    // and whatever else shares a prefix. The braces are the exact marker.
    const html = page(
      listing("オメガモン 【SR】{BT1-084}《白》", "1,200"),
      listing("オメガモンACE 【SR】{BT16-084}《白》", "300"),
    );
    const r = parseCardrushSearchPage(html, "BT1-084");
    expect(r.total_listings).toBe(1);
    expect(r.base_price).toBe(1200);
  });

  it("ignores a listing with no price", () => {
    const html = page(
      listing("オメガモン 【SR】{BT1-084}", "1,200"),
      `<li><div><span class="goods_name">オメガモン 【SR】{BT1-084}</span>
        <span class="figure">お問い合わせください</span>
        <p class="stock">在庫数 1枚</p></div></li>`,
    );
    expect(parseCardrushSearchPage(html, "BT1-084").total_listings).toBe(1);
  });

  it("reads nothing out of a page that lost its structure", () => {
    // What a redesign looks like from here: the names are there, the price
    // and stock spans are not. Zero listings, not a crash and not a price.
    const html = `<li><span class="goods_name">オメガモン 【SR】{BT1-084}</span>
      <span class="price">1,200円</span></li>`;
    const r = parseCardrushSearchPage(html, "BT1-084");
    expect(r.total_listings).toBe(0);
    expect(r.base_price).toBeNull();
  });
});

describe("condition band", () => {
  it("prices off the mint band, not the damaged copies", () => {
    // A 傷あり copy at a fifth of the price is not what someone buying a deck
    // pays, and letting it set the headline made whole decks look cheap.
    const html = page(
      listing("〔状態傷あり〕オメガモン 【SR】{BT1-084}", "200"),
      listing("〔状態B〕オメガモン 【SR】{BT1-084}", "600"),
      listing("〔状態A-〕オメガモン 【SR】{BT1-084}", "1,000"),
      listing("〔状態S〕オメガモン 【SR】{BT1-084}", "1,500"),
    );
    const r = parseCardrushSearchPage(html, "BT1-084");
    expect(r.total_listings).toBe(4);
    expect(r.base_price).toBe(1000);
  });

  it("accepts the unicode minus the shop sometimes writes", () => {
    // 状態A− (U+2212) and 状態A- (ASCII) are the same grade.
    const html = page(listing("〔状態A−〕オメガモン 【SR】{BT1-084}", "900"));
    expect(parseCardrushSearchPage(html, "BT1-084").base_price).toBe(900);
  });

  it("treats an ungraded listing as mint", () => {
    // Older listings carry no 〔状態…〕 bracket at all.
    const html = page(listing("オメガモン 【SR】{BT1-084}", "800"));
    expect(parseCardrushSearchPage(html, "BT1-084").base_price).toBe(800);
  });
});

describe("stock", () => {
  it("prefers the cheapest one you can actually buy", () => {
    const html = page(
      listing("〔状態A〕オメガモン 【SR】{BT1-084}", "700", "out"),
      listing("〔状態A〕オメガモン 【SR】{BT1-084}", "1,100"),
    );
    const r = parseCardrushSearchPage(html, "BT1-084");
    expect([r.base_price, r.base_in_stock]).toEqual([1100, true]);
  });

  it("falls back to a sold-out price rather than recording nothing", () => {
    // A price nobody can fill is still what the card is worth; the flag is
    // what the UI greys out.
    const html = page(
      listing("〔状態A〕オメガモン 【SR】{BT1-084}", "700", "out"),
    );
    const r = parseCardrushSearchPage(html, "BT1-084");
    expect([r.base_price, r.base_in_stock]).toEqual([700, false]);
  });

  it("reads 在庫なし without the soldout class", () => {
    const html = `<li><div>
      <span class="goods_name">オメガモン 【SR】{BT1-084}</span>
      <span class="figure">700円</span>
      <p class="stock">在庫なし</p></div></li>`;
    expect(parseCardrushSearchPage(html, "BT1-084").base_in_stock).toBe(false);
  });
});

describe("parallels", () => {
  it("keeps the alt art out of the base price", () => {
    // Cardrush doesn't number its parallels, so everything that says パラレル
    // collapses into one bucket — but it must never set the base price: the
    // deck asks for the printing you can buy for 1,200, not 9,800.
    const html = page(
      listing("オメガモン 【SR】{BT1-084}", "1,200"),
      listing("オメガモン(パラレル) 【SR】{BT1-084}", "9,800"),
    );
    const r = parseCardrushSearchPage(html, "BT1-084");
    expect(r.base_price).toBe(1200);
    expect(r.parallel_price).toBe(9800);
  });

  it("has no parallel price when the shop lists none", () => {
    const html = page(listing("オメガモン 【SR】{BT1-084}", "1,200"));
    const r = parseCardrushSearchPage(html, "BT1-084");
    expect([r.parallel_price, r.parallel_in_stock]).toEqual([null, false]);
  });
});

describe("per illustration", () => {
  it("gives each illustrator its own cheapest mint price", () => {
    const html = page(
      listing("オメガモン(illust:Aさん) 【SR】{BT1-084}", "1,200"),
      listing("オメガモン(illust:Aさん) 【SR】{BT1-084}", "1,500"),
      listing("オメガモン(illust:Bさん) 【SR】{BT1-084}", "2,000"),
      listing("オメガモン(パラレル/illust:Cさん) 【SR】{BT1-084}", "9,000"),
    );
    const r = parseCardrushSearchPage(html, "BT1-084");
    expect(
      r.per_illust.map((p) => [p.variant_type, p.illustrator, p.price_yen]),
    ).toEqual([
      ["base", "Aさん", 1200],
      ["base", "Bさん", 2000],
      ["parallel", "Cさん", 9000],
    ]);
  });

  it("prefers an in-stock listing over a cheaper sold-out one", () => {
    const html = page(
      listing("オメガモン(illust:Aさん) 【SR】{BT1-084}", "800", "out"),
      listing("オメガモン(illust:Aさん) 【SR】{BT1-084}", "1,500"),
    );
    const r = parseCardrushSearchPage(html, "BT1-084");
    expect(r.per_illust).toEqual([
      expect.objectContaining({ price_yen: 1500, in_stock: true }),
    ]);
  });

  it("groups the uncredited listings together", () => {
    const html = page(listing("オメガモン 【SR】{BT1-084}", "1,200"));
    expect(parseCardrushSearchPage(html, "BT1-084").per_illust).toEqual([
      expect.objectContaining({ illustrator: "(unknown)" }),
    ]);
  });
});

describe("prices as written", () => {
  it("strips the comma and the 円", () => {
    const html = page(listing("オメガモン 【SR】{BT1-084}", "12,800"));
    expect(parseCardrushSearchPage(html, "BT1-084").base_price).toBe(12800);
  });
});
