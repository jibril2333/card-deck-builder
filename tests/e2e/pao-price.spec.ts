/**
 * Two shops, two quotes. `external_prices` has been keyed by source since it
 * was written; PAO is what that key was for.
 */
import { expect, test } from "@playwright/test";

test("the card page shows PAO's quote per printing", async ({ page }) => {
  await page.goto("/digimon/card/BT1-084");
  await expect(page.getByText("PAO 市场价")).toBeVisible();

  // The label's own container, not the label: the prices are its siblings.
  const block = page
    .locator("div")
    .filter({ has: page.getByTitle("PAO 最低价(品相由好到差取第一档)") })
    .last();
  await expect(block).toContainText("¥180");
  // Sold out is still a price, struck through rather than hidden.
  await expect(block).toContainText("¥3,800");
  await expect(block.getByText("¥3,800")).toHaveClass(/line-through/);
});

test("each shop's heading links to that shop's page for the card", async ({
  page,
}) => {
  await page.goto("/digimon/card/BT1-084");
  const pao = page.getByRole("link", { name: /PAO 市场价/ });
  await expect(pao).toHaveAttribute(
    "href",
    "https://pao-onlineshop.com/view/search?search_keyword=BT1-084&search_category=DC",
  );
  await expect(pao).toHaveAttribute("target", "_blank");
  await expect(pao).toHaveAttribute("rel", /noopener/);
});

test("a card PAO doesn't stock has no block at all", async ({ page }) => {
  await page.goto("/digimon/card/BT1-001");
  await expect(page.getByText("PAO 市场价")).toHaveCount(0);
});
