/**
 * A tab that was open across a deploy.
 *
 * The browser keeps the old bundle, whose Server Action IDs the new server has
 * never heard of, and the next click fails with "Server Action … was not found
 * on the server". Rewriting the Next-Action header to an ID that cannot exist
 * reproduces exactly that, without deploying anything.
 *
 * The page is expected to reload itself and come back working.
 */
import { expect, test } from "@playwright/test";

test("reloads itself instead of showing the error panel", async ({ page }) => {
  await page.goto("/digimon/collection");
  const tile = page.locator(".card-grid > div").first();
  await expect(tile).toBeVisible();

  let sent = false;
  await page.route("**/digimon/collection**", async (route) => {
    const headers = route.request().headers();
    if (headers["next-action"]) {
      sent = true;
      headers["next-action"] = "0".repeat(40);
    }
    await route.continue({ headers });
  });

  const reloaded = page.waitForEvent("load", { timeout: 20_000 });
  await tile.getByTitle("+1").click();
  await reloaded;
  expect(sent, "the click should have posted a Server Action").toBe(true);

  // Back on its feet: the grid is there and the panel never took over.
  await expect(page.locator(".card-grid > div").first()).toBeVisible();
  await expect(page.getByText("这一页出错了")).toHaveCount(0);
  expect(
    await page.evaluate(() => sessionStorage.getItem("cdb:stale-build-reload")),
  ).not.toBeNull();
});
