import { describe, expect, it } from "vitest";
import { kanaVariants, toHiragana, toKatakana, hasKana } from "@/lib/kana";

describe("kanaVariants", () => {
  it("offers the other script for a kana term", () => {
    expect(kanaVariants("あぐもん")).toEqual(["あぐもん", "アグモン"]);
    expect(kanaVariants("アグモン")).toEqual(["アグモン", "あぐもん"]);
  });

  it("converts kana inside a mixed term and leaves the kanji alone", () => {
    // Typed with an IME that has not converted yet: 石田やまと → 石田ヤマト.
    expect(kanaVariants("石田やまと")).toContain("石田ヤマト");
  });

  it("leaves a term with no kana exactly as it is", () => {
    for (const t of ["Agumon", "BT1-001", "暴龙兽", "石田"]) {
      expect(kanaVariants(t)).toEqual([t]);
    }
  });

  it("does not touch the long vowel mark or ASCII", () => {
    expect(toKatakana("ぐれいもん-x")).toBe("グレイモン-x");
    expect(toHiragana("グレイモンACE")).toBe("ぐれいもんACE");
    expect(hasKana("ー")).toBe(false);
  });
});
