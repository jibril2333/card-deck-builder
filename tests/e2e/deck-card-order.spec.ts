/**
 * What order a deck's cards come out in.
 *
 * The grid, the text export, the PNG and the stats all read the same list, so
 * this is one ORDER BY away from every one of them. It used to be
 * `level NULLS LAST, code`, which got two things wrong: Tamers and Options
 * share a NULL level and so came out as one interleaved pile, and `code` is
 * TEXT, so BT10 sorted before BT2.
 *
 * The fixture carries three cards for exactly this: two Lv.3s whose codes sort
 * one way as text and the other way as numbers, and an Option whose code sorts
 * ahead of both Tamers'. Under the old ORDER BY this list came out
 * BT1-001, BT10-050, BT1-009, BT2-030, BT1-084, BT1-050, BT1-086.
 */
import { expect, test } from "@playwright/test";

test("egg first, then Digimon by level, then Tamers", async ({ page }) => {
  await page.goto("/digimon/decks");
  await page.getByPlaceholder("卡组名").fill("ORDER " + Date.now());
  await page.getByRole("button", { name: /创建/ }).click();
  await page.waitForURL(/\/digimon\/decks\/[a-z0-9-]+/i);
  await page.getByRole("link", { name: /🛠 组建/ }).click();

  // Added in a deliberately unhelpful order: a Tamer first, the egg last.
  const search = page.getByPlaceholder("搜卡加入卡组…");
  for (const name of [
    "Matt Ishida",
    "Sky Fissure",
    "Dune Raptor",
    "Omnimon",
    "Cliff Raptor",
    "Monodramon",
    "Yokomon",
  ]) {
    await search.fill(name);
    const add = page.getByLabel(`加入卡组 ${name}`);
    await add.waitFor();
    await add.click();
    await expect(page.getByLabel(`从卡组减少一张 ${name}`)).toBeVisible();
  }

  await page.goto(page.url().replace(/\?.*$/, ""));
  const codes = await page.locator(".card-code").allInnerTexts();
  const seen = codes.map((c) => c.trim().split(/\s+/)[0]);
  expect(seen).toEqual([
    "BT1-001", // Digi-Egg
    "BT1-009", // Lv.3 — BT1 before BT2 before BT10, read as numbers
    "BT2-030",
    "BT10-050",
    "BT1-084", // Lv.7
    "BT1-086", // Tamer, ahead of the Option despite the higher code
    "BT1-050", // Option
  ]);
});

test("编号 sorts BT2 before BT10, plain and with alt arts expanded", async ({
  page,
}) => {
  // Same defect on the card browser: `ORDER BY code` is a TEXT sort, so the
  // pack number was compared one character at a time.
  //
  // The second URL is the alt-art branch, which builds its ORDER BY from a
  // second string against the CTE — the collection page runs that same query,
  // and it silently kept the old sort when only the first one was fixed.
  for (const url of [
    "/digimon?sort=code",
    "/digimon?sort=code&show_alt_arts=1",
  ]) {
    await page.goto(url);
    const codes = (await page.locator(".card-code").allInnerTexts()).map(
      (t) => t.trim().split(/\s+/)[0],
    );
    expect(codes.length).toBeGreaterThan(3);
    expect(codes.indexOf("BT2-030")).toBeGreaterThan(codes.indexOf("BT1-001"));
    expect(codes.indexOf("BT10-050")).toBeGreaterThan(codes.indexOf("BT2-030"));
  }
});
