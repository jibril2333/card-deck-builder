/**
 * The memory gauge page.
 *
 * The arithmetic is unit-tested (tests/memory-gauge.test.ts); what's checked
 * here is the part unit tests can't see — that the buttons are wired to the
 * right side of the gauge, that the readout is turn-relative, and that the
 * board survives a reload. Every assertion is on a value that would come out
 * differently if the sign were flipped, so a "spend pushes the wrong way" bug
 * can't pass this.
 */
import { expect, test } from "@playwright/test";

const READOUT = ".tabular-nums.font-bold";

async function open(page: import("@playwright/test").Page) {
  // Clear the saved board and reload, rather than addInitScript — an init
  // script runs on EVERY navigation in the page, including the reload the
  // persistence test is trying to make, which would wipe the thing under test.
  await page.goto("/digimon/memory");
  await page.evaluate(() => window.localStorage.removeItem("cdb.memory-gauge"));
  await page.reload();
  await expect(page.getByRole("heading", { name: "记忆条" })).toBeVisible();
}

/** The big turn-relative number. */
function readout(page: import("@playwright/test").Page) {
  return page.locator(READOUT).first();
}

test("spending pushes the counter to the other side, whoever is acting", async ({
  page,
}) => {
  await open(page);
  await expect(readout(page)).toHaveText("0");
  await expect(page.getByRole("button", { name: "我方的回合" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // We pay 3: our side reads -3, and the counter is sitting on the opponent's 3.
  await page.getByRole("button", { name: "−3", exact: true }).click();
  await expect(readout(page)).toHaveText("-3");
  await expect(
    page.getByRole("button", { name: "把记忆条移到 对手 3" }),
  ).toHaveAttribute("aria-current", "true");

  // Hand over: the SAME counter now reads +3 for them. (A two-number model
  // would show 0 here.)
  await page.getByRole("button", { name: /结束回合/ }).click();
  await expect(page.getByRole("button", { name: "对手的回合" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(readout(page)).toHaveText("3");

  // They pay 1 of it — still their turn.
  await page.getByRole("button", { name: "−1", exact: true }).click();
  await expect(readout(page)).toHaveText("2");
  await expect(page.getByText(/结算完当前动作后换手/)).toHaveCount(0);

  // …then a 4, which overshoots into our side and ends their turn.
  await page.getByRole("button", { name: "−4", exact: true }).click();
  await expect(readout(page)).toHaveText("-2");
  await expect(page.getByText(/结算完当前动作后换手/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "把记忆条移到 我方 2" }),
  ).toHaveAttribute("aria-current", "true");
});

test("gains pull it back toward the acting side", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "−5", exact: true }).click();
  await expect(readout(page)).toHaveText("-5");
  await page.getByRole("button", { name: "+2", exact: true }).click();
  await expect(readout(page)).toHaveText("-3");
});

test("the track ends at 10 instead of running off it", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "−8", exact: true }).click();
  await page.getByRole("button", { name: "−8", exact: true }).click();
  await expect(readout(page)).toHaveText("-10");
});

test("undo steps back one action at a time", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "−2", exact: true }).click();
  await page.getByRole("button", { name: "−3", exact: true }).click();
  await expect(readout(page)).toHaveText("-5");
  await page.getByRole("button", { name: "撤销" }).click();
  await expect(readout(page)).toHaveText("-2");
  await page.getByRole("button", { name: "撤销" }).click();
  await expect(readout(page)).toHaveText("0");
  await expect(page.getByRole("button", { name: "撤销" })).toBeDisabled();
});

