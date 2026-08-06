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

test("the member picker shows deck covers, many to a row", async ({ page }) => {
  const stamp = Date.now();

  // Three decks, each with a different cover, so the picker has something to
  // tell apart — a coverless fixture would only ever exercise the fallback.
  const covers = ["MetalGreymon", "Omnimon", "Monodramon"];
  for (const cardName of covers) {
    await createDeck(page, `E2E ${cardName} ${stamp}`);
    await page.getByRole("link", { name: /🛠 组建/ }).click();
    await page.getByPlaceholder("搜卡加入卡组…").fill(cardName);
    // The result list is fetched, so the ＋ button doesn't exist yet.
    const add = page.getByLabel(`加入卡组 ${cardName}`);
    await add.waitFor();
    await add.click();
    // Likewise the tile only appears once the Server Action has landed.
    const star = page.getByTitle("设为封面");
    await star.waitFor();
    await star.click();
    await expect(page.getByTitle(/已是封面/)).toBeVisible();
  }

  // Still on the last deck's page — make a pool from it, which lands on the
  // pool where the member picker lives.
  await page.getByRole("button", { name: /新建卡池/ }).click();
  await page.getByPlaceholder("卡池名称").fill(`E2E 封面池 ${stamp}`);
  await page.getByRole("button", { name: "建", exact: true }).click();
  await page.waitForURL(/\/digimon\/groups\/[a-z0-9-]+/i);

  await page.getByRole("button", { name: /管理成员/ }).click();
  const tiles = page.locator("label:has(input[type=checkbox])");
  await expect(tiles.first()).toBeVisible();

  // The complaint was two per row. Assert on laid-out geometry rather than the
  // class list: how many tiles actually share a row is the thing that changed.
  const perRow = await tiles.evaluateAll((els) => {
    const tops = els.map((e) => Math.round(e.getBoundingClientRect().top));
    const first = tops[0];
    return tops.filter((t) => t === first).length;
  });
  expect(perRow).toBeGreaterThan(2);

  // And the tiles render art, not just a name.
  await expect(tiles.locator("img").first()).toBeVisible();
});

test("deck info lives in the banner, and editing is opt-in", async ({ page }) => {
  const name = `E2E Banner ${Date.now()}`;
  await createDeck(page, name);

  // Give it a cover so the banner is in its art-backed form, not the bare one.
  await page.getByRole("link", { name: /🛠 组建/ }).click();
  await page.getByPlaceholder("搜卡加入卡组…").fill("Omnimon");
  const add = page.getByLabel("加入卡组 Omnimon");
  await add.waitFor();
  await add.click();
  const star = page.getByTitle("设为封面");
  await star.waitFor();
  await star.click();
  await expect(page.getByTitle(/已是封面/)).toBeVisible();

  // The name is the banner's h1 — and only there. It used to be both this and
  // an input in the sidebar.
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(page.getByText("卡组信息")).toHaveCount(0);

  // The form is behind the toggle, not always mounted.
  const nameField = page.locator("input[value='" + name + "']");
  await expect(nameField).toHaveCount(0);
  await page.getByRole("button", { name: /编辑/ }).click();
  await expect(nameField).toBeVisible();
  await expect(page.getByRole("button", { name: /删除卡组/ })).toBeVisible();

  // And it collapses again.
  await page.getByRole("button", { name: /收起/ }).click();
  await expect(nameField).toHaveCount(0);

});
