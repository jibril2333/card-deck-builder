import { describe, expect, it } from "vitest";
import { countActiveFilters } from "@/lib/search-params";

/**
 * The number on the phone's filter button. It used to be the count of chip
 * DEFINITIONS — "15" on a page with nothing filtered — which is the one thing
 * a badge must never be: constant.
 */
describe("countActiveFilters", () => {
  it("counts what was asked for, not where you are", () => {
    expect(countActiveFilters({})).toBe(0);
    expect(countActiveFilters({ page: "3" })).toBe(0);
    expect(countActiveFilters({ q: "agumon", page: "2" })).toBe(1);
    // One key with several values is still one filter — it renders as one chip.
    expect(countActiveFilters({ color: ["Red", "Blue"] })).toBe(1);
    // Sorting is in the same panel and does change what comes back first.
    expect(countActiveFilters({ sort: "-dp" })).toBe(1);
  });

  it("ignores keys that are present but empty", () => {
    expect(countActiveFilters({ q: "" })).toBe(0);
    expect(countActiveFilters({ color: [] })).toBe(0);
    expect(countActiveFilters({ q: "", level_min: "3" })).toBe(1);
  });
});
