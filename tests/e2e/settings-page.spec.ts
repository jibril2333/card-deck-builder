/**
 * The settings page: one address, sections by who you are.
 *
 * Account settings and card-data administration used to be two pages behind
 * two gates. The split followed how the code was protected rather than what
 * the reader came to do — and it meant the account page and the admin page
 * each carried half a set of nav.
 */
import { expect, test } from "@playwright/test";

test("carries both the account sections and the admin panels", async ({
  page,
}) => {
  await page.goto("/digimon/settings");
  await expect(page.getByRole("heading", { name: "设置" })).toBeVisible();
  // Account, for anyone signed in.
  await expect(page.getByRole("heading", { name: "Passkey 登录" })).toBeVisible();
  await expect(page.getByRole("region", { name: "数据搬运" })).toBeVisible();
  // Card data, for admins — the e2e session is one (CDB_ADMIN_EMAILS).
  await expect(page.getByRole("heading", { name: "手动更新" })).toBeVisible();
  await expect(page.getByRole("region", { name: "更新通知" })).toBeVisible();
});

test("the old addresses still land somewhere sensible", async ({ page }) => {
  // /digimon/admin is the tap target of every ntfy notification ever sent, and
  // /account is what the user menu used to point at.
  await page.goto("/digimon/admin");
  await expect(page).toHaveURL(/\/digimon\/settings$/);
  await page.goto("/account");
  await expect(page).toHaveURL(/\/digimon\/settings$/);
});

test("the sidebar offers it to anyone signed in", async ({ page }) => {
  await page.goto("/digimon");
  const link = page.getByRole("link", { name: /设置/ });
  await expect(link.first()).toBeVisible();
  await link.first().click();
  await expect(page).toHaveURL(/\/digimon\/settings$/);
});
