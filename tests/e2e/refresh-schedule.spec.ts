/**
 * The automatic refresh's schedule, set from the admin page.
 *
 * The app never runs anything itself — it writes a JSON file that the host's
 * tick script reads (same reason the manual button drops a request file: this
 * container is internet-facing and has no business calling launchctl). So what
 * this checks is the round trip: the form saves, and what comes back is what
 * the host will read.
 */
import { expect, test } from "@playwright/test";

const panel = (p: import("@playwright/test").Page) =>
  p.getByRole("region", { name: "自动更新" });

/**
 * The panel renders "读取中…" until its GET resolves, so the region being
 * visible is not the same as its controls existing. Waiting on 保存 — which
 * only appears after the load — is the difference between passing alone and
 * passing in a full suite run.
 */
async function ready(p: import("@playwright/test").Page) {
  const box = panel(p);
  await expect(box).toBeVisible();
  await expect(box.getByRole("button", { name: "保存" })).toBeVisible();
  return box;
}

test("schedule survives a save and a reload", async ({ page }) => {
  await page.goto("/digimon/admin");
  const box = await ready(page);

  // Manual and automatic are separate sections, which is the point of the
  // feature — one page, two independent stage sets.
  await expect(page.getByRole("heading", { name: "手动更新" })).toBeVisible();

  await box.getByRole("combobox").first().selectOption("daily");
  await box.getByLabel("小时").selectOption("21");
  await box.getByLabel("分钟").selectOption("45");
  // Automatic run skips prices — 67 minutes is a weekly job, not a nightly one.
  await box.getByRole("button", { name: "新卡" }).click();
  await box.getByRole("button", { name: "中/日文" }).click();
  await box.getByRole("button", { name: "保存" }).click();
  await expect(box.getByText(/已保存/)).toBeVisible();

  await page.reload();
  const after = await ready(page);
  await expect(after.getByText("每天 21:45")).toBeVisible();
  await expect(after.getByRole("button", { name: "新卡" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(after.getByRole("button", { name: "价格" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("disabling it says so, and the controls go dead", async ({ page }) => {
  await page.goto("/digimon/admin");
  const box = await ready(page);
  await box.getByRole("checkbox").first().uncheck();
  await expect(box.getByText("已关闭")).toBeVisible();
  await expect(box.getByRole("button", { name: "新卡" })).toBeDisabled();

  await box.getByRole("button", { name: "保存" }).click();
  await expect(box.getByText(/已保存/)).toBeVisible();
  await page.reload();
  await expect((await ready(page)).getByText("已关闭")).toBeVisible();
});
