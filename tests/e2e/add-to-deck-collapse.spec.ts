/**
 * The card page's "添加到卡组" widget collapses once you have more decks than
 * fit beside the card art.
 *
 * With 48 decks the list was ~2000px of rows in a 300px column. Collapsed it
 * keeps the decks that already hold the card — that's the question the widget
 * is opened to answer — and folds the rest behind a toggle.
 *
 * The threshold itself is unit-tested (tests/collapse-decks.test.ts): these
 * specs share one fixture account, so by the time a "few decks" case could run
 * the earlier specs have already created plenty.
 */
import { expect, test, type Page } from "@playwright/test";

const CARD = "/digimon/card/BT1-084"; // Omnimon
const TOGGLE = /展开(全部|其余) \d+ 个卡组|收起/;

const widget = (page: Page) => page.getByRole("region", { name: "添加到卡组" });
/** Deck rows currently rendered in the widget. */
const rows = (page: Page) => widget(page).locator("div.divide-y > div");

async function makeDecks(page: Page, prefix: string, n: number) {
  await page.goto("/digimon/decks");
  for (let i = 0; i < n; i++) {
    await page.getByPlaceholder("卡组名").fill(`${prefix}-${i}`);
    await page.getByRole("button", { name: /创建/ }).click();
    await page.waitForURL(/\/digimon\/decks\/[a-z0-9-]+/i);
    await page.goto("/digimon/decks");
  }
}

test("collapses past a handful of decks, and remembers the choice", async ({
  page,
}) => {
  const prefix = `COL${Date.now()}`;
  await makeDecks(page, prefix, 7);

  await page.goto(CARD);
  const toggle = page.getByRole("button", { name: TOGGLE });
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  // Collapsed: no deck holds this card yet, so the list is empty and the
  // toggle offers all of them.
  await expect(toggle).toHaveText(/展开全部 \d+ 个卡组/);
  const collapsedCount = await rows(page).count();

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(toggle).toHaveText(/收起/);
  const expandedCount = await rows(page).count();
  expect(expandedCount).toBeGreaterThan(collapsedCount);
  expect(expandedCount).toBeGreaterThanOrEqual(7);

  // The choice survives moving to another card — deck-building means opening
  // card after card, and re-expanding each time is worse than the scrolling
  // this replaced.
  await page.goto("/digimon/card/BT1-001");
  await expect(page.getByRole("button", { name: TOGGLE })).toHaveAttribute(
    "aria-expanded",
    "true",
  );

  await page.getByRole("button", { name: TOGGLE }).click();
  await page.goto(CARD);
  await expect(page.getByRole("button", { name: TOGGLE })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});

test("a deck already holding the card stays visible while collapsed", async ({
  page,
}) => {
  const prefix = `HOLD${Date.now()}`;
  await makeDecks(page, prefix, 7);

  // Put the card into the most recently created deck.
  await page.goto(CARD);
  const toggle = page.getByRole("button", { name: TOGGLE });
  if ((await toggle.getAttribute("aria-expanded")) === "false") {
    await toggle.click();
  }
  const target = rows(page).filter({ hasText: `${prefix}-6` });
  await target.getByTitle("+1").click();
  await expect(target.getByText(/已有 1 张/)).toBeVisible();

  // Collapse: that deck must survive the fold, and the toggle now says
  // "其余" rather than "全部".
  await page.getByRole("button", { name: TOGGLE }).click();
  await expect(page.getByRole("button", { name: TOGGLE })).toHaveText(
    /展开其余 \d+ 个卡组/,
  );
  await expect(rows(page).filter({ hasText: `${prefix}-6` })).toBeVisible();
  // …and it is the ONLY row left.
  await expect(rows(page)).toHaveCount(1);
});
