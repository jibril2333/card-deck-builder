import { describe, expect, it } from "vitest";
import { parseCardrushNameKana } from "@/lib/scraper/cardrush";

/**
 * Shaped like the real listing page: one product per condition grade, the
 * shop's own noise around the reading, and — as actually seen on BT10-090 —
 * one listing whose reading is a typo.
 */
const page = (values: string[]) =>
  values
    .map(
      (v) =>
        `<li><span class="goods_name">x</span><span class="model_number_info model_number"><span class="bracket">[</span><span class="model_number_value">${v}</span><span class="bracket">]</span></span></li>`,
    )
    .join("");

describe("parseCardrushNameKana", () => {
  it("strips the shop's grades and parentheticals", () => {
    expect(
      parseCardrushNameKana(
        page(["〔状態A-〕イシダヤマト", "イシダヤマト(パラレル)"]),
      ),
    ).toBe("イシダヤマト");
  });

  it("takes the spelling the most listings agree on", () => {
    // BT10-090 剣ゼンジロウ is listed both ways; the typo is the minority.
    expect(
      parseCardrushNameKana(
        page(["ツルギゼンジロウ", "〔状態A-〕ツルギゼンジロウ", "ツルギゼンシロウ"]),
      ),
    ).toBe("ツルギゼンジロウ");
  });

  it("ignores anything that isn't a reading", () => {
    // Kanji means it was never a reading; no kana means it is a product code.
    expect(parseCardrushNameKana(page(["石田ヤマト", "BT1-086", ""]))).toBeNull();
    expect(parseCardrushNameKana("<html></html>")).toBeNull();
  });
});
