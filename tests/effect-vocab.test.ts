import { describe, expect, it } from "vitest";
import { classifyTag, BARE_REQUIREMENT_RE } from "@/lib/cards/effect-vocab";

describe("classifyTag", () => {
  it("keeps timings and trait references apart in English", () => {
    // Both are written in square brackets, so the bracket can't decide it.
    // Painting every [x] navy put a timing colour on 8000+ trait references.
    expect(classifyTag("[", "On Play")).toBe("timing");
    expect(classifyTag("[", "When Digivolving")).toBe("timing");
    expect(classifyTag("[", "Greymon")).toBe("name");
    expect(classifyTag("[", "X Antibody")).toBe("name");
    expect(classifyTag("[", "Xros Heart")).toBe("name");
  });

  it("treats [Security] as the timing it is, though it's also a trait", () => {
    // "Security" is in the official 279-entry trait vocabulary, so a
    // trait-list-first rule would mislabel 966 timing tags.
    expect(classifyTag("[", "Security")).toBe("timing");
  });

  it("files English's [Digivolve] with Japanese's 〔進化〕, not with timings", () => {
    // Same mechanic, same colour — this is the asymmetry the vocabulary fixes.
    expect(classifyTag("[", "Digivolve")).toBe("special");
    expect(classifyTag("〔", "進化")).toBe("special");
    expect(classifyTag("[", "DNA Digivolve")).toBe("special");
    expect(classifyTag("〔", "ジョグレス")).toBe("special");
  });

  it("reads a keyword bracket as a keyword in any language", () => {
    expect(classifyTag("≪", "ブロッカー")).toBe("keyword");
    expect(classifyTag("《", "阻挡者")).toBe("keyword");
    expect(classifyTag("＜", "Rush")).toBe("keyword");
  });

  it("treats an unlisted 〔〕 as the special family, not a name", () => {
    // 〔〕 is unambiguous in the source, so a new mechanic stays in its family.
    expect(classifyTag("〔", "未知の新機構")).toBe("special");
  });

  it("classifies a CN requirement line wrapped in 【】 as special", () => {
    // 75 of the 95 distinct 【】 values in the Chinese text are these, not
    // timings, and each was rendering as a navy chip holding a whole sentence.
    expect(classifyTag("【", "数码合体-2：“高吼兽”×“弩炮兽”")).toBe("special");
  });

  it("recognizes bracket-less requirement lines by shape, not vocabulary", () => {
    const hit = (s: string) => new RegExp(BARE_REQUIREMENT_RE.source).test(s);
    expect(hit("アセンブリ-6:「ネガーモン」4枚")).toBe(true);
    expect(hit("DigiXros-2: red Lv.4")).toBe(true);
    expect(hit("数码合体-2：“高吼兽”")).toBe(true);
    // Prose that merely contains a keyword must NOT match. Scanning text for
    // vocabulary words chipped 126 of these, plus every "(Draw 1 card…)".
    expect(hit("ジョグレス進化できる")).toBe(false);
    expect(hit("(Draw 1 card from your deck.)")).toBe(false);
    expect(hit("カードがあり、相手のデジモンが")).toBe(false);
  });
});

describe("bugs found by looking at rendered cards", () => {
  it("reads the JP limiter written without に", () => {
    // The JP text uses both spellings — [ターンに1回] 1357 times and
    // [ターン1回] 148 — and the 148 were falling through to italic.
    const lim = /^(?:ターンに?\s*\d+\s*回|(?:每)?回合\s*\d+\s*次|\d+\s*Per Turn)$/i;
    expect(lim.test("ターンに1回")).toBe(true);
    expect(lim.test("ターン1回")).toBe(true);
    expect(lim.test("每回合1次")).toBe(true);
  });

  it("treats 〈…〉 as its own bracket, not the fullwidth ＜…＞", () => {
    // U+3008 is a different character from U+FF1C; it was absent from the
    // tokenizer, leaving 498 tags unstyled. 〈リンク〉 is the JP/CN spelling of
    // what English writes as the orange ＜Link＞.
    expect(classifyTag("〈", "リンク")).toBe("keyword");
    expect(classifyTag("〈", "链接")).toBe("keyword");
  });

  it("leaves a rules note unchipped, as English does", () => {
    // English writes this as a plain "(Rule)" with no chip, so a coloured
    // Japanese chip would be the two languages disagreeing again.
    expect(classifyTag("〈", "ルール")).toBe("name");
    expect(classifyTag("〈", "规则")).toBe("name");
  });
});
