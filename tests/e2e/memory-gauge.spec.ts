/**
 * 内存条 — the honeycomb board.
 *
 * /digimon/memory IS the board: it covers the viewport, there is no page around
 * it. What's checked here is the geometry (the fold is easy to get subtly wrong
 * and still look like a honeycomb), that a tap moves the one shared counter,
 * and that the board survives a reload.
 */
import { expect, test } from "@playwright/test";

async function open(page: import("@playwright/test").Page) {
  // Clear the saved board and reload, rather than addInitScript — an init
  // script runs on EVERY navigation in the page, including the reload the
  // persistence test is trying to make, which would wipe the thing under test.
  await page.goto("/digimon/memory");
  await page.evaluate(() => window.localStorage.removeItem("cdb.memory-gauge"));
  await page.reload();
  await expect(page.getByRole("group", { name: "内存条" })).toBeVisible();
}

const hex = (page: import("@playwright/test").Page, name: string) =>
  page.getByRole("button", { name, exact: true });

/** Centre of a hex, in viewport pixels. */
async function at(page: import("@playwright/test").Page, name: string) {
  const box = await hex(page, name).boundingBox();
  if (!box) throw new Error(`no hex ${name}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, w: box.width, h: box.height };
}

test("the nav entry lands straight on the board, and 返回 goes back", async ({
  page,
}) => {
  await page.goto("/digimon");
  await page.getByRole("link", { name: /内存条/ }).click();
  await page.waitForURL(/\/digimon\/memory$/);

  // No intermediate page, and no chrome on the board: every pixel of banner is
  // a pixel of hexagon, so the title bar and its back arrow are gone and 返回
  // lives in the footer.
  await expect(page.getByRole("group", { name: "内存条" })).toBeVisible();
  await expect(page.getByRole("button", { name: /桌面模式/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "撤销" })).toHaveCount(0);

  // Nothing above the honeycomb. Asserted as pixels rather than as "no element
  // says 内存条", because the sidebar's nav entry says that too and is still in
  // the DOM underneath the board — the property that matters is that no banner
  // is eating height.
  const svg = await page.locator('svg[aria-label="内存条"]').boundingBox();
  expect(svg?.y).toBeLessThan(12);

  await page.getByRole("button", { name: "返回" }).click();
  await page.waitForURL(/\/digimon$/);
});

test("the route asks for the whole screen", async ({ page }) => {
  await open(page);

  // viewport-fit=cover is what lets the field reach the physical screen edges
  // instead of sitting inside iOS's reserved strips; appleWebApp is what makes
  // Add to Home Screen launch without Safari's chrome. Both are route-scoped
  // exports that would silently stop applying if moved or dropped.
  const meta = (sel: string) =>
    page.locator(sel).first().getAttribute("content");
  expect(await meta('meta[name="viewport"]')).toContain("viewport-fit=cover");
  expect(await meta('meta[name="mobile-web-app-capable"]')).toBe("yes");
  expect(await meta('meta[name="apple-mobile-web-app-status-bar-style"]')).toBe(
    "black-translucent",
  );
});

test("tapping a hex moves the counter there", async ({ page }) => {
  await open(page);
  await expect(hex(page, "0")).toHaveAttribute("aria-current", "true");

  await hex(page, "蓝方 4").click();
  await expect(hex(page, "蓝方 4")).toHaveAttribute("aria-current", "true");
  await expect(hex(page, "0")).not.toHaveAttribute("aria-current", "true");

  // One counter, not two: moving to 蓝方 4 leaves nothing marked on 橙方's side.
  await expect(hex(page, "橙方 4")).not.toHaveAttribute("aria-current", "true");
});

test("the board survives a reload", async ({ page }) => {
  await open(page);
  await hex(page, "橙方 7").click();
  await expect(hex(page, "橙方 7")).toHaveAttribute("aria-current", "true");

  // Not `open()` — that clears storage. This is the actual reload path.
  await page.reload();
  await expect(hex(page, "橙方 7")).toHaveAttribute("aria-current", "true");
});

test("tapping 0 puts the counter back in the middle", async ({ page }) => {
  // What the 开局 button used to do. It's gone: the 0 hex is right there, and a
  // control that duplicates a hex is one more thing to hit by mistake.
  await open(page);
  await hex(page, "橙方 6").click();
  await expect(page.getByRole("button", { name: "开局" })).toHaveCount(0);
  await hex(page, "0").click();
  await expect(hex(page, "0")).toHaveAttribute("aria-current", "true");
});

/**
 * 返回 floats in the bottom-left corner instead of a footer row, which only
 * works because the honeycomb's diagonal ribbon leaves that corner empty. How
 * much of it is empty changes with the viewport, so this measures the actual
 * rectangles at the sizes a phone or tablet can be.
 */
test("the corner controls never sit on a hexagon", async ({ page }) => {
  await open(page);

  for (const [w, h] of [
    [320, 568],
    [375, 667],
    [390, 844],
    [430, 932],
    [768, 1024],
    [844, 390],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            // Scoped to the board: the sidebar it covers has buttons of its own
            // sitting underneath, and those overlap the hexes by design.
            const board = document.querySelector('svg[aria-label="内存条"]')
              ?.parentElement;
            if (!board) return ["no board"];
            const out: string[] = [];
            for (const btn of board.querySelectorAll(":scope > button")) {
              const b = btn.getBoundingClientRect();
              for (const poly of board.querySelectorAll("svg polygon")) {
                const r = poly.getBoundingClientRect();
                if (
                  r.left < b.right - 1 && b.left < r.right - 1 &&
                  r.top < b.bottom - 1 && b.top < r.bottom - 1
                ) {
                  out.push(
                    `${btn.textContent?.trim() || btn.ariaLabel}×${poly.parentElement?.getAttribute("aria-label")}`,
                  );
                }
              }
            }
            return [...new Set(out)];
          }),
        { timeout: 3000, message: `viewport ${w}x${h}` },
      )
      .toEqual([]);
  }
});

/**
 * The fold is the whole layout, and a column off by one row still looks like a
 * honeycomb. These pin it to the reference screenshot: three columns, each side
 * confined to two of them, the halves point-symmetric about zero, 1 directly
 * above 0, and 4 stepping out to the TOP of the left column so 5…10 come back
 * down it.
 */
test("the honeycomb is folded the way the reference folds it", async ({ page }) => {
  await open(page);

  const zero = await at(page, "0");
  // Named for the sign of the position, not the colour — the two swapped once
  // already and the assertions below are about geometry either way.
  const pos = [];
  const neg = [];
  for (let n = 1; n <= 10; n++) {
    pos.push(await at(page, `橙方 ${n}`));
    neg.push(await at(page, `蓝方 ${n}`));
  }

  // Exactly three columns, evenly spaced, zero in the middle one.
  const xs = [...new Set([...pos, ...neg, zero].map((p) => Math.round(p.x)))].sort(
    (a, b) => a - b,
  );
  expect(xs).toHaveLength(3);
  expect(xs[1] - xs[0]).toBeCloseTo(xs[2] - xs[1], 0);
  expect(Math.round(zero.x)).toBe(xs[1]);

  // 橙方 never uses the right column, 蓝方 never uses the left.
  expect(pos.every((p) => Math.round(p.x) <= xs[1])).toBe(true);
  expect(neg.every((p) => Math.round(p.x) >= xs[1])).toBe(true);

  // Point-symmetric about zero: 橙方 n mirrors 蓝方 n through the 0 hex.
  for (let i = 0; i < 10; i++) {
    expect(pos[i].x + neg[i].x).toBeCloseTo(2 * zero.x, 0);
    expect(pos[i].y + neg[i].y).toBeCloseTo(2 * zero.y, 0);
  }

  // 1, 2, 3 climb the middle column straight up from 0.
  for (const n of [1, 2, 3]) expect(Math.round(pos[n - 1].x)).toBe(xs[1]);
  expect(pos[0].y).toBeLessThan(zero.y);
  expect(pos[1].y).toBeLessThan(pos[0].y);
  expect(pos[2].y).toBeLessThan(pos[1].y);

  // 4…10 are the left column, and 4 is at the TOP of it — get the turn wrong
  // and 4 sits at the bottom with 10 above it.
  for (let n = 4; n <= 10; n++) expect(Math.round(pos[n - 1].x)).toBe(xs[0]);
  for (let n = 5; n <= 10; n++) {
    expect(pos[n - 1].y).toBeGreaterThan(pos[n - 2].y);
  }
  expect(pos[3].y).toBeLessThan(pos[2].y); // 4 above 3, the highest hex on the board
});

test("every digit is turned toward a player, zero included", async ({ page }) => {
  await open(page);
  const spin = (name: string) => hex(page, name).locator("text").getAttribute("transform");

  expect(await spin("橙方 7")).toMatch(/rotate\(90/);
  expect(await spin("蓝方 7")).toMatch(/rotate\(-90/);
  // Zero is turned with the rest of them; it used to be the one upright digit
  // on the board, reading the wrong way for both players at once.
  expect(await spin("0")).toMatch(/rotate\(90/);
});

test("the whole honeycomb stays on screen at any usable height", async ({ page }) => {
  await open(page);

  for (let h = 400; h <= 940; h += 60) {
    await page.setViewportSize({ width: 390, height: h });
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const svg = document.querySelector('svg[aria-label="内存条"]');
            if (!svg) return ["no svg"];
            const out: string[] = [];
            const box = svg.getBoundingClientRect();
            for (const g of svg.querySelectorAll("g")) {
              const r = g.getBoundingClientRect();
              if (r.width < 10 || r.height < 10) out.push(`tiny:${g.getAttribute("aria-label")}`);
              if (r.top < box.top - 1 || r.bottom > box.bottom + 1) {
                out.push(`clipped:${g.getAttribute("aria-label")}`);
              }
            }
            return [...new Set(out)];
          }),
        { timeout: 3000, message: `viewport height ${h}` },
      )
      .toEqual([]);
  }
});

test("UA has no memory gauge", async ({ page }) => {
  await page.goto("/unionarena");
  await expect(page.getByRole("link", { name: /内存条/ })).toHaveCount(0);

  // Asserted on the rendered body, not the status code: every notFound() under
  // /[game] currently answers 200 with the not-found page, because the [game]
  // layout has already streamed by the time the page resolves. That predates
  // this route (an unknown deck id and an unknown card code do the same) and
  // isn't this page's to fix — what matters here is that no board renders.
  await page.goto("/unionarena/memory");
  await expect(page.getByRole("group", { name: "内存条" })).toHaveCount(0);
  await expect(page.getByText("This page could not be found")).toBeVisible();
});
