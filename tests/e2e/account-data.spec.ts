/**
 * Export and import from the account page.
 *
 * The unit test (tests/user-transfer.test.ts) drives two separate databases,
 * which is the real scenario. What's checked here is the part a person meets:
 * the file downloads, the picker summarises it before anything is written, and
 * a round trip through the browser puts the deck back.
 */
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const panel = (p: import("@playwright/test").Page) =>
  p.getByRole("region", { name: "数据搬运" });

test("exports a file, and it carries no account", async ({ page }) => {
  await page.goto("/digimon/settings");
  const box = panel(page);
  await expect(box).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    box.getByRole("link", { name: /导出我的数据/ }).click(),
  ]);
  const file = path.join(os.tmpdir(), `cdb-e2e-${Date.now()}.json`);
  await download.saveAs(file);

  const raw = fs.readFileSync(file, "utf8");
  const data = JSON.parse(raw);
  expect(data.format).toBe("cdb-user-export");
  expect(Array.isArray(data.decks)).toBe(true);
  // The whole reason this file is a format and not a database copy.
  expect(raw).not.toContain("password_hash");
  expect(raw).not.toContain("e2e@test.local");
  fs.rmSync(file, { force: true });
});

test("summarises a picked file before importing, then imports it", async ({
  page,
}) => {
  // A file naming one deck and one card the fixture definitely has.
  const file = path.join(os.tmpdir(), `cdb-e2e-in-${Date.now()}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify({
      format: "cdb-user-export",
      version: 1,
      exportedAt: new Date().toISOString(),
      source: { app: "e2e" },
      decks: [
        {
          id: `imported-${Date.now()}`,
          name: "导入进来的卡组",
          notes: null,
          accent_color: "#3b82f6",
          accent_color2: null,
          cover_card_code: null,
          cover_variant: "",
          sort_order: 0,
          pinned: 0,
          version: null,
          locked: 0,
          created_at: "2026-01-01 00:00:00",
          updated_at: "2026-01-01 00:00:00",
          cards: [{ code: "BT1-009", quantity: 3, purchased: 0 }],
          adjustments: [],
        },
      ],
      groups: [],
      collection: [],
      prices: [],
    }),
  );

  await page.goto("/digimon/settings");
  const box = panel(page);
  await box.locator('input[type="file"]').setInputFiles(file);
  // Read in the browser and summarised BEFORE anything is sent.
  await expect(box).toContainText("1 副卡组");
  await expect(box).toContainText("1 条卡片记录");

  await box.getByRole("button", { name: /合并导入/ }).click();
  await expect(box.getByText("导入完成")).toBeVisible();
  await expect(box).toContainText("卡组 新建 1");

  await page.goto("/digimon/decks");
  await expect(page.getByText("导入进来的卡组")).toBeVisible();
  fs.rmSync(file, { force: true });
});

test("refuses a file that isn't one of ours", async ({ page }) => {
  const file = path.join(os.tmpdir(), `cdb-e2e-junk-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify({ hello: "world" }));
  await page.goto("/digimon/settings");
  const box = panel(page);
  await box.locator('input[type="file"]').setInputFiles(file);
  await expect(box.getByText(/不是本站导出的数据/)).toBeVisible();
  // And offers no way to proceed. Matched on the confirm buttons by name:
  // `input[type=file]` maps to role button and takes its accessible name from
  // its label, so a looser /导入/ would match the picker itself.
  await expect(
    box.getByRole("button", { name: /合并导入|清空并导入/ }),
  ).toHaveCount(0);
  fs.rmSync(file, { force: true });
});

test("unauthenticated requests are 401, not 500", async ({ browser }) => {
  // requireUser() throws a plain Error for Server Actions to surface; in a
  // route handler an uncaught throw is a 500, which is what these two returned
  // when they first shipped. "Log in" and "the server broke" are different
  // answers and only one of them is true.
  const anon = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  expect((await anon.request.get("/api/account/export")).status()).toBe(401);
  expect(
    (await anon.request.post("/api/account/import", { data: {} })).status(),
  ).toBe(401);
  await anon.close();
});
