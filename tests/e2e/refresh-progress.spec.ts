/**
 * The refresh panel while a run is in flight.
 *
 * A run is driven by a daemon outside this process, so the panel's only source
 * is the pair of files in the data directory: `refresh-status.json` (which
 * stage) and `refresh-progress.json` (how far into it). Writing those two is
 * exactly what a running scrape looks like from here.
 */
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Not process.env: a spec runs in a worker with its own fixture directory.
// global-setup leaves the server's here.
const DIR = fs.readFileSync("tests/e2e/.datadir", "utf8").trim();
const status = path.join(DIR, "refresh-status.json");
const progress = path.join(DIR, "refresh-progress.json");
const lock = path.join(DIR, ".refresh.lock");

test.afterEach(() => {
  for (const f of [status, progress]) fs.rmSync(f, { force: true });
  fs.rmSync(lock, { recursive: true, force: true });
});

test("shows which stage, and how far into it", async ({ page }) => {
  fs.writeFileSync(
    status,
    JSON.stringify({
      state: "running",
      message: "prices",
      stages: "cards prices restrictions",
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  );
  fs.writeFileSync(
    progress,
    JSON.stringify({
      script: "scrape-pao-prices",
      done: 1234,
      total: 4402,
      note: "BT15-076",
      updatedAt: new Date().toISOString(),
    }),
  );
  fs.mkdirSync(lock, { recursive: true });

  await page.goto("/digimon/settings");
  await expect(page.getByText("第 2 / 3 项 · 价格与读音")).toBeVisible();
  await expect(page.getByText("1,234 / 4,402 · BT15-076")).toBeVisible();

  // The bar is filled to (1 whole stage + 28% of this one) / 3 ≈ 42%.
  const bar = page.locator("div.bg-\\[var\\(--color-accent\\)\\]").first();
  const width = await bar.evaluate((el) => el.style.width);
  expect(Number.parseFloat(width)).toBeGreaterThan(35);
  expect(Number.parseFloat(width)).toBeLessThan(50);
});

test("no run, no bar", async ({ page }) => {
  await page.goto("/digimon/settings");
  await expect(page.getByText(/第 \d+ \/ \d+ 项/)).toHaveCount(0);
});
