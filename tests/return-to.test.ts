import { describe, expect, it } from "vitest";
import { safeReturnTo } from "@/lib/auth/return-to";

/** `?next=` is written by whoever made the link; only this site may come out. */
describe("safeReturnTo", () => {
  it("keeps a path on this site, query and all", () => {
    expect(safeReturnTo("/digimon/collection")).toBe("/digimon/collection");
    expect(safeReturnTo("/digimon/decks?mode=buy")).toBe("/digimon/decks?mode=buy");
  });

  it("refuses anything that leaves the site", () => {
    for (const bad of [
      "https://example.com/login",
      "//example.com",
      "/\\example.com",
      "javascript:alert(1)",
      "example.com",
    ]) {
      expect(safeReturnTo(bad), bad).toBe("/");
    }
  });

  it("goes home when there is nowhere to return to", () => {
    expect(safeReturnTo(undefined)).toBe("/");
    expect(safeReturnTo(null)).toBe("/");
    expect(safeReturnTo("")).toBe("/");
  });
});
