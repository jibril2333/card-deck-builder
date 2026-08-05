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

  it("routes a leaked label in the SECOND field too", () => {
    // EX10-012 and three siblings kept their genuine security effect here,
    // labelled and in the inherited slot, so the page showed it as 进化元效果.
    // world.digimoncard.com omits the block entirely, so nothing else was ever
    // going to correct it.
    const r = toCardRow(
      api({
        type: "Digimon",
        main_effect: "{Hand} [Main] Do the main thing.",
        source_effect: "Security Effect [Security] Do the security thing.",
      }),
    );
    expect(r.main_effect).toBe("{Hand} [Main] Do the main thing.");
    expect(r.security_effect).toBe("[Security] Do the security thing.");
    expect(r.inherited_effect).toBe("");
  });

  it("drops a 'Card Effect(s)' copy of the main effect", () => {
    const r = toCardRow(
      api({
        type: "Digimon",
        main_effect: "[On Play] Official wording.",
        source_effect: "Card Effect(s) [On Play] Stale mirror wording.",
      }),
    );
    expect(r.main_effect).toBe("[On Play] Official wording.");
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

describe("toCardRow respects each card type's own field set", () => {
  it("files a Dual card's cost as the Option-side use cost, not a play cost", () => {
    // The official sites print a Dual card's cost cell as the letter "D" — it
    // cannot be played, only digivolved into. The number this API returns
    // there is the DUAL cost; it matched the official value on all 9 Dual
    // cards both sources carry.
    const r = toCardRow(api({ type: "Dual", play_cost: 4 }));
    expect(r.play_cost).toBeNull();
    expect(r.dual_cost).toBe(4);
  });

  it("leaves an ordinary card's play cost alone", () => {
    const r = toCardRow(api({ type: "Digimon", play_cost: 3 }));
    expect(r.play_cost).toBe(3);
    expect(r.dual_cost).toBeNull();
  });
});

describe("toCardRow separates a Link condition from the digivolve line", () => {
  it("splits the two apart when alt_effect carries both", () => {
    // A Link condition is how the card plugs into another Digimon, not how
    // anything digivolves into it, so it must not end up under 进化条件.
    const r = toCardRow(
      api({
        type: "Digimon",
        alt_effect:
          "[Digivolve] Lv.2 w/[Appmon] trait: Cost 0\r\nLink Requirements [Link] [Appmon] trait: Cost 3\r\n(Plug this card in sideways.)",
      }),
    );
    expect(r.evolution_requirements).toBe(
      "[Digivolve] Lv.2 w/[Appmon] trait: Cost 0",
    );
    expect(r.link_requirement).toBe(
      "[Link] [Appmon] trait: Cost 3\n(Plug this card in sideways.)",
    );
  });

  it("leaves an ordinary digivolve line untouched", () => {
    const r = toCardRow(
      api({ type: "Digimon", alt_effect: "[Digivolve] Lv.4 w/[X] trait: Cost 3" }),
    );
    expect(r.evolution_requirements).toBe("[Digivolve] Lv.4 w/[X] trait: Cost 3");
    expect(r.link_requirement).toBe("");
  });
});

describe("toCardRow files an ACE card's Overflow as a special rule", () => {
  it("keeps Overflow out of the inherited slot", () => {
    // Overflow says what happens when the ACE leaves the field. It's printed
    // in the [Special Rule] block and is never an inherited effect; this API
    // has no such field, so it arrives as the second block.
    const r = toCardRow(
      api({
        type: "Digimon",
        source_effect: "Ace Overflow ＜-4＞ (As this card moves from the field…)",
      }),
    );
    expect(r.inherited_effect).toBe("");
    expect(r.special_rule).toContain("Overflow");
  });

  it("still routes an ordinary second block to the inherited slot", () => {
    const r = toCardRow(
      api({ type: "Digimon", source_effect: "[Your Turn] +1000 DP." }),
    );
    expect(r.inherited_effect).toBe("[Your Turn] +1000 DP.");
    expect(r.special_rule).toBe("");
  });
});
