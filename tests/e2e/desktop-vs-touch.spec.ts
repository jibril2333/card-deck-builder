/**
 * Phone chrome is for phones, not for narrow windows.
 *
 * The nav used to collapse into a hamburger below 1024px, which is where a
 * browser window on half a laptop screen lives — trackpad, huge screen, phone
 * layout. The `desktop:` variant asks about the POINTER as well as the width
 * (see globals.css), so this pins both halves: a narrow window with a mouse
 * keeps the column, a phone still gets the drawer.
 */
import { expect, test } from "@playwright/test";

const sidebarShown = (p: import("@playwright/test").Page) =>
  p.locator("aside").first().evaluate((el) => getComputedStyle(el).display);

test.describe("a narrow window with a mouse", () => {
  test("keeps the sidebar", async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 900 });
    await page.goto("/digimon");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await sidebarShown(page)).not.toBe("none");
    // The drawer's opener is display:none, not merely absent.
    await expect(page.getByRole("button", { name: "打开菜单" })).toBeHidden();
  });

  test("still gets the phone layout when it's actually narrow", async ({
    page,
  }) => {
    // Below the fine-pointer floor (48rem) even a mouse gets the drawer: the
    // column would leave nothing for the content.
    await page.setViewportSize({ width: 700, height: 900 });
    await page.goto("/digimon");
    await expect(page.getByRole("button", { name: "打开菜单" })).toBeVisible();
  });
});

test.describe("a touch screen", () => {
  test.use({ viewport: { width: 900, height: 1200 }, hasTouch: true, isMobile: true });

  test("gets the drawer even when it is wide", async ({ page }) => {
    // A tablet in portrait is wider than the fine-pointer floor, and still
    // wants a drawer rather than a column it has to reach across.
    await page.goto("/digimon");
    await expect(page.getByRole("button", { name: "打开菜单" })).toBeVisible();
    expect(await sidebarShown(page)).toBe("none");
  });
});
