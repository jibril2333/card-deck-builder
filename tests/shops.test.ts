import { describe, expect, it } from "vitest";
import { shopSearchUrl } from "@/lib/shops";

describe("shopSearchUrl", () => {
  it("points at the page the price was read from", () => {
    expect(shopSearchUrl("cardrush", "BT1-084")).toBe(
      "https://www.cardrush-digimon.jp/product-list?keyword=BT1-084",
    );
    // The category is not optional: without it PAO returns other games.
    expect(shopSearchUrl("pao", "BT15-076")).toBe(
      "https://pao-onlineshop.com/view/search?search_keyword=BT15-076&search_category=DC",
    );
  });

  it("escapes a code with a slash in it", () => {
    expect(shopSearchUrl("pao", "P-001/A")).toContain("P-001%2FA");
  });
});
