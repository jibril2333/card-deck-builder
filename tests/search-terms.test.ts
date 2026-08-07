import { describe, expect, it } from "vitest";
import { splitTerms } from "@/lib/search-terms";

/**
 * Every term becomes its own LIKE and all of them must match, so what counts
 * as a separator decides whether a query finds anything at all.
 */
describe("splitTerms", () => {
  it("splits on spaces so each word can match separately", () => {
    // The case this exists for: as one literal, the colon in
    // "Imperialdramon: Dragon Mode" sits between the words and it matched
    // nothing.
    expect(splitTerms("Imperialdramon Dragon")).toEqual([
      "Imperialdramon",
      "Dragon",
    ]);
  });

  it("treats the full-width space as a separator", () => {
    // U+3000 is what a Japanese or Chinese IME inserts. Left in, it reads as
    // an ordinary character and the query matches nothing.
    expect(splitTerms("究極体　ドラゴン")).toEqual(["究極体", "ドラゴン"]);
    expect(splitTerms("红色　进化")).toEqual(["红色", "进化"]);
  });

  it("ignores runs of whitespace and the edges", () => {
    expect(splitTerms("  Agumon   X   ")).toEqual(["Agumon", "X"]);
    expect(splitTerms("a\tb\nc")).toEqual(["a", "b", "c"]);
  });

  it("gives nothing back for nothing", () => {
    expect(splitTerms("")).toEqual([]);
    expect(splitTerms("   ")).toEqual([]);
    expect(splitTerms("　")).toEqual([]);
    expect(splitTerms(undefined)).toEqual([]);
    expect(splitTerms(null)).toEqual([]);
  });

  it("caps the term count", () => {
    const q = Array.from({ length: 40 }, (_, i) => `t${i}`).join(" ");
    expect(splitTerms(q)).toHaveLength(6);
    expect(splitTerms(q)[0]).toBe("t0");
  });

  it("leaves a single term exactly as typed", () => {
    // No trimming inside the word — "X-Antibody" is one term, not two.
    expect(splitTerms("X-Antibody")).toEqual(["X-Antibody"]);
    expect(splitTerms("BT24-031")).toEqual(["BT24-031"]);
  });
});
