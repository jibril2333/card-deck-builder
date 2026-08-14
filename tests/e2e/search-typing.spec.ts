/**
 * Typing in the filter search box while the previous search is still in flight.
 *
 * The box is controlled and its value comes back out of the URL, so the
 * debounced navigation's own echo lands on it a few hundred milliseconds
 * later. Adopting that echo overwrites whatever was typed in between — and
 * with an IME that isn't just losing visible characters: reassigning a
 * controlled input's value mid-composition makes the browser throw the
 * composing text away, so it vanishes as you type it.
 *
 * Only the IME case is tested, because only the IME case actually breaks. In
 * plain Latin typing the next keystroke re-arms the debounce and the second
 * navigation coalesces with the first, so the box heals itself within a frame
 * — a test for it passes against the broken code too, which makes it worse
 * than no test.
 *
 * It needs the round trip to be SLOW to reproduce at all, hence the CDP
 * latency: on a fast local server the echo lands before you can type another
 * character, which is why this survived so long.
 */
import { expect, test, type Page } from "@playwright/test";

const BOX = 'input[placeholder="名称 / 编号 · 空格分词"]';

async function slowNetwork(page: Page, latency: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  return cdp;
}

test("doesn't eat the word an IME is still composing", async ({ page }) => {
  await page.goto("/digimon");
  const cdp = await slowNetwork(page, 600);
  await page.click(BOX);

  // First word, committed — this is what starts the search.
  await cdp.send("Input.imeSetComposition", {
    text: "bao",
    selectionStart: 3,
    selectionEnd: 3,
  });
  await cdp.send("Input.insertText", { text: "暴龙" });
  await page.evaluate((sel) => {
    document
      .querySelector(sel)!
      .dispatchEvent(
        new CompositionEvent("compositionend", { data: "暴龙", bubbles: true }),
      );
  }, BOX);
  await page.waitForTimeout(420);

  // Second word, still being composed when the first search's echo arrives.
  await cdp.send("Input.imeSetComposition", {
    text: "shou",
    selectionStart: 4,
    selectionEnd: 4,
  });
  await page.waitForTimeout(1500);
  await expect(page.locator(BOX)).toHaveValue("暴龙shou");

  await cdp.send("Input.insertText", { text: "兽" });
  await page.evaluate((sel) => {
    document
      .querySelector(sel)!
      .dispatchEvent(
        new CompositionEvent("compositionend", { data: "兽", bubbles: true }),
      );
  }, BOX);
  await page.waitForTimeout(1500);
  await expect(page.locator(BOX)).toHaveValue("暴龙兽");
  await expect(page).toHaveURL(/q=%E6%9A%B4%E9%BE%99%E5%85%BD/);
});

test("still follows a change that came from somewhere else", async ({ page }) => {
  // The echo is ignored; a real external change must not be. Otherwise this
  // fix would quietly break the Back button and 清空.
  await page.goto("/digimon?q=agumon");
  await expect(page.locator(BOX)).toHaveValue("agumon");

  await page.click(BOX);
  await page.keyboard.type("x");
  await page.waitForTimeout(900); // let it commit
  await expect(page).toHaveURL(/q=agumonx/);

  await page.goBack();
  await expect(page).toHaveURL(/q=agumon$/);
  await expect(page.locator(BOX)).toHaveValue("agumon");
});
