/**
 * What a Digimon card is made of — one declarative model, used by both the
 * card page and the data audit.
 *
 * This replaces a hand-written chain of `translation.x ?? card.y` fallbacks and
 * a render function that listed every field twice. Two things kept going wrong
 * with that shape, and both are structural rather than careless:
 *
 *   1. Which language a field comes from was decided per line, from memory.
 *      Some values are language-specific (effect text, form, traits) and some
 *      are not (level, DP, costs, colours) — mixing them up silently shows one
 *      card's Japanese trait next to its English attribute, which is exactly
 *      what BT9-104 did. FIELD_SOURCE below states it once, and the assembly
 *      is derived from it.
 *
 *   2. Card types don't share a field set. Surveyed against the official JP
 *      site across 520 cards in six sets:
 *
 *        Digimon    colour cost DP digivolve-cost form attribute traits
 *        Digi-Egg   colour form traits           (attribute on Appmon only)
 *        Tamer      colour cost                  (traits on ~60%)
 *        Option     colour cost                  (traits on ~45%)
 *        Dual       the Digimon set + the Option half
 *
 *      Rendering all of them through one template is what produced 形态
 *      D-Reaper on a Tamer and a "Play Cost" on a card whose cost cell reads
 *      "D". CARD_TYPE_FIELDS states the real shape.
 *
 * IMPORTANT: the type model drives ORDER and GROUPING, never suppression. A
 * value present in a field the type doesn't normally have still renders —
 * Digi-Eggs have no cost, yet BT22-007 really costs 20, and a model that hid
 * it would be lying. `visibleFields` puts such a field last and the audit
 * reports it, so the surprise surfaces instead of vanishing.
 */

import type { DigimonCard } from "@/lib/db/digimon";
import type { CardTranslation } from "@/lib/db/translations-ddl";

export type FieldKey =
  | "level"
  | "play_cost"
  | "dp"
  | "form"
  | "attribute"
  | "digi_types"
  | "evolution_cost"
  | "evolution_requirements"
  | "main_effect"
  | "security_effect"
  | "inherited_effect"
  | "source_effect"
  | "special_rule"
  | "dual_name"
  | "dual_color"
  | "dual_cost"
  | "dual_effect"
  | "dual_rule"
  | "link_dp"
  | "link_requirement"
  | "link_effect";

type FieldSource = {
  /** Column on `cards` — the canonical row, in English. */
  base: keyof DigimonCard;
  /**
   * Column on `card_translations`, when the value is language-SPECIFIC.
   *
   * Omitted deliberately for values that are the same in every language:
   * numbers, and the canonical colour run. Overlaying those from a translation
   * row is how a field ends up half-translated.
   */
  translated?: keyof CardTranslation;
};

export const FIELD_SOURCE: Record<FieldKey, FieldSource> = {
  level: { base: "level" },
  play_cost: { base: "play_cost" },
  dp: { base: "dp" },
  form: { base: "form", translated: "form" },
  attribute: { base: "attribute", translated: "attribute" },
  digi_types: { base: "digi_types", translated: "traits" },
  evolution_cost: { base: "evolution_cost", translated: "evo_cost" },
  evolution_requirements: {
    base: "evolution_requirements",
    translated: "evo_req",
  },
  main_effect: { base: "main_effect", translated: "effect_main" },
  security_effect: { base: "security_effect", translated: "effect_2" },
  inherited_effect: { base: "inherited_effect", translated: "effect_3" },
  source_effect: { base: "source_effect" },
  special_rule: { base: "special_rule", translated: "special_rule" },
  dual_name: { base: "dual_name", translated: "dual_name" },
  dual_color: { base: "dual_color" },
  dual_cost: { base: "dual_cost" },
  dual_effect: { base: "dual_effect", translated: "dual_effect" },
  dual_rule: { base: "dual_rule", translated: "dual_rule" },
  link_dp: { base: "link_dp" },
  link_requirement: {
    base: "link_requirement",
    translated: "link_requirement",
  },
  link_effect: { base: "link_effect", translated: "link_effect" },
};

