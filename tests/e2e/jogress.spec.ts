/**
 * The 联展 badge on a deck card.
 *
 * The pairing logic is unit-tested (tests/jogress.test.ts) against the real
 * requirement strings. What only a browser can answer is whether the popover
 * is READABLE: it opens while the pointer is on the tile, so the hover preview
 * is up at the same time, and the badge lives inside a `z-20` wrapper — its
 * own stacking context, which no z-index on the popover can climb out of.
 * Hence the portal, and hence the test that the portal is still there.
 */
import { expect, test } from "@playwright/test";
import { JOGRESS_DECK } from "./fixtures/seed";

const DECK_URL = `/digimon/decks/${JOGRESS_DECK.id}`;
const badge = (p: import("@playwright/test").Page) =>
  p.getByRole("button", { name: "联展进化" });
const popover = (p: import("@playwright/test").Page) =>
  p.getByRole("dialog", { name: "联展组合" });

test("lists the pair this deck can DNA digivolve from", async ({ page }) => {
  await page.goto(DECK_URL);

  // Only the card that HAS a condition gets a badge — not its materials.
  await expect(badge(page)).toHaveCount(1);
  await expect(badge(page)).toHaveText("联展 1");

  await badge(page).click();
  const pop = popover(page);
  await expect(pop).toBeVisible();
  await expect(pop).toContainText("黄 Lv.6 ＋ 黑 Lv.6");
  await expect(pop).toContainText("费用0");
  await expect(pop).toContainText(JOGRESS_DECK.yellow);
  await expect(pop).toContainText(JOGRESS_DECK.black);
  // The green Lv.6 fits neither half: being the right level is not enough.
  await expect(pop).not.toContainText(JOGRESS_DECK.green);
});

test("the list escapes the tile's stacking context", async ({ page }) => {
  await page.goto(DECK_URL);
  await badge(page).click();
  await expect(popover(page)).toBeVisible();

  // Portalled to <body>. Rendered in place it can't out-paint the hover
  // preview, whatever z-index it asks for.
  const parent = await popover(page).evaluate((el) => el.parentElement?.tagName);
  expect(parent).toBe("BODY");
});

test("closes on Escape", async ({ page }) => {
  await page.goto(DECK_URL);
  await badge(page).click();
  await expect(popover(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(popover(page)).toHaveCount(0);
});
