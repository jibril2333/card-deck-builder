import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The price scrapes cover every card, every run.
 *
 * There was a 72-hour freshness window here, and a test that pinned it. It
 * made a run cheap and the data quietly stale — and it decided a card was done
 * because a row existed for it. When `item_code` was added for the cart
 * script, 3,651 PAO rows kept their prices, never gained a product id, and
 * were skipped on every subsequent run: the feature looked broken with no
 * error anywhere.
 *
 * A source check rather than a behavioural one, because the behaviour is "make
 * ~4,400 requests" and a test has no business doing that. What it pins is the
 * decision: no scraper may quietly narrow its own scope again.
 */
const SCRIPTS = ["scrape-cardrush-prices.ts", "scrape-pao-prices.ts"];

describe("price scrape scope", () => {
  for (const name of SCRIPTS) {
    it(`${name} prices every card`, () => {
      const src = fs.readFileSync(
        path.join(process.cwd(), "scripts", name),
        "utf8",
      );
      // No freshness filter, and no flags that imply one.
      expect(src).not.toMatch(/fetched_at\s*>/);
      expect(src).not.toContain("max-age");
      expect(src).not.toContain("maxAge");
      // The scope still comes from the cards table, not from what happens to
      // be priced already.
      expect(src).toMatch(/FROM cards/);
    });
  }
});
