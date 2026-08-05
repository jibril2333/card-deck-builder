import { describe, expect, it } from "vitest";
import {
  buildCardView,
  visibleFields,
  CARD_TYPE_FIELDS,
  FIELD_SOURCE,
} from "@/lib/cards/digimon-fields";
import type { DigimonCard } from "@/lib/db/digimon";
import type { CardTranslation } from "@/lib/db/translations-ddl";

const card = (o: Partial<DigimonCard> = {}): DigimonCard =>
  ({
    id: "x", code: "X-1", name: "Agumon", card_type: "Digimon",
    color: "Red", color2: null, level: 3, play_cost: 3, dp: 2000,
    attribute: "Vaccine", form: "Rookie", stage: "Rookie", digi_types: "Reptile",
    rarity: "C", main_effect: null, security_effect: null, inherited_effect: null,
    source_effect: null, evolution_cost: null, evolution_requirements: null,
    set_names: null, series: null, artist: null, image_url: null, source_url: null,
    dual_name: null, dual_color: null, dual_cost: null, dual_effect: null,
    dual_rule: null, link_dp: null, link_requirement: null, link_effect: null,
    special_rule: null, ...o,
  }) as DigimonCard;

const tr = (o: Partial<CardTranslation> = {}): CardTranslation =>
  ({
    code: "X-1", lang: "ja", name: null, card_type: null, series: null,
    traits: null, form: null, attribute: null, effect_main: null, effect_2: null,
    effect_3: null, evo_cost: null, evo_req: null, dual_name: null,
    dual_effect: null, dual_rule: null, link_requirement: null, link_effect: null,
    special_rule: null, image_url: null, ...o,
  }) as CardTranslation;

describe("buildCardView", () => {
  it("overlays only the fields that are language-specific", () => {
    // The numbers are the same card in any language; overlaying them from a
    // translation row is how a card ends up half-translated.
    const v = buildCardView(
      card(),
      tr({ traits: "爬虫類型", form: "成長期", attribute: "ワクチン種" }),
    );
    expect(v.digi_types).toBe("爬虫類型");
    expect(v.form).toBe("成長期");
    expect(v.stage).toBe("成長期"); // stage mirrors form after the overlay
    expect(v.level).toBe(3);
    expect(v.dp).toBe(2000);
  });

  it("keeps the canonical type even when the displayed one is translated", () => {
    // Layout must never key off a word that changes language.
    const v = buildCardView(card(), tr({ card_type: "デジモン" }));
    expect(v.card_type).toBe("デジモン");
    expect(v.canonical_type).toBe("Digimon");
  });

  it("leaves a field alone when this language has nothing for it", () => {
    const v = buildCardView(card({ digi_types: "Reptile" }), tr({ traits: null }));
    expect(v.digi_types).toBe("Reptile");
  });
});

describe("visibleFields", () => {
  it("shows only what this card type prints", () => {
    // A Tamer has no level, no DP, no form and no attribute.
    const v = buildCardView(
      card({ card_type: "Tamer", level: null, dp: null, form: null, attribute: null }),
      undefined,
    );
    const shown = visibleFields(v);
    expect(shown).toContain("play_cost");
    expect(shown).not.toContain("level");
    expect(shown).not.toContain("form");
  });

  it("still shows a value in a field the type doesn't normally have", () => {
    // BT22-007 is a Digi-Egg that really costs 20. The model describes the
    // usual shape; it must never be able to hide real data.
    const v = buildCardView(card({ card_type: "Digi-Egg", play_cost: 20 }), undefined);
    expect(CARD_TYPE_FIELDS["Digi-Egg"]).not.toContain("play_cost");
    expect(visibleFields(v)).toContain("play_cost");
  });

  it("covers every field key with a source mapping", () => {
    for (const fields of Object.values(CARD_TYPE_FIELDS)) {
      for (const f of fields) expect(FIELD_SOURCE[f]).toBeDefined();
    }
  });
});
