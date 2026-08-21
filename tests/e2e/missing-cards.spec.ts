/**
 * 缺卡统计 — the shopping list across several decks.
 *
 * What's worth a browser here is the gate: the tool only offers 主力卡组, and
 * with none starred the toolbar doesn't render the button at all. That's two
 * pieces of state (mine, pinned) resolved on the server and spent in two
 * different components, which is exactly the kind of thing that silently
 * comes apart.
 */
import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("offers starred decks only, and adds up what they're missing", async ({
  page,
}) => {
  const name = `E2E 缺卡 ${Date.now()}`;
  await page.goto("/digimon/decks");
  await page.getByPlaceholder("卡组名").fill(name);
  await page.getByRole("button", { name: /创建/ }).click();
  await page.waitForURL(/\/digimon\/decks\/[a-z0-9-]+/i);

  // Three copies of one card, none of them bought: a shortfall of 3.
  await page.getByRole("link", { name: /🛠 组建/ }).click();
  await page.getByPlaceholder("搜卡加入卡组…").fill("Omnimon");
  const add = page.getByLabel("加入卡组 Omnimon");
  await add.waitFor();
  await add.click();
  await add.click();
  await add.click();

  await page.goto("/digimon/decks");
  const tile = page.getByRole("group", { name });
  const star = tile.getByTitle("标记为主力卡组");
  await expect(star).toBeVisible();

  // Unstarred, the deck is not on offer.
  const open = page.getByRole("button", { name: /缺卡统计/ });
  if (await open.isVisible()) {
    await open.click();
    await expect(
      page.getByRole("region", { name: "缺卡统计" }).getByTitle(name),
    ).toHaveCount(0);
    await open.click();
  }

  await star.click();
  await expect(tile.getByTitle("取消主力")).toBeVisible();

  await page.getByRole("button", { name: /缺卡统计/ }).click();
  // Picked by cover art: the tile IS the label, so clicking it toggles the
  // (sr-only) checkbox inside.
  const panel = page.getByRole("region", { name: "缺卡统计" });
  const pick = panel.getByTitle(name);
  await pick.click();
  await expect(pick.getByRole("checkbox")).toBeChecked();
  await expect(panel.getByText(/共缺/)).toContainText("3");

  // The prose that used to sit above the tiles is gone.
  await expect(panel.getByText(/想要数/)).toHaveCount(0);
  await expect(panel.getByText(/选择 1 个以上卡组/)).toHaveCount(0);

  // Leave the list as it was found — later specs read this page.
  await page.getByRole("button", { name: /缺卡统计/ }).click();
  await page.getByRole("group", { name }).getByTitle("取消主力").click();
  await expect(
    page.getByRole("group", { name }).getByTitle("标记为主力卡组"),
  ).toBeVisible();
});
