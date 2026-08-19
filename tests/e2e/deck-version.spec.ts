/**
 * The deck's version — which pack its list is built for.
 *
 * A label the owner sets, with one shortcut: 按最新的卡, and the same value
 * chosen automatically at import time. The fixture's two packs are ordered
 * against their codes on purpose (BT-01 old, ZZ-03 newest), so anything that
 * sorted by code instead of by release order fails here.
 */
import { expect, test } from "@playwright/test";
import { LEGACY_DECK, VERSION_DECK } from "./fixtures/seed";

const picker = (p: import("@playwright/test").Page) =>
  p.getByLabel("卡组版本");

test("offers the version the cards imply, and remembers what you pick", async ({
  page,
}) => {
  await page.goto(`/digimon/decks/${LEGACY_DECK.id}`);
  const sel = picker(page);
  await expect(sel).toBeVisible();
  // Nothing has been claimed about this deck yet.
  await expect(sel).toHaveValue("");
  // The deck holds BT1-086, so the shortcut names BT-01.
  await expect(sel.locator("option", { hasText: "按最新的卡" })).toHaveText(
    /BT-01/,
  );

  await sel.selectOption("BT-01");
  await page.reload();
  await expect(picker(page)).toHaveValue("BT-01");

  // Clearing it is allowed — a version you can't remove is a version you
  // can't correct.
  await picker(page).selectOption("");
  await page.reload();
  await expect(picker(page)).toHaveValue("");
});

test("says when the list has moved past its label", async ({ page }) => {
  await page.goto(`/digimon/decks/${VERSION_DECK.id}`);
  // The label is what the owner set; the deck is not rewritten to match it.
  await expect(picker(page)).toHaveValue(VERSION_DECK.version);
  await expect(page.getByText(`+${VERSION_DECK.newerCount} 张更新的卡`)).toBeVisible();

  // Following the shortcut clears the warning — and it names BT-01, which is
  // newest by release order and OLDEST by code. Sorting by code would answer
  // ZZ-03 here and leave the deck labelled with a pack it has outgrown.
  await picker(page).selectOption(VERSION_DECK.newerSet);
  await page.reload();
  await expect(picker(page)).toHaveValue(VERSION_DECK.newerSet);
  await expect(page.getByText(/张更新的卡/)).toHaveCount(0);
});

test("an imported list dates itself", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/digimon/decks");
  await page.evaluate(() =>
    navigator.clipboard.writeText("4 BT1-001\n4 BT1-084\n2 BT1-085\n"),
  );

  await page.getByRole("button", { name: /导入/ }).click();
  await page.waitForURL(/\/digimon\/decks\/[a-z0-9-]+/i);

  // Nobody typed a version: it comes from the newest card in what was pasted.
  await expect(picker(page)).toHaveValue("BT-01");
});
