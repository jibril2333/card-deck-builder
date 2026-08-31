/**
 * No page may point a browser at a card site.
 *
 * The rewrite is applied at each <img>, so the way it breaks is that one new
 * tile somewhere forgets it. This walks the pages that show art and checks
 * every image on them is same-origin, which is the property that actually
 * matters — the reader's IP never reaches the card CDNs.
 */
import { expect, test } from "@playwright/test";

for (const path of ["/digimon", "/digimon/collection", "/digimon/decks"]) {
  test(`every image on ${path} is served by us`, async ({ page }) => {
    await page.goto(path);
    await page.waitForTimeout(500);
    const external = await page.evaluate(() =>
      [...document.querySelectorAll("img")]
        .map((i) => i.getAttribute("src") ?? "")
        .filter((s) => s && !s.startsWith("/") && !s.startsWith("data:")),
    );
    expect(external, external.join("\n")).toEqual([]);
  });
}

test("the proxy serves whitelisted hosts and refuses the rest", async ({
  request,
}) => {
  const bad = await request.get("/card-img/example.com/a.png");
  expect(bad.status()).toBe(403);
  // A host on the list, a path that upstream will not have: the point is that
  // it is attempted at all (502 from upstream), not refused (403) by us.
  const ok = await request.get("/card-img/world.digimoncard.com/nope-404.png");
  expect(ok.status()).toBe(502);
});
