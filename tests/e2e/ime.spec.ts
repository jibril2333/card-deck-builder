/**
 * IME composition.
 *
 * Typing 天女兽 with a pinyin IME fires `input` for every letter of "tiannv"
 * before a single character exists. Anything hanging off onChange therefore
 * ran on the romaji: the search queried "tian" and reported no matches under a
 * box that visibly said 天.
 *
 * These drive the DOM events a real IME emits — compositionstart, a run of
 * input, then compositionend — because that sequence is exactly what the code
 * under test subscribes to.
 */
import { expect, test } from "@playwright/test";

/** Set a React-controlled input's value so React's onChange actually sees it. */
const TYPE = `(el, v) => {
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}`;

async function compose(
  page: import("@playwright/test").Page,
  selector: string,
  steps: string[],
  final: string,
) {
  const el = page.locator(selector);
  await el.focus();
  await el.evaluate((e) => e.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })));
  for (const s of steps) {
    await el.evaluate(new Function("el", "v", `(${TYPE})(el, v)`) as never, s);
    await page.waitForTimeout(450); // longer than the 300ms debounce
  }
  await el.evaluate(new Function("el", "v", `(${TYPE})(el, v)`) as never, final);
  await el.evaluate((e) => e.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true })));
}

test("card search doesn't fire on the romaji mid-composition", async ({ page }) => {
  await page.goto("/digimon");
  const box = 'input[name="q"]';
  await page.locator(box).waitFor();

  // Record EVERY search, not just the last one. Asserting on the final URL
  // proves nothing: the romaji search fires and is then overwritten by the
  // committed one, so the end state looks identical either way.
  const searched: string[] = [];
  page.on("framenavigated", (f) => {
    if (f !== page.mainFrame()) return;
    const q = new URL(f.url()).searchParams.get("q");
    if (q) searched.push(q);
  });

  await compose(page, box, ["t", "ti", "tian"], "天女兽");
  await page.waitForTimeout(1200);

  expect(searched).not.toContain("tian");
  expect(searched).not.toContain("ti");
  // The committed word still has to be searched — suppressing everything
  // would "pass" this test and break the feature.
  expect(searched).toContain("天女兽");
});

test("deck picker doesn't search the romaji either", async ({ page }) => {
  await page.goto("/digimon/decks");
  await page.getByPlaceholder("卡组名").fill("IME " + Date.now());
  await page.getByRole("button", { name: /创建/ }).click();
  await page.waitForURL(/\/digimon\/decks\/[a-z0-9-]+/i);
  await page.getByRole("link", { name: /🛠 组建/ }).click();

  const box = 'input[placeholder="搜卡加入卡组…"]';
  await page.locator(box).waitFor();

  // The picker searches through a Server Action, so count the POSTs rather
  // than navigations. One search, not four.
  let posts = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/decks/")) posts++;
  });

  await compose(page, box, ["o", "om", "omni"], "Omnimon");
  await page.waitForTimeout(1500);

  await expect(page.locator(box)).toHaveValue("Omnimon");
  await expect(page.getByLabel("加入卡组 Omnimon")).toBeVisible();
  // Three romaji steps had 450ms each — well past the 300ms debounce — so
  // without the guard this is four.
  expect(posts).toBe(1);
});
