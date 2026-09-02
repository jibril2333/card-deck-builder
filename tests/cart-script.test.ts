import { describe, expect, it } from "vitest";
import { paoCartScript, type CartItem } from "@/lib/cart-script";

const items: CartItem[] = [
  { code: "BT1-084", itemCode: "000000078801", quantity: 2, name: "オメガモン", priceYen: 180 },
];

describe("paoCartScript", () => {
  it("carries the shop's product id and the quantity", () => {
    const s = paoCartScript(items);
    expect(s).toContain('"id": "000000078801"');
    expect(s).toContain('"n": 2');
    expect(s).toContain("/api/cart/");
  });

  it("adds to the cart and stops there", () => {
    const s = paoCartScript(items);
    expect(s).toContain('action: "add"');
    // No endpoint beyond the cart, and no action beyond adding: the comment
    // says it doesn't check out, and this is what holds it to that.
    const urls = [...s.matchAll(/fetch\("([^"]+)"/g)].map((m) => m[1]);
    expect(urls).toEqual(["/api/cart/"]);
    const actions = [...s.matchAll(/action: "(\w+)"/g)].map((m) => m[1]);
    expect(actions).toEqual(["add"]);
  });

  it("survives a name with quotes in it", () => {
    const s = paoCartScript([
      { ...items[0], name: '【プレイ用】"X" \\ ' + "</script>" },
    ]);
    expect(() => JSON.parse(s.slice(s.indexOf("["), s.indexOf("];") + 1))).not.toThrow();
  });
});