test("the board survives a reload", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "−4", exact: true }).click();
  await page.getByRole("button", { name: /结束回合/ }).click();
  await expect(readout(page)).toHaveText("4");

  // Not `open()` — that clears storage. This is the actual reload path.
  await page.reload();
  await expect(readout(page)).toHaveText("4");
  await expect(page.getByRole("button", { name: "对手的回合" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("reset puts both sides back on zero", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "−6", exact: true }).click();
  await page.getByRole("button", { name: /结束回合/ }).click();
  await page.getByRole("button", { name: "重置" }).click();
  await expect(readout(page)).toHaveText("0");
  await expect(page.getByRole("button", { name: "我方的回合" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByText(/开局双方都在 0/)).toBeVisible();
});

test("UA has no memory gauge", async ({ page }) => {
  await page.goto("/unionarena");
  await expect(page.getByRole("link", { name: /记忆条/ })).toHaveCount(0);

  // Asserted on the rendered body, not the status code: every notFound() under
  // /[game] currently answers 200 with the not-found page, because the [game]
  // layout has already streamed by the time the page resolves. That predates
  // this route (an unknown deck id and an unknown card code do the same) and
  // isn't this page's to fix — what matters here is that no gauge renders.
  await page.goto("/unionarena/memory");
  await expect(page.getByRole("group", { name: "记忆条" })).toHaveCount(0);
  await expect(page.getByText("This page could not be found")).toBeVisible();
});

// ── 桌面模式 ────────────────────────────────────────────────────────────────
// The honeycomb replica: 21 hexes folded into three columns, tap to move the
// counter, digits turned toward whichever player owns them.

test.describe("table mode", () => {
  const enter = async (page: import("@playwright/test").Page) => {
    await page.getByRole("button", { name: /桌面模式/ }).click();
    await expect(page.getByRole("group", { name: "内存条" })).toBeVisible();
  };

  /** Centre of a hex, in viewport pixels. */
  const at = async (page: import("@playwright/test").Page, name: string) => {
    const box = await page.getByRole("button", { name, exact: true }).boundingBox();
    if (!box) throw new Error(`no hex ${name}`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };

  test("tapping a hex moves the counter there", async ({ page }) => {
    await open(page);
    await enter(page);
    await expect(page.getByRole("button", { name: "0", exact: true })).toHaveAttribute(
      "aria-current",
      "true",
    );

    await page.getByRole("button", { name: "橙方 4", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "橙方 4", exact: true }),
    ).toHaveAttribute("aria-current", "true");
    await expect(page.getByRole("button", { name: "0", exact: true })).not.toHaveAttribute(
      "aria-current",
      "true",
    );

    // Leaving the mode keeps the position: 橙方 4 is -4 from 蓝方's seat.
    await page.getByRole("button", { name: "‹ 返回" }).click();
    await expect(readout(page)).toHaveText("-4");
  });

  test("撤销 and 开局 work on the same history as the rest of the page", async ({
    page,
  }) => {
    await open(page);
    await page.getByRole("button", { name: "−3", exact: true }).click();
    await enter(page);
    await expect(
      page.getByRole("button", { name: "橙方 3", exact: true }),
    ).toHaveAttribute("aria-current", "true");

    await page.getByRole("button", { name: "蓝方 6", exact: true }).click();
    await page.getByRole("button", { name: "撤销" }).click();
    await expect(
      page.getByRole("button", { name: "橙方 3", exact: true }),
    ).toHaveAttribute("aria-current", "true");

    await page.getByRole("button", { name: "开局" }).click();
    await expect(page.getByRole("button", { name: "0", exact: true })).toHaveAttribute(
      "aria-current",
      "true",
    );
    await expect(page.getByRole("button", { name: "撤销" })).toBeDisabled();
  });

  /**
   * The fold is the whole layout, and it is easy to get subtly wrong — a column
   * off by one row still looks like a honeycomb. These are the properties that
   * pin it: three columns, each side confined to two of them, the two halves
   * point-symmetric about zero, and the left column running 4→10 downward.
   */
  test("the honeycomb is folded the way the reference folds it", async ({ page }) => {
    await open(page);
    await enter(page);

    const zero = await at(page, "0");
    const blue = [];
    const gold = [];
    for (let n = 1; n <= 10; n++) {
      blue.push(await at(page, `蓝方 ${n}`));
      gold.push(await at(page, `橙方 ${n}`));
    }

    // Exactly three columns, evenly spaced, zero in the middle one.
    const xs = [...new Set([...blue, ...gold, zero].map((p) => Math.round(p.x)))].sort(
      (a, b) => a - b,
    );
    expect(xs).toHaveLength(3);
    expect(xs[1] - xs[0]).toBeCloseTo(xs[2] - xs[1], 0);
    expect(Math.round(zero.x)).toBe(xs[1]);

    // 蓝方 never uses the right column, 橙方 never uses the left.
    expect(blue.every((p) => Math.round(p.x) <= xs[1])).toBe(true);
    expect(gold.every((p) => Math.round(p.x) >= xs[1])).toBe(true);

    // Point-symmetric about zero: 蓝方 n mirrors 橙方 n through the 0 hex.
    for (let i = 0; i < 10; i++) {
      expect(blue[i].x + gold[i].x).toBeCloseTo(2 * zero.x, 0);
      expect(blue[i].y + gold[i].y).toBeCloseTo(2 * zero.y, 0);
    }

    // 1–3 climb the middle column, then 4 steps out and 4–10 come back down
    // the left one. (Get the turn wrong and 4 sits below 10.)
    for (const n of [1, 2, 3]) expect(Math.round(blue[n - 1].x)).toBe(xs[1]);
    for (let n = 4; n <= 10; n++) expect(Math.round(blue[n - 1].x)).toBe(xs[0]);
    expect(blue[2].y).toBeLessThan(blue[0].y); // 3 above 1
    for (let n = 5; n <= 10; n++) {
      expect(blue[n - 1].y).toBeGreaterThan(blue[n - 2].y); // 4→10 descending
    }
  });

  test("the two sides' digits face opposite ways", async ({ page }) => {
    await open(page);
    await enter(page);
    const spin = (name: string) =>
      page
        .getByRole("button", { name, exact: true })
        .locator("text")
        .getAttribute("transform");

    expect(await spin("蓝方 7")).toMatch(/rotate\(-90/);
    expect(await spin("橙方 7")).toMatch(/rotate\(90/);
  });

  test("the whole honeycomb stays on screen at any usable height", async ({
    page,
  }) => {
    await open(page);
    await enter(page);

    for (let h = 400; h <= 940; h += 60) {
      await page.setViewportSize({ width: 390, height: h });
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const svg = document.querySelector("svg[aria-label=内存条]");
              if (!svg) return ["no svg"];
              const out: string[] = [];
              const box = svg.getBoundingClientRect();
              for (const g of svg.querySelectorAll("g")) {
                const r = g.getBoundingClientRect();
                if (r.width < 12 || r.height < 12) out.push(`tiny:${g.getAttribute("aria-label")}`);
                if (r.top < box.top - 1 || r.bottom > box.bottom + 1)
                  out.push(`clipped:${g.getAttribute("aria-label")}`);
              }
              return [...new Set(out)];
            }),
          { timeout: 3000, message: `viewport height ${h}` },
        )
        .toEqual([]);
    }
  });
});
