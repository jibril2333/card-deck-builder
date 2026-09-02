/**
 * 卡组对比, from inside a deck.
 *
 * The comparison used to be a two-slot A/B panel on the decks list. It is now
 * a picker in the deck's own toolbar: the deck you are on is one side, you
 * choose the other, and `?compare=<id>` renders the diff on the server.
 */
import { expect, test, type Page } from "@playwright/test";

// [code, name] — the picker's rows are labelled by name, and waiting for the
// right label is what keeps a click off the previous query's results.
const SHARED = ["BT1-021", "MetalGreymon"] as const;
const ONLY_A = ["BT1-050", "Sky Fissure"] as const;
const ONLY_B = ["BT1-085", "Tai Kamiya"] as const;

async function makeDeck(
  page: Page,
  deckName: string,
  cards: [card: readonly [string, string], copies: number][],
) {
  await page.goto("/digimon/decks");
  await page.getByPlaceholder("卡组名").fill(deckName);
  await page.getByRole("button", { name: /创建/ }).click();
  await page.waitForURL(/\/digimon\/decks\/[a-z0-9-]+/i);
  const url = page.url();
  await page.getByRole("link", { name: /🛠 组建/ }).click();
  for (const [[code, name], copies] of cards) {
    await page.getByPlaceholder("搜卡加入卡组…").fill(code);
    const hit = page.getByLabel(`加入卡组 ${name}`);
    for (let i = 0; i < copies; i++) await hit.click();
    await expect(
      page.locator(".card-grid > div").filter({ hasText: code }),
    ).toBeVisible();
  }
  return url;
}

test("pick the other deck from the toolbar and see what differs", async ({
  page,
}) => {
  const stamp = Date.now();
  const other = `CMP B ${stamp}`;
  await makeDeck(page, other, [
    [SHARED, 1],
    [ONLY_B, 1],
  ]);
  const mineUrl = await makeDeck(page, `CMP A ${stamp}`, [
    [SHARED, 2],
    [ONLY_A, 1],
  ]);

  await page.goto(mineUrl);
  await page.getByRole("button", { name: /^🔀 对比/ }).click();
  await page.getByRole("menuitem", { name: other }).click();

  // The choice is in the URL, so a reload keeps the comparison.
  await page.waitForURL(/compare=/);
  await page.reload();

  const panel = page.getByRole("region", { name: "卡组对比" });
  const col = (title: string) => panel.getByRole("region", { name: title });

  await expect(col("本卡组独有").getByRole("link")).toHaveText([
    new RegExp(ONLY_A[1]),
  ]);
  await expect(col("对比卡组独有").getByRole("link")).toHaveText([
    new RegExp(ONLY_B[1]),
  ]);
  // Same card in both, two copies here against one there.
  await expect(col("数量不同").getByRole("link")).toHaveText([/2 → 1/]);

  // The button carries the deck being compared against, so the toolbar says
  // what state the page is in without opening the menu.
  await expect(page.getByRole("button", { name: /^🔀/ })).toContainText(other);

  // × ends it and leaves the deck where it was.
  await panel.getByRole("link", { name: "结束对比" }).click();
  await expect(page).not.toHaveURL(/compare=/);
  await expect(page.getByRole("region", { name: "卡组对比" })).toHaveCount(0);
});

test("comparing keeps the mode you were in", async ({ page }) => {
  const stamp = Date.now();
  const other = `CMP MODE ${stamp}`;
  await makeDeck(page, other, [[SHARED, 1]]);
  const mineUrl = await makeDeck(page, `CMP MINE ${stamp}`, [[SHARED, 2]]);

  await page.goto(`${mineUrl}?mode=purchase`);
  await page.getByRole("button", { name: /^🔀 对比/ }).click();
  await page.getByRole("menuitem", { name: other }).click();
  await page.waitForURL(/compare=/);
  await expect(page).toHaveURL(/mode=purchase/);
  await expect(page.getByRole("region", { name: "卡组对比" })).toBeVisible();
});