/** Canonical card types, as stored in `cards.card_type`. */
export type CanonicalType =
  "Digimon" | "Digi-Egg" | "Tamer" | "Option" | "Dual";

const TEXT_FIELDS: FieldKey[] = [
  "main_effect",
  "security_effect",
  "inherited_effect",
  "source_effect",
  "special_rule",
];

/**
 * The fields each type's printed cards actually carry, in the order the card
 * prints them. Sourced from the official JP site, not from what our columns
 * happen to hold.
 */
export const CARD_TYPE_FIELDS: Record<CanonicalType, FieldKey[]> = {
  Digimon: [
    "level",
    "play_cost",
    "dp",
    "form",
    "attribute",
    "digi_types",
    "evolution_cost",
    "evolution_requirements",
    ...TEXT_FIELDS,
    "link_dp",
    "link_requirement",
    "link_effect",
  ],
  "Digi-Egg": ["level", "form", "attribute", "digi_types", ...TEXT_FIELDS],
  // No form, no attribute, no DP, no level — a Tamer prints none of them.
  Tamer: ["play_cost", "digi_types", ...TEXT_FIELDS],
  Option: [
    "play_cost",
    "attribute",
    "digi_types",
    ...TEXT_FIELDS,
    "link_dp",
    "link_requirement",
    "link_effect",
  ],
  // A Dual card is a Digimon on top and an Option below. Its cost cell reads
  // "D" rather than a number, so `play_cost` is absent by design; the Option
  // half's own use cost is `dual_cost`.
  Dual: [
    "level",
    "dp",
    "form",
    "attribute",
    "digi_types",
    "evolution_cost",
    "evolution_requirements",
    ...TEXT_FIELDS,
    "dual_name",
    "dual_color",
    "dual_cost",
    "dual_effect",
    "dual_rule",
  ],
};

export function canonicalType(
  t: string | null | undefined,
): CanonicalType | null {
  return t && t in CARD_TYPE_FIELDS ? (t as CanonicalType) : null;
}

/**
 * A card as the page should read it: canonical values overlaid with this
 * language's, field by field, per FIELD_SOURCE.
 *
 * `card_type` here is for DISPLAY (it may be 数码宝贝 or デジモン). Anything
 * deciding structure must use `canonical_type`, which never changes language —
 * keying layout off a translated word is its own bug waiting to happen.
 */
export type CardView = DigimonCard & { canonical_type: CanonicalType | null };

export function buildCardView(
  card: DigimonCard,
  t: CardTranslation | undefined,
): CardView {
  const view = { ...card, canonical_type: canonicalType(card.card_type) };
  if (!t) return view;
  view.card_type = t.card_type ?? card.card_type;
  view.name = t.name ?? card.name;
  for (const src of Object.values(FIELD_SOURCE)) {
    if (!src.translated) continue; // language-independent — leave canonical
    const localized = t[src.translated];
    if (localized === null || localized === undefined || localized === "")
      continue;
    (view[src.base] as unknown) = localized;
  }
  // `stage` mirrors `form` on this game; keep them consistent after overlay so
  // nothing downstream has to know which of the two it should read.
  view.stage = view.form;
  return view;
}

function hasValue(v: unknown): boolean {
  return v !== null && v !== undefined && v !== "";
}

/**
 * Which fields to render, in order: the ones this card type prints, then any
 * OTHER field that still holds a value.
 *
 * The tail is the important half. It's what keeps BT22-007's cost and
 * EX2-007's DP on screen even though Digi-Eggs generally have neither, and
 * what stops the model from quietly becoming a filter.
 */
export function visibleFields(view: CardView): FieldKey[] {
  const declared = view.canonical_type
    ? CARD_TYPE_FIELDS[view.canonical_type]
    : (Object.keys(FIELD_SOURCE) as FieldKey[]);
  const shown = declared.filter((f) => hasValue(view[FIELD_SOURCE[f].base]));
  const extra = (Object.keys(FIELD_SOURCE) as FieldKey[]).filter(
    (f) => !declared.includes(f) && hasValue(view[FIELD_SOURCE[f].base]),
  );
  return [...shown, ...extra];
}
