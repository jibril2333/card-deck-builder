/**
 * 封存: locked decks the current rules have moved past.
 *
 * A deck you locked and that no longer passes the banlist can't be fixed
 * without unlocking it, and you closed it deliberately — so it stops carrying
 * a red badge through the main list and goes to the bottom instead.
 *
 * Both halves are required. The fixture's LEGACY_DECK violates the banlist but
 * is unlocked, which is exactly the case that must NOT move: it's a deck you
 * are still expected to fix.
 */
import { expect, test } from "@playwright/test";
import { LEGACY_DECK } from "./fixtures/seed";

const section = (p: import("@playwright/test").Page) =>
  p.locator("section").filter({ hasText: /^封存/ });

test("only appears once a non-conforming deck is locked", async ({ page }) => {
  await page.goto("/digimon/decks");
  // Violating but unlocked — no 封存 section at all.
  await expect(section(page)).toHaveCount(0);
  // The tile carries the banlist marker (a dot, labelled) — it's in the main
  // list, not in 封存.
  await expect(page.getByLabel("不符合禁限表")).toHaveCount(1);

  await page.goto(`/digimon/decks/${LEGACY_DECK.id}`);
  await page.getByRole("button", { name: /^🔓 锁定$/ }).click();
  await expect(page.getByRole("button", { name: "🔒 已锁定" })).toBeVisible();

  await page.goto("/digimon/decks");
  const box = section(page);
  await expect(box).toHaveCount(1);
  await expect(box).toContainText(LEGACY_DECK.name);
  // …and it left the main list rather than being listed twice.
  await expect(page.getByRole("link", { name: new RegExp(LEGACY_DECK.name) })).toHaveCount(1);

  // Put the fixture back: unlocking returns it to the ordinary list.
  await page.goto(`/digimon/decks/${LEGACY_DECK.id}`);
  await page.getByRole("button", { name: "🔒 已锁定" }).click();
  await expect(page.getByRole("button", { name: /^🔓 锁定$/ })).toBeVisible();
  await page.goto("/digimon/decks");
  await expect(section(page)).toHaveCount(0);
});
