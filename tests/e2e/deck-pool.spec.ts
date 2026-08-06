/**
 * The shared-pool picker on a deck's own page.
 *
 * Membership used to be editable only from a group, so pooling the deck you
 * were looking at meant knowing which group to open first. This drives the
 * deck side: create a pool from the deck, confirm it sticks across a reload,
 * toggle back off, and confirm someone else's deck never offers the control.
 *
 * Runs against the seeded e2e DB with the pre-authenticated session from
 * global-setup, so these are real Server Actions writing real rows.
 */

import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

/** Make a deck and return its detail URL. */
async function createDeck(page: import("@playwright/test").Page, name: string) {
  await page.goto("/digimon/decks");
  await page.getByPlaceholder("卡组名").fill(name);
  await page.getByRole("button", { name: /创建/ }).click();
  await page.waitForURL(/\/digimon\/decks\/[a-z0-9-]+/i);
  return page.url();
}

test("pool a deck from its own page, and unpool it again", async ({ page }) => {
  const stamp = Date.now();
  const deckUrl = await createDeck(page, `E2E Pool Deck ${stamp}`);
  const poolName = `E2E 池 ${stamp}`;

  // The panel is there before any pool exists — otherwise the first pool
  // could only ever be made from the decks list.
  await expect(page.getByRole("heading", { name: /共享卡池/ })).toBeVisible();

  // Creating from here seeds the pool with this deck and lands on it.
  await page.getByRole("button", { name: /新建卡池/ }).click();
  await page.getByPlaceholder("卡池名称").fill(poolName);
  await page.getByRole("button", { name: "建", exact: true }).click();
  await page.waitForURL(/\/digimon\/groups\/[a-z0-9-]+/i);
  await expect(page.getByText(poolName).first()).toBeVisible();

  // Back on the deck, the pool reads as joined — the round trip through the DB
  // is the point, not the optimistic state right after the click.
  await page.goto(deckUrl);
  const chip = page.getByRole("button", { name: new RegExp(poolName) });
  await expect(chip).toHaveAttribute("aria-pressed", "true");

  // Toggling off is the same action with one fewer id, which is the case most
  // likely to break if the action ever becomes additive.
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "false");
  await page.reload();
  await expect(
    page.getByRole("button", { name: new RegExp(poolName) }),
  ).toHaveAttribute("aria-pressed", "false");

  // And back on, so the deck ends pooled.
  await page.getByRole("button", { name: new RegExp(poolName) }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: new RegExp(poolName) }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("the picker is absent on a deck you don't own", async ({ page }) => {
  const deckUrl = await createDeck(page, `E2E Pool Foreign ${Date.now()}`);

  // Drop the session cookie: same URL, now a visitor. The page still renders
  // (decks are readable) but must not offer membership controls.
  await page.context().clearCookies();
  await page.goto(deckUrl);
  await expect(page.getByText(/只能浏览/)).toBeVisible();
  await expect(page.getByRole("heading", { name: /共享卡池/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /新建卡池/ })).toHaveCount(0);
});
