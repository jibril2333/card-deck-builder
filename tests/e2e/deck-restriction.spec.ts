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

  const notice = page.getByRole("status", { name: "禁限提醒" });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("1 处冲突");
  await expect(notice).toContainText("超出上限");
  await expect(notice).toContainText(LEGACY_DECK.code);
  // Says both numbers, so the reader knows how far over they are.
  await expect(notice).toContainText(`${LEGACY_DECK.quantity} / ${LEGACY_DECK.max}`);
  // And says out loud that it hasn't touched anything.
  await expect(notice).toContainText("不会自动修改");

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
  await expect(tile).toContainText("禁限 1");

  // Only that one. If every tile carried the badge it would mean nothing.
  await expect(page.getByText(/^禁限 \d+$/)).toHaveCount(1);
});
