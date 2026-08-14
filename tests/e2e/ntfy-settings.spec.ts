/**
 * The admin page's push-notification settings.
 *
 * The part worth a browser is the token's one-way trip: it goes in, it is
 * never rendered back, and saving with the box empty must not wipe it. That's
 * three round trips through a real server and a real file, which is exactly
 * what a unit test of the parser can't tell you.
 */
import { expect, test } from "@playwright/test";

const panel = (p: import("@playwright/test").Page) =>
  p.getByRole("region", { name: "更新通知" });

test("saves the server and topic, and keeps the token to itself", async ({
  page,
}) => {
  await page.goto("/digimon/admin");
  const box = panel(page);
  await expect(box).toBeVisible();

  // Pasting the full topic URL is what someone copying it out of the ntfy app
  // will do — the topic should come off it rather than being posted as a path.
  await box.getByPlaceholder("https://ntfy.example.com").fill("https://ntfy.e2e.test/dcg");
  await box.getByPlaceholder("tk_…").fill("tk_e2e_secret_value");
  await box.getByRole("checkbox", { name: "启用" }).check();
  await box.getByRole("button", { name: "保存" }).click();
  // Exact: the token hint line also contains the words "已保存".
  await expect(box.getByText("已保存", { exact: true })).toBeVisible();

  await page.reload();
  const back = panel(page);
  await expect(back.getByPlaceholder("https://ntfy.example.com")).toHaveValue(
    "https://ntfy.e2e.test",
  );
  await expect(back.getByPlaceholder("dcg")).toHaveValue("dcg");
  await expect(back.getByRole("checkbox", { name: "启用" })).toBeChecked();

  // The token: a hint, an empty box, and nowhere the real value appears.
  await expect(back).toContainText("tk_e2…alue");
  await expect(back.getByPlaceholder("不改就留空")).toHaveValue("");
  expect(await page.content()).not.toContain("tk_e2e_secret_value");
});

test("saving with the token box empty doesn't wipe the token", async ({ page }) => {
  await page.goto("/digimon/admin");
  const box = panel(page);
  // Only touch the topic, the way you would when fixing a typo.
  await box.getByPlaceholder("dcg").fill("dcg2");
  await box.getByRole("button", { name: "保存" }).click();
  await expect(box.getByText("已保存", { exact: true })).toBeVisible();

  await page.reload();
  await expect(panel(page).getByPlaceholder("dcg")).toHaveValue("dcg2");
  await expect(panel(page)).toContainText("tk_e2…alue");
});

test("won't test unsaved edits, and says why the send failed", async ({ page }) => {
  await page.goto("/digimon/admin");
  const box = panel(page);
  const testBtn = box.getByRole("button", { name: "发送测试通知" });

  await box.getByPlaceholder("dcg").fill("dcg3");
  // Green from a config the refresh isn't going to use would be a lie.
  await expect(testBtn).toBeDisabled();

  // Point it at a closed local port so the failure is real and stays on this
  // machine — no test should be reaching out to someone's ntfy server.
  await box.getByPlaceholder("https://ntfy.example.com").fill("http://127.0.0.1:1");
  await box.getByRole("button", { name: "保存" }).click();
  await expect(box.getByText("已保存", { exact: true })).toBeVisible();
  await expect(testBtn).toBeEnabled();

  await testBtn.click();
  await expect(box.getByText(/发送失败/)).toBeVisible();
});
