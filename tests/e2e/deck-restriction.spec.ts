/**
 * What a deck does when the banlist moves underneath it.
 *
 * The fixture deck holds 4× BT1-086 and the fixture banlist caps that card at
 * 1 — a state the app itself can't produce (`clampQuantityToRestriction` caps
 * on write), so it's seeded directly. See `seedViolatingDeck`.
 *
 * The thing being asserted is as much what does NOT happen: the deck still
 * holds all four copies afterwards. Reporting is allowed to be loud; editing
 * someone's deck behind their back is not.
 */
import { expect, test } from "@playwright/test";
import { LEGACY_DECK } from "./fixtures/seed";

const DECK_URL = `/digimon/decks/${LEGACY_DECK.id}`;

test("names the cards the banlist disagrees with, and changes nothing", async ({
  page,
}) => {
  await page.goto(DECK_URL);

  const notice = page.getByRole("status", { name: "卡组信息" });
  await expect(notice).toBeVisible();
  // The card, the cap, and what you actually hold — nothing else. The box
  // used to open with a sentence about the banlist and close with a paragraph
  // about clamping; both described the feature rather than this deck.
  await expect(notice).toContainText(LEGACY_DECK.code);
  await expect(notice).toContainText(`限 ${LEGACY_DECK.max}`);
  await expect(notice).toContainText(`现有 ${LEGACY_DECK.quantity}`);

  // The offending card is marked in the grid, not silently trimmed.
  const badge = page.getByTitle("违反现行禁限表");
  await expect(badge).toHaveText(`×${LEGACY_DECK.quantity}`);

  // A reload reads the deck back from the database: still four copies.
  await page.reload();
  await expect(page.getByTitle("违反现行禁限表")).toHaveText(
    `×${LEGACY_DECK.quantity}`,
  );
});

test("marks the affected deck in the deck list", async ({ page }) => {
  await page.goto("/digimon/decks");

  const tile = page.getByRole("link", { name: new RegExp(LEGACY_DECK.name) });
  await expect(tile).toBeVisible();
  await expect(tile.getByRole("img", { name: "不符合禁限表" })).toBeVisible();

  // Only that one. If every tile carried the dot it would mean nothing.
  await expect(page.getByRole("img", { name: "不符合禁限表" })).toHaveCount(1);

  // The other dot is a different problem and reads differently: this deck is
  // 4 cards long, so it is also unfinished.
  await expect(tile.getByRole("img", { name: "缺卡" })).toBeVisible();
});
