/**
 * 共享卡池 on a phone.
 *
 * The table is a column per member deck plus 需备 / 持有 / 缺: at three decks
 * it measured 591px against a 358px viewport, and the columns pushed past the
 * edge were the three the page is for. The phone gets a block per card
 * instead. What this pins is the property that failed — nothing overflows
 * sideways — plus the numbers still being on screen.
 */
import { expect, test } from "@playwright/test";

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

test("blocks, not a table, and nothing scrolls sideways", async ({ page }) => {
  const stamp = Date.now().toString().slice(-5);

  const build = async (name: string, cards: [string, string, number][]) => {
    await page.goto("/digimon/decks");
    await page.getByPlaceholder("卡组名").fill(name);
    await page.getByRole("button", { name: /创建/ }).click();
    await page.waitForURL(/\/digimon\/decks\/[a-z0-9-]+/i);
    const url = page.url();
    await page.getByRole("link", { name: /🛠 组建/ }).click();
    for (const [code, cardName, n] of cards) {
      await page.getByPlaceholder("搜卡加入卡组…").fill(code);
      const hit = page.getByLabel(`加入卡组 ${cardName}`);
      for (let i = 0; i < n; i++) await hit.click();
      await expect(
        page.locator(".card-grid > div").filter({ hasText: code }),
      ).toBeVisible();
    }
    return url;
  };

  const decks = [
    await build(`M池甲 ${stamp}`, [
      ["BT1-084", "Omnimon", 3],
      ["BT1-001", "Yokomon", 2],
    ]),
    await build(`M池乙 ${stamp}`, [["BT1-084", "Omnimon", 1]]),
    await build(`M池丙 ${stamp}`, [["BT1-021", "MetalGreymon", 4]]),
  ];

  await page.goto("/digimon/decks");
  await page.getByRole("button", { name: /新建卡池/ }).click();
  await page.waitForURL(/\/digimon\/groups\/[a-z0-9-]+/i);
  const pool = new URL(page.url()).pathname;
  for (const url of decks) {
    await page.goto(url);
    await page.getByLabel("共享卡池").selectOption({ index: 1 });
    await expect(page.getByLabel("打开卡池")).toBeVisible();
  }

  await page.goto(pool);
  const blocks = page.locator(".pool-blocks li");
  await expect(blocks.first()).toBeVisible();
  // The table is still in the DOM; on this viewport it is the hidden half.
  await expect(page.locator(".pool-wide")).toBeHidden();

  // Each card once, and the block carries the three numbers.
  for (const code of ["BT1-084", "BT1-001", "BT1-021"]) {
    await expect(blocks.filter({ hasText: code })).toHaveCount(1);
  }
  const omni = blocks.filter({ hasText: "BT1-084" });
  await expect(omni).toContainText("需备 3");
  await expect(omni).toContainText("缺 3");
  await expect(omni.getByLabel("多一张")).toBeVisible();

  // The complaint was horizontal scrolling. Assert it of the page and of every
  // block, since one over-wide child is enough to bring it back.
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const wide = [...document.querySelectorAll<HTMLElement>(".pool-blocks li")]
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => el.textContent?.slice(0, 20));
    return { page: doc.scrollWidth - doc.clientWidth, wide };
  });
  expect(overflow.wide).toEqual([]);
  expect(overflow.page).toBeLessThanOrEqual(0);

  // The shared held count is editable here too — the stepper is the only
  // control in this layout and a hidden duplicate must not swallow the tap.
  await omni.getByLabel("多一张").click();
  await expect(omni).toContainText("缺 2");
  await page.reload();
  await expect(
    page.locator(".pool-blocks li").filter({ hasText: "BT1-084" }),
  ).toContainText("缺 2");
});
