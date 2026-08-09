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
