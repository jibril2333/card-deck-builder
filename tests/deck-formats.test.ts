import { describe, expect, it } from "vitest";
import {
  exportDeckText,
  exportDigimoncardIoUrl,
  parseDeckText,
} from "@/lib/deck-formats";

describe("parseDeckText", () => {
  it("parses qty + code lines", () => {
    const { lines, errors } = parseDeckText(
      [
        "4 BT1-084",
        "3 BT1-086",
        "2 ST1-07",
      ].join("\n"),
    );
    expect(errors).toEqual([]);
    expect(lines).toEqual([
      { qty: 4, code: "BT1-084", name: undefined },
      { qty: 3, code: "BT1-086", name: undefined },
      { qty: 2, code: "ST1-07", name: undefined },
    ]);
  });

  it("parses qty + code + name (canonical export form)", () => {
    const { lines, errors } = parseDeckText(
      [
        "// Mono Red Aggro",
        "",
        "// Egg",
        "4 BT1-001 Botamon",
        "",
        "// Main",
        "4 BT1-084 Greymon",
        "3 BT1-086 Tyrannomon",
      ].join("\n"),
    );
    expect(errors).toEqual([]);
    expect(lines).toEqual([
      { qty: 4, code: "BT1-001", name: "Botamon" },
      { qty: 4, code: "BT1-084", name: "Greymon" },
      { qty: 3, code: "BT1-086", name: "Tyrannomon" },
    ]);
  });

  it('accepts "3x BT1-084" and "3 x BT1-084"', () => {
    const { lines, errors } = parseDeckText(
      ["3x BT1-084", "2 x BT1-085"].join("\n"),
    );
    expect(errors).toEqual([]);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ qty: 3, code: "BT1-084" });
    expect(lines[1]).toMatchObject({ qty: 2, code: "BT1-085" });
  });

  it("uppercases card codes on parse", () => {
    const { lines } = parseDeckText("3 bt1-084");
    expect(lines[0].code).toBe("BT1-084");
  });

  it("accepts alt-art codes with _Px suffix", () => {
    const { lines, errors } = parseDeckText("1 BT1-084_P1");
    expect(errors).toEqual([]);
    expect(lines[0].code).toBe("BT1-084_P1");
  });

  it("reports an error for unparseable lines (and continues)", () => {
    const { lines, errors } = parseDeckText(
      ["4 BT1-084", "nonsense line", "3 BT1-086"].join("\n"),
    );
    expect(lines).toHaveLength(2);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/Line 2/);
  });

  it("ignores comments and section dividers", () => {
    const { lines } = parseDeckText(
      [
        "// deck name",
        "# also a comment",
        "===",
        "---",
        "Eggs:",
        "Main",
        "4 BT1-084 Greymon",
      ].join("\n"),
    );
    expect(lines).toHaveLength(1);
  });
});

describe("exportDeckText / round-trip", () => {
  it("emits '<qty> <name> <code>' (code last), eggs first, no // comments (DCGO)", () => {
    const out = exportDeckText([
      { code: "BT1-084", name: "Greymon", card_type: "Digimon", quantity: 4 },
      { code: "BT1-001", name: "Botamon", card_type: "Digi-Egg", quantity: 4 },
      { code: "BT1-085", name: "MetalGreymon", card_type: "Digimon", quantity: 3 },
    ]);
    // DCGO rejects comments and requires the code as the LAST token.
    expect(out).not.toMatch(/^\s*\/\//m);
    expect(out).toContain("4 Botamon BT1-001");
    expect(out).toContain("4 Greymon BT1-084");
    expect(out).toContain("3 MetalGreymon BT1-085");
    // Every non-blank line must end with the card code.
    for (const ln of out.split("\n").filter((l) => l.trim())) {
      expect(ln).toMatch(/[A-Z]+\d*-\d+(?:_[A-Za-z0-9]+)?$/);
    }
    // Egg card appears before the main-deck cards.
    expect(out.indexOf("BT1-001")).toBeLessThan(out.indexOf("BT1-084"));
  });

  it("round-trips: export -> parse yields the same stacks", () => {
    const cards = [
      { code: "BT1-084", name: "Greymon", card_type: "Digimon", quantity: 4 },
      { code: "BT1-001", name: "Botamon", card_type: "Digi-Egg", quantity: 4 },
      { code: "BT1-085", name: "MetalGreymon", card_type: "Digimon", quantity: 3 },
    ];
    const text = exportDeckText(cards);
    const { lines, errors } = parseDeckText(text);
    expect(errors).toEqual([]);
    const sumByCode = new Map(lines.map((l) => [l.code, l.qty]));
    expect(sumByCode.get("BT1-084")).toBe(4);
    expect(sumByCode.get("BT1-001")).toBe(4);
    expect(sumByCode.get("BT1-085")).toBe(3);
    expect(sumByCode.size).toBe(3);
  });
});

describe("exportDigimoncardIoUrl", () => {
  it("emits the canonical URL format", () => {
    const url = exportDigimoncardIoUrl([
      { code: "BT1-016", name: "x", card_type: "Digimon", quantity: 4 },
      { code: "BT1-010", name: "x", card_type: "Digimon", quantity: 4 },
      { code: "BT1-019", name: "x", card_type: "Digimon", quantity: 3 },
    ]);
    expect(url).toBe(
      "https://digimoncard.io/deckbuilder/?deck=4+BT1-010,4+BT1-016,3+BT1-019",
    );
  });
});
