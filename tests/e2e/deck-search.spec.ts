/**
 * The build-mode card picker.
 *
 * Covers the clear affordance: it appears only when there is something to
 * clear, empties the box and the result list, keeps the caret so you can type
 * the next name straight away, and answers Escape as well as a click.
 */
import { expect, test } from "@playwright/test";
test("deck search has a clear button", async ({ page }) => {
  await page.goto("/digimon/decks");
  await page.getByPlaceholder("卡组名").fill("CLR " + Date.now());
  await page.getByRole("button", { name: /创建/ }).click();
  await page.waitForURL(/\/digimon\/decks\/[a-z0-9-]+/i);
  await page.getByRole("link", { name: /🛠 组建/ }).click();

  const input = page.getByPlaceholder("搜卡加入卡组…");
  const clear = page.getByRole("button", { name: "清空" });

  // Absent while empty — nothing to clear.
  await expect(clear).toHaveCount(0);

  await input.fill("Omnimon");
  await expect(clear).toBeVisible();
  await expect(page.getByLabel("加入卡组 Omnimon")).toBeVisible();

  await clear.click();
  await expect(input).toHaveValue("");
  await expect(clear).toHaveCount(0);
  await expect(input).toBeFocused();
  // The result list goes with it.
  await expect(page.getByLabel("加入卡组 Omnimon")).toHaveCount(0);

  // Escape clears too.
  await input.fill("Agumon");
  await expect(clear).toBeVisible();
  await input.press("Escape");
  await expect(input).toHaveValue("");
});
