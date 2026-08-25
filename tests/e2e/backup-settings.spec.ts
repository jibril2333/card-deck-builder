/**
 * The backup panel: the off-site replica's bucket and key pair.
 *
 * Same one-way trip the ntfy token takes — in, never back out, and not wiped
 * by an unrelated edit — plus the part that makes this panel worth having:
 * it reports what the DAEMON says, not what was typed into it.
 */
import { expect, test } from "@playwright/test";

const panel = (p: import("@playwright/test").Page) =>
  p.getByRole("region", { name: "备份" });

test("saves the bucket, keeps the secret to itself", async ({ page }) => {
  await page.goto("/digimon/settings");
  const box = panel(page);
  await expect(box).toBeVisible();

  // Pasting the endpoint with the bucket on the end is what someone copying
  // from the R2 console will do; the bucket comes off it.
  await box
    .getByPlaceholder("https://<账号ID>.r2.cloudflarestorage.com")
    .fill("https://acc123.r2.cloudflarestorage.com/e2e-bucket");
  await box.getByPlaceholder("digimon-user").fill("e2e-prefix");
  await box.getByLabel("Access Key ID").fill("AKIA_E2E");
  await box.locator('input[type="password"]').fill("e2e_secret_value_1234");
  await box.getByRole("checkbox", { name: "异地备份到 R2" }).check();
  await box.getByRole("button", { name: "保存" }).click();
  await expect(box.getByText("已保存")).toBeVisible();

  await page.reload();
  const back = panel(page);
  await expect(
    back.getByPlaceholder("https://<账号ID>.r2.cloudflarestorage.com"),
  ).toHaveValue("https://acc123.r2.cloudflarestorage.com");
  await expect(back.getByPlaceholder("cdb-backup")).toHaveValue("e2e-bucket");
  await expect(back.getByLabel("Access Key ID")).toHaveValue("AKIA_E2E");

  // The secret: masked, no input to mistake for "cleared", value nowhere.
  await expect(back).toContainText("e2e_…1234");
  // No box to mistake for "cleared" — the masked value and a 更换 button.
  await expect(back.locator('input[type="password"]')).toHaveCount(0);
  await expect(back.getByRole("button", { name: "更换" })).toBeVisible();
  expect(await page.content()).not.toContain("e2e_secret_value_1234");

  // Editing another field can't wipe it.
  await back.getByPlaceholder("cdb-backup").fill("e2e-bucket-2");
  await back.getByRole("button", { name: "保存" }).click();
  await expect(back.getByText("已保存")).toBeVisible();
  await page.reload();
  await expect(panel(page)).toContainText("e2e_…1234");
});

test("says what the daemon says, not what was typed", async ({ page }) => {
  await page.goto("/digimon/settings");
  const box = panel(page);
  // No daemon runs in the e2e server, so there is no status file and the
  // panel must say so rather than implying replication is happening.
  await expect(box).toContainText("读取中…");
  await expect(box.getByText(/正在复制/)).toHaveCount(0);
});
