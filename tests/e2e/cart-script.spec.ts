/**
 * The cart script the purchase view hands over.
 *
 * A cart lives in a session on the shop's own domain, so this page can only
 * give the reader something to run there. What has to hold is that it names
 * the right products in the right quantities, and that it adds and nothing
 * else.
 */
import { expect, test } from "@playwright/test";

test("copies a script for the cards still missing", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/digimon/decks");
  await page.getByPlaceholder("卡组名").fill("CART " + Date.now());
  await page.getByRole("button", { name: /创建/ }).click();
  await page.waitForURL(/\/digimon\/decks\/[a-z0-9-]+/i);
  const deckUrl = page.url();

  // BT1-084 is the fixture's PAO-stocked card (item 000000078801, ¥180).
  await page.getByRole("link", { name: /🛠 组建/ }).click();
  await page.getByPlaceholder("搜卡加入卡组…").fill("BT1-084");
  for (let i = 0; i < 3; i++) {
    await page.getByLabel(/^加入卡组 /).first().click();
    await page.waitForTimeout(250);
  }

  // BT1-005 too: PAO ¥500 while Cardrush asks ¥100. The tile shows the
  // cheaper one, but the cart is PAO's — dropping the card because another
  // shop is cheaper would leave you unable to buy it here at all.
  await page.getByPlaceholder("搜卡加入卡组…").fill("BT1-005");
  // Wait for the list to be showing THIS card: the previous search's rows are
  // still on screen for a moment, and clicking blind adds the wrong one.
  await expect(page.getByLabel(/^加入卡组 /)).toHaveCount(1);
  await expect(page.getByText("BT1-005")).toBeVisible();
  await page.getByLabel(/^加入卡组 /).first().click();
  await page.waitForTimeout(400);

  await page.goto(`${deckUrl}?mode=purchase`);
  const btn = page.getByRole("button", { name: /复制 PAO 加购脚本/ });
  await expect(btn).toBeVisible();
  await expect(btn).toContainText("4 张");
  // 3 × ¥180 + 1 × ¥500, at PAO's prices — not the ¥100 Cardrush wants.
  await expect(btn).toContainText("¥1,040");

  await btn.click();
  await expect(page.getByText(/已复制/)).toBeVisible();
  const script = await page.evaluate(() => navigator.clipboard.readText());
  expect(script).toContain('"id": "000000078801"');
  expect(script).toContain('"n": 3');
  expect(script).toContain('"id": "000000012345"');
  expect(script).toContain('"price": 500');
  expect(script).toContain('action: "add"');
  // Adding only. Checkout is a thing a person does, not a script.
  expect(script).not.toContain("/view/cart/order");
});
