/**
 * The deck page's own count of what is in the deck.
 *
 * `主卡组 x / 50 · 蛋卡 y / 5` is the line the whole page is arranged around —
 * the target that turns red, the number the info bar repeats — and nothing
 * asserted it. It is also where two halves of one sentence can come from
 * different reads: eggs are counted by card type over the deck's rows, and
 * mains are that count subtracted from the total.
 */
import { expect, test, type Page } from "@playwright/test";

const EGG = ["BT1-005", "Kyaromon"] as const;
const MAIN = ["BT1-021", "MetalGreymon"] as const;

/** The counts line, not the info bar's shorter echo of it. */
const counts = (page: Page) =>
  page.getByText(/主卡组 \d+ \/ 50 · 蛋卡 \d+ \/ 5/);

/** Add one copy, then wait for the line to say so — one click, one number. */
async function addOne(
  page: Page,
  [code, name]: readonly [string, string],
  main: number,
  egg: number,
) {
  await page.getByPlaceholder("搜卡加入卡组…").fill(code);
  await page.getByLabel(`加入卡组 ${name}`).click();
  await expect(counts(page)).toContainText(`主卡组 ${main} / 50`);
  await expect(counts(page)).toContainText(`蛋卡 ${egg} / 5`);
}

test("splits the deck into main and egg, and keeps the two agreeing", async ({
  page,
}) => {
  await page.goto("/digimon/decks");
  await page.getByPlaceholder("卡组名").fill(`CNT ${Date.now()}`);
  await page.getByRole("button", { name: /创建/ }).click();
  await page.waitForURL(/\/digimon\/decks\/[a-z0-9-]+/i);
  await page.getByRole("link", { name: /🛠 组建/ }).click();

  // Eggs are not part of the 50, which is the whole reason they are counted
  // apart.
  await addOne(page, MAIN, 1, 0);
  await addOne(page, MAIN, 2, 0);
  await addOne(page, EGG, 2, 1);
  await addOne(page, EGG, 2, 2);
  // One more of each moves one half and leaves the other alone.
  await addOne(page, MAIN, 3, 2);
  await addOne(page, EGG, 3, 3);

  // The same numbers survive a reload — they are computed on the server, from
  // the deck's rows, not accumulated in the page.
  await page.reload();
  await expect(counts(page)).toContainText("主卡组 3 / 50");
  await expect(counts(page)).toContainText("蛋卡 3 / 5");
});
