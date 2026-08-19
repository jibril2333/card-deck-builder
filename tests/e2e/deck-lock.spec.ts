/**
 * Locking a deck.
 *
 * The enforcement lives in the repository (tests/deck-lock.test.ts drives that
 * directly, with no browser). What's checked here is the part a person meets:
 * the editing affordances go away, the card page won't offer the deck, and the
 * lock is a door — everything comes back when you open it.
 */
import { expect, test } from "@playwright/test";

const lockButton = (p: import("@playwright/test").Page) =>
  p.getByRole("button", { name: /锁定/ });

test("closes the deck to edits, everywhere, until you unlock it", async ({
  page,
}) => {
  const name = `E2E Lock ${Date.now()}`;
  await page.goto("/digimon/decks");
  await page.getByPlaceholder("卡组名").fill(name);
  await page.getByRole("button", { name: /创建/ }).click();
  await page.waitForURL(/\/digimon\/decks\/[a-z0-9-]+/i);
  const deckUrl = page.url();

  // Put a card in it from the card page, which is also the path that must
  // stop working once it's locked.
  await page.goto("/digimon/card/BT1-084");
  // The list collapses once the account has a few decks, and a brand-new deck
  // holding nothing is exactly what gets hidden.
  const expand = page.getByRole("button", { name: /展开/ });
  if (await expand.count()) await expand.click();
  // Scoped to THIS deck's row. Row order is by updated_at and the seeded decks
  // tie with it to the second, so "the first ＋" adds to somebody else's deck —
  // which is how this test spent its first run quietly editing the fixture out
  // from under another spec. Located by title, not by role name: the button's
  // text is "＋", so that is its accessible name.
  const rowFor = (p: import("@playwright/test").Page) =>
    p.getByRole("group", { name });
  await rowFor(page).getByTitle("+1").click();
  await expect(rowFor(page)).toContainText("已有 1 张");

  await page.goto(deckUrl);
  await expect(page.getByRole("link", { name: /组建/ })).toBeVisible();
  await lockButton(page).click();
  await expect(page.getByRole("button", { name: "🔒 已锁定" })).toBeVisible();

  // Every way in is gone: the build tab, the delete button, the inline title.
  await expect(page.getByRole("link", { name: /组建/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /删除/ })).toHaveCount(0);
  // …and asking for build mode by URL doesn't get you it either.
  await page.goto(`${deckUrl}?mode=build`);
  await expect(page.getByRole("button", { name: "🔒 已锁定" })).toBeVisible();
  await expect(page.locator('input[type="number"]')).toHaveCount(0);

  // The card page lists it, says why, and offers no controls.
  await page.goto("/digimon/card/BT1-084");
  const expand2 = page.getByRole("button", { name: /展开/ });
  if (await expand2.count()) await expand2.click();
  const locked = rowFor(page);
  await expect(locked).toContainText("🔒 已锁定");
  // …and that row has no way to change anything.
  await expect(locked.getByTitle("+1")).toHaveCount(0);
  await expect(locked.getByTitle("−1")).toHaveCount(0);
  // Other decks are unaffected — the lock is per deck, not a global mode.
  await expect(page.getByLabel("添加到卡组").getByTitle("+1").first()).toBeVisible();

  // Unlock from the deck page and the controls come back.
  await page.goto(deckUrl);
  await page.getByRole("button", { name: "🔒 已锁定" }).click();
  await expect(page.getByRole("button", { name: "🔓 锁定" })).toBeVisible();
  await expect(page.getByRole("link", { name: /组建/ })).toBeVisible();
});
