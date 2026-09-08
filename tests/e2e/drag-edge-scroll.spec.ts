/**
 * 把卡组拖到画面上下边缘时,页面自己滚。
 *
 * The list is longer than the window, so the tile being moved and the place it
 * is going are rarely on screen together. Without this, moving a deck from the
 * bottom of the list to the top is three gestures: drop, scroll, pick up again.
 *
 * Driven with dispatched drag events rather than a real mouse drag: the point
 * under test is the window `dragover` listener and the frame loop it starts,
 * and a synthesised HTML5 drag cannot be held at an edge for the several
 * frames the loop needs.
 */
import { expect, test, type Page } from "@playwright/test";

/** Enough decks that the page scrolls at all. */
async function manyDecks(page: Page): Promise<void> {
  await page.goto("/digimon/decks");
  const stamp = Date.now().toString().slice(-5);
  for (let i = 0; i < 6; i++) {
    await page.getByPlaceholder("卡组名").fill(`SCROLL ${stamp}-${i}`);
    await page.getByRole("button", { name: /创建/ }).click();
    await page.waitForURL(/\/digimon\/decks\/[a-z0-9-]+/i);
    await page.goto("/digimon/decks");
  }
}

/** Pick a deck up. Separate from `hold` because the scroll loop only starts
 *  once React has re-rendered with the drag in progress. */
async function startDrag(page: Page): Promise<void> {
  await page.evaluate(() => {
    const tile = document.querySelector<HTMLElement>('a[draggable="true"]');
    if (!tile) throw new Error("没有可拖动的卡组");
    tile.dispatchEvent(
      new DragEvent("dragstart", {
        bubbles: true,
        dataTransfer: new DataTransfer(),
        clientY: 200,
      }),
    );
  });
  await page.waitForTimeout(150);
}

/** Hold the pointer at `clientY` for long enough for a few frames to run. */
async function hold(page: Page, clientY: number, ms = 500): Promise<void> {
  await page.evaluate(
    (y) =>
      window.dispatchEvent(
        new DragEvent("dragover", {
          bubbles: true,
          dataTransfer: new DataTransfer(),
          clientY: y,
        }),
      ),
    clientY,
  );
  await page.waitForTimeout(ms);
}

const endDrag = (page: Page) =>
  page.evaluate(() => {
    document
      .querySelector<HTMLElement>('a[draggable="true"]')
      ?.dispatchEvent(new DragEvent("dragend", { bubbles: true }));
  });

test("holding a deck at the bottom edge scrolls down, and at the top scrolls back", async ({
  page,
}) => {
  await manyDecks(page);
  await page.setViewportSize({ width: 700, height: 400 });
  await page.waitForTimeout(400);
  const room = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    inner: window.innerHeight,
    draggable: document.querySelectorAll('a[draggable="true"]').length,
    y: window.scrollY,
  }));
  console.log("页面:", JSON.stringify(room));
  expect(room.scrollHeight, "页面得比窗口高才谈得上滚动").toBeGreaterThan(room.inner);
  expect(room.draggable).toBeGreaterThan(0);

  await startDrag(page);
  await hold(page, 395);
  const down = await page.evaluate(() => window.scrollY);
  expect(down, "拖到底部应当向下滚").toBeGreaterThan(0);

  // Back to the middle: the page holds still.
  await hold(page, 200, 400);
  expect(await page.evaluate(() => window.scrollY)).toBe(down);

  await hold(page, 5);
  expect(
    await page.evaluate(() => window.scrollY),
    "拖到顶部应当向上滚",
  ).toBeLessThan(down);

  // And it stops when the drag does.
  // And it stops when the drag does — parked away from both edges, so a loop
  // left running would move the page in either direction.
  // And it stops when the drag does. Parked away from both edges and checked
  // twice: a frame loop left running would drift the page on its own, before
  // any further event.
  await endDrag(page);
  await page.evaluate(() => window.scrollTo(0, 300));
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.scrollY), "松手后循环应当停下").toBe(300);
  await hold(page, 395, 400);
  expect(await page.evaluate(() => window.scrollY), "松手后不再响应边缘").toBe(300);
});
