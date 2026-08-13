/**
 * The account menu opens upward.
 *
 * It's the last thing in the sidebar footer — desktop column and mobile drawer
 * alike — so a dropdown that opens downward opens past the bottom of the
 * screen. It used to render 128px tall starting 12px above the viewport edge:
 * 116px of it, including 登出, was simply not reachable.
 *
 * Asserted as "inside the viewport" rather than "has class bottom-full", so it
 * still holds if the menu is ever repositioned some other way.
 */
import { expect, test } from "@playwright/test";

for (const [w, h] of [
  [1200, 800],
  [1200, 500], // a short window is where a downward menu is worst
] as const) {
  test(`account menu stays on screen at ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/digimon");
    await page.getByRole("button", { name: "账号菜单" }).click();

    const menu = page.getByRole("link", { name: "账号设置" });
    await expect(menu).toBeVisible();

    const box = (await page.locator("div.w-56").first().boundingBox())!;
    expect(box.y, "menu top above the viewport").toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, "menu bottom past the viewport").toBeLessThanOrEqual(h);

    // 登出 is the item a downward menu pushed off first.
    await expect(page.getByRole("button", { name: "登出" })).toBeInViewport();
  });
}
