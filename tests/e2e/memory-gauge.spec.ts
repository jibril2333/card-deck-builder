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
// The phone-on-the-table layout: two zones facing opposite ways, seat-neutral
// names, and a full-height shared track.

test.describe("table mode", () => {
  test("each seat drives its own side of the shared counter", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: /桌面模式/ }).click();

    const blue = page.getByRole("region", { name: "蓝方" });
    const gold = page.getByRole("region", { name: "橙方" });

    // Only the turn player can hand over.
    await expect(blue.getByRole("button", { name: "蓝方结束回合" })).toBeEnabled();
    await expect(gold.getByRole("button", { name: "橙方结束回合" })).toBeDisabled();

    await blue.getByRole("button", { name: "花费 4" }).click();
    await expect(blue.getByLabel("蓝方可用记忆 -4")).toBeVisible();
    // Same counter, read from the other chair — not a second number.
    await expect(gold.getByLabel("橙方可用记忆 4")).toBeVisible();

    await blue.getByRole("button", { name: "蓝方结束回合" }).click();
    await expect(gold.getByRole("button", { name: "橙方结束回合" })).toBeEnabled();
    await expect(blue.getByRole("button", { name: "蓝方结束回合" })).toBeDisabled();

    // 橙方 overshoots by 2 and pushes it back onto 蓝方's side.
    await gold.getByRole("button", { name: "花费 6" }).click();
    await expect(gold.getByLabel("橙方可用记忆 -2")).toBeVisible();
    await expect(blue.getByLabel("蓝方可用记忆 2")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "把记忆条移到 蓝方 2" }),
    ).toHaveAttribute("aria-current", "true");
  });

  test("the far zone is rotated so its player reads it upright", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: /桌面模式/ }).click();
    const spin = (name: string) =>
      page
        .getByRole("region", { name })
        .evaluate((el) => getComputedStyle(el).transform);

    // matrix(-1, 0, 0, -1, 0, 0) is a 180° rotation.
    expect(await spin("橙方")).toBe("matrix(-1, 0, 0, -1, 0, 0)");
    expect(await spin("蓝方")).toBe("none");
  });

  test("the gauge carries over when the mode does", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "−7", exact: true }).click();
    await page.getByRole("button", { name: /桌面模式/ }).click();
    await expect(
      page.getByRole("region", { name: "蓝方" }).getByLabel("蓝方可用记忆 -7"),
    ).toBeVisible();

    await page.getByRole("button", { name: "蓝方退出桌面模式" }).click();
    await expect(readout(page)).toHaveText("-7");
  });

  /**
   * The keypads keep a 36px minimum while their grid track shrinks under them,
   * so on a short screen they OVERLAP rather than overflow — nothing throws,
   * nothing clips, the buttons just sit on top of each other. A layout test
   * that only checked for overflow passed the bug; this one measures the
   * rectangles, across the range a phone can actually be held at.
   */
  test("no keypad rows collide at any usable height", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: /桌面模式/ }).click();

    // Measured after the layout settles, not immediately: the breakpoint runs
    // through matchMedia → React state → re-render, so reading the rectangles
    // in the same tick as the resize measures the OLD layout and reports every
    // button as overlapping every other one.
    const collisions = () =>
      page.evaluate(() => {
        const out: string[] = [];
        for (const sec of document.querySelectorAll("section")) {
          const btns = [...sec.querySelectorAll("button")];
          for (const b of btns) {
            if (b.getBoundingClientRect().height < 24) out.push(`tiny:${b.textContent}`);
          }
          for (let i = 0; i < btns.length; i++) {
            for (let j = i + 1; j < btns.length; j++) {
              const a = btns[i].getBoundingClientRect();
              const c = btns[j].getBoundingClientRect();
              if (
                a.left < c.right - 1 && c.left < a.right - 1 &&
                a.top < c.bottom - 1 && c.top < a.bottom - 1
              ) {
                out.push(`overlap:${btns[i].textContent}/${btns[j].textContent}`);
              }
            }
          }
        }
        return [...new Set(out)];
      });

    for (let h = 360; h <= 940; h += 40) {
      await page.setViewportSize({ width: 390, height: h });
      await expect
        .poll(collisions, { timeout: 3000, message: `viewport height ${h}` })
        .toEqual([]);
    }
  });
});
