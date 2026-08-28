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
  p
    .locator("aside")
    .first()
    .evaluate((el) => getComputedStyle(el).display);

test.describe("a narrow window with a mouse", () => {
  test("keeps the sidebar", async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 900 });
    await page.goto("/digimon");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await sidebarShown(page)).not.toBe("none");
    // The drawer's opener is display:none, not merely absent.
    await expect(page.getByRole("button", { name: "打开菜单" })).toBeHidden();
  });

  test("narrows the column to an icon rail instead of hiding it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 880, height: 900 });
    await page.goto("/digimon");
    const aside = page.locator("aside").first();
    const railWidth = () =>
      aside.evaluate((el) => Math.round(el.getBoundingClientRect().width));
    await expect.poll(railWidth).toBe(56);
    // Icons only — the words are tooltips at this width.
    const decks = aside.getByRole("link", { name: "我的卡组" });
    await expect(decks).toBeVisible();
    await expect(decks.getByText("我的卡组")).toBeHidden();
    await expect(decks).toHaveAttribute("title", "我的卡组");

    // And the full column comes back when there is room for it.
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect.poll(railWidth).toBe(240);
    await expect(decks.getByText("我的卡组")).toBeVisible();
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

  test("keeps the filters out of the sheet, whatever the width", async ({
    page,
  }) => {
    const search = page.getByPlaceholder("名称 / 编号 · 空格分词");
    const fab = page.getByRole("button", { name: "筛选", exact: true });
    const bar = page.getByRole("button", { name: /🔍 筛选/ });

    // Room for the column: it is simply there, with nothing to press.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/digimon");
    await expect(search).toBeVisible();
    await expect(fab).toBeHidden();
    await expect(bar).toBeHidden();

    // No room, but still a mouse: the old bar, collapsed. NOT the sheet —
    // 600px used to get the floating button and a panel sliding over the page.
    await page.setViewportSize({ width: 600, height: 800 });
    await page.goto("/digimon");
    await expect(fab).toBeHidden();
    await expect(bar).toBeVisible();
    await expect(search).toBeHidden();
    await bar.click();
    await expect(search).toBeVisible();
  });
});

test.describe("a touch screen", () => {
  test.use({
    viewport: { width: 900, height: 1200 },
    hasTouch: true,
    isMobile: true,
  });

  test("gets the drawer even when it is wide", async ({ page }) => {
    // A tablet in portrait is wider than the fine-pointer floor, and still
    // wants a drawer rather than a column it has to reach across.
    await page.goto("/digimon");
    await expect(page.getByRole("button", { name: "打开菜单" })).toBeVisible();
    expect(await sidebarShown(page)).toBe("none");
  });
});

test.describe("a tablet in landscape", () => {
  test.use({
    viewport: { width: 1180, height: 820 },
    hasTouch: true,
    isMobile: true,
  });

  test("is a desktop: fingers, but plenty of room", async ({ page }) => {
    // Touch alone doesn't mean "phone". At 1180px the column fits, and a
    // sheet sliding up over a screen this size answers a question nobody
    // asked.
    await page.goto("/digimon");
    expect(await sidebarShown(page)).not.toBe("none");
    await expect(page.getByPlaceholder("名称 / 编号 · 空格分词")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "筛选", exact: true }),
    ).toBeHidden();
  });
});

test.describe("a phone on its side", () => {
  test.use({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
  });

  test("keeps the sheet, and lets it use the short screen", async ({
    page,
  }) => {
    // Wide but 390px tall: the column would leave nothing, so this is still
    // the phone treatment — with the sheet allowed most of the height, since
    // height is the scarce thing here.
    await page.goto("/digimon");
    await expect(
      page.getByRole("button", { name: "筛选", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "筛选", exact: true }).click();
    const sheet = page.locator(".filter-sheet");
    const height = await sheet.evaluate(
      (el) => el.getBoundingClientRect().height,
    );
    expect(height).toBeGreaterThan(390 * 0.8);
  });
});
