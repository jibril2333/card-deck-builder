/**
 * The admin panel's account of which sources are still yielding.
 *
 * The file is written by the scrape scripts in another process, so writing it
 * here is exactly what a run that came back light looks like from the panel's
 * side.
 */
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const DIR = fs.readFileSync("tests/e2e/.datadir", "utf8").trim();
const health = path.join(DIR, "scrape-health.json");

test.afterEach(() => fs.rmSync(health, { force: true }));

test("names the source that came back light, and stays quiet otherwise", async ({
  page,
}) => {
  fs.writeFileSync(
    health,
    JSON.stringify({
      "Cardrush 价格": {
        history: [4400, 4390, 0],
        level: "dead",
        prev: "ok",
        at: new Date().toISOString(),
      },
      裁定: {
        history: [1200, 1210, 1208],
        level: "ok",
        prev: "ok",
        at: new Date().toISOString(),
      },
    }),
  );

  await page.goto("/digimon/admin");
  const panel = page.getByText("抓取来源结果变少").locator("..");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Cardrush 价格");
  await expect(panel).toContainText("0 / 过去 4400");
  // A healthy source is not listed — a green list is one people stop reading.
  await expect(panel).not.toContainText("裁定");

  // Everything healthy: the block is gone entirely, not shown empty.
  fs.writeFileSync(
    health,
    JSON.stringify({
      "Cardrush 价格": {
        history: [4400],
        level: "ok",
        prev: "ok",
        at: new Date().toISOString(),
      },
    }),
  );
  await page.reload();
  await expect(page.getByText("抓取来源结果变少")).toHaveCount(0);
});
