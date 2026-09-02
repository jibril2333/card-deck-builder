/**
 * The "put my missing cards in the shop's cart" script.
 *
 * A cart lives in the shopper's own browser session on the shop's domain, so
 * nothing here can be done from the server, and a page on this site cannot
 * call the shop's API either — it is same-origin only. What CAN work is a
 * snippet the reader runs on the shop's own page: their session, their click,
 * their cart.
 *
 * It adds. It never checks out — paying stays a thing a person does on
 * purpose, and the script has no business anywhere near it.
 */

export type CartItem = {
  /** Card code, only so the console log reads like a shopping list. */
  code: string;
  /** The shop's product id, from external_prices.item_code. */
  itemCode: string;
  quantity: number;
  /** Listing name and unit price, for the log and the final total. */
  name: string;
  priceYen: number;
};

/**
 * A snippet to paste into the console on pao-onlineshop.com.
 *
 * Built as plain text rather than a function turned into a string: what the
 * reader pastes is exactly what is written here, which matters for something
 * they are being asked to run.
 */
export function paoCartScript(items: CartItem[]): string {
  const list = items.map((i) => ({
    code: i.code,
    id: i.itemCode,
    n: i.quantity,
    name: i.name,
    price: i.priceYen,
  }));
  return `// 在 pao-onlineshop.com 的页面上运行:F12 → Console → 粘贴回车
// 只加入购物车,不结算、不付款。
(async () => {
  const items = ${JSON.stringify(list, null, 2)};
  let ok = 0, yen = 0;
  for (const it of items) {
    const r = await fetch("/api/cart/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "add",
        source: "#makeshop-common-cart-entry-url:" + it.id,
        element_index: 0,
        item_code: it.id,
        option_list: [],
        quantity: it.n,
        is_subscription: false,
        name_print: [],
      }),
    }).then((r) => r.json());
    if (r.result) { ok++; yen += it.price * it.n; }
    console.log(r.result ? "OK  " : "FAIL", it.code, "x" + it.n, it.name);
    await new Promise((done) => setTimeout(done, 400));
  }
  alert("加入购物车:" + ok + "/" + items.length + " 种,合计约 ¥" + yen);
})();
`;
}
