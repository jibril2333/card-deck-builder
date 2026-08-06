import { describe, expect, it } from "vitest";
import { canonicalJpType, JP_CARD_TYPE } from "@/lib/scraper/digimon";

/**
 * `cards.card_type` is what the type filter searches on, and the EN scraper
 * assigns it unconditionally — so when world.digimoncard.com is wrong, its
 * answer used to be final. It calls all twelve of LM-027…038 "Digimon"; they
 * are Options, which is why "Option + Red + cost 3" never returned LM-033.
 * The JP site says オプション, and now gets the last word.
 */
describe("canonicalJpType", () => {
  it("maps every word the JP corpus actually contains", () => {
    // These five are the complete set of distinct values in card_translations
    // (lang='ja') — 4293 rows, nothing else appears.
    expect(canonicalJpType("デジモン")).toBe("Digimon");
    expect(canonicalJpType("オプション")).toBe("Option");
    expect(canonicalJpType("テイマー")).toBe("Tamer");
    expect(canonicalJpType("デジタマ")).toBe("Digi-Egg");
    expect(canonicalJpType("Dual")).toBe("Dual");
  });

  it("is the LM-033 case", () => {
    expect(canonicalJpType("オプション")).toBe("Option");
    expect(canonicalJpType("オプション")).not.toBe("Digimon");
  });

  it("tolerates the whitespace the page markup leaves around the word", () => {
    expect(canonicalJpType(" オプション ")).toBe("Option");
    expect(canonicalJpType("\n\tデジモン\n")).toBe("Digimon");
  });

  it("returns undefined rather than guessing at a word it doesn't model", () => {
    // A new mechanic must not silently retype cards. Undefined means the
    // scraper leaves card_type alone and warns, which is recoverable; a wrong
    // guess overwrites a correct type and is not.
    expect(canonicalJpType("アプモン")).toBeUndefined();
    expect(canonicalJpType("デジモン/オプション")).toBeUndefined();
    expect(canonicalJpType("")).toBeUndefined();
    expect(canonicalJpType(null)).toBeUndefined();
    expect(canonicalJpType(undefined)).toBeUndefined();
  });

  it("only ever produces types the card model knows", () => {
    // Every target must be a key of CARD_TYPE_FIELDS, or the card page falls
    // back to a null canonical_type and renders with no field layout at all.
    const known = ["Digimon", "Option", "Tamer", "Digi-Egg", "Dual"];
    for (const v of Object.values(JP_CARD_TYPE)) expect(known).toContain(v);
  });
});
