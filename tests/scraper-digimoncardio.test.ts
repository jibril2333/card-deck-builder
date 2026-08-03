import { describe, expect, it } from "vitest";
import { toCardRow, type ApiCard } from "@/lib/scraper/digimoncardio";

/**
 * digimoncard.io returns ONE "second effect block" per card and leaves it to
 * the caller to work out what that block actually is. Getting that wrong is
 * invisible in the data and very visible on the card page, so pin all three
 * branches down.
 */
function api(overrides: Partial<ApiCard> = {}): ApiCard {
  return {
    id: "BT1-001",
    name: "Test",
    type: "Digimon",
    level: 3,
    play_cost: 3,
    evolution_cost: null,
    evolution_color: null,
    evolution_level: null,
    xros_req: null,
    color: "Red",
    color2: null,
    digi_type: null,
    digi_type2: null,
    digi_type3: null,
    digi_type4: null,
    form: null,
    dp: 2000,
    attribute: null,
    rarity: "C",
    stage: null,
    artist: null,
    main_effect: "main text",
    source_effect: "second block",
    alt_effect: null,
    series: null,
    pretty_url: null,
    set_name: null,
    ...overrides,
  };
}

describe("toCardRow routes the second effect block by card type", () => {
  it("Digimon → inherited effect", () => {
    const r = toCardRow(api({ type: "Digimon" }));
    expect(r.inherited_effect).toBe("second block");
    expect(r.security_effect).toBe("");
    expect(r.dual_effect).toBe("");
  });

  it("Option → security effect", () => {
    const r = toCardRow(api({ type: "Option" }));
    expect(r.security_effect).toBe("second block");
    expect(r.inherited_effect).toBe("");
    expect(r.dual_effect).toBe("");
  });

  it("Dual → the Option HALF, not an inherited effect", () => {
    // This feed has no field for a second card face, so it appends the whole
    // Option half here. Filing it under inherited_effect is what made all 18
    // Dual cards show their Option text labelled 进化元效果.
    const r = toCardRow(
      api({
        type: "Dual",
        source_effect:
          "Use Requirement: Glowing Dawn trait\r\n[Main] Delete 1 Digimon.",
      }),
    );
    expect(r.dual_effect).toBe(
      "Use Requirement: Glowing Dawn trait\r\n[Main] Delete 1 Digimon.",
    );
    expect(r.inherited_effect).toBe("");
    expect(r.security_effect).toBe("");
  });
});

describe("toCardRow rejects things that aren't card text", () => {
  it("drops raw wiki template markup", () => {
    // digimoncard.io is wiki-derived; 42 cards were displaying the literal
    // string "|applinkdp =" as their inherited effect.
    const r = toCardRow(api({ type: "Digimon", source_effect: "|applinkdp =" }));
    expect(r.inherited_effect).toBe("");
  });

  it("routes a leaked block label to the block it names", () => {
    // When a card has only an inherited effect, io writes it into main_effect
    // with its own label still attached and leaves source_effect empty.
    const r = toCardRow(
      api({
        type: "Digimon",
        main_effect: "Inherited Effect [Your Turn] This Digimon gets +1000 DP.",
        source_effect: "",
      }),
    );
    expect(r.main_effect).toBe("");
    expect(r.inherited_effect).toBe("[Your Turn] This Digimon gets +1000 DP.");
  });
});
