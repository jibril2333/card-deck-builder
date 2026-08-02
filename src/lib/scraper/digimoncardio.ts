/**
 * Shared client + row mapping for digimoncard.io's public JSON API.
 *
 * Two scripts consume this: `scrape-digimon-digimoncardio.ts` (pull one named
 * set) and `sync-cards.ts` (diff the whole catalogue to discover new cards).
 * The field mapping lives here so the two can never drift apart and write
 * subtly different rows for the same card.
 */

export const DIGIMONCARDIO_API = "https://digimoncard.io/api-public/search";
export const DIGIMONCARDIO_IMG_BASE =
  "https://images.digimoncard.io/images/cards";
const UA = "card-deck-builder/0.1 (digimoncardio)";

export type ApiCard = {
  id: string;
  name: string;
  type: string | null;
  level: number | null;
  play_cost: number | null;
  evolution_cost: number | null;
  evolution_color: string | null;
  evolution_level: number | null;
  xros_req: string | null;
  color: string | null;
  color2: string | null;
  digi_type: string | null;
  digi_type2: string | null;
  digi_type3: string | null;
  digi_type4: string | null;
  form: string | null;
  dp: number | null;
  attribute: string | null;
  rarity: string | null;
  stage: string | null;
  artist: string | null;
  main_effect: string | null;
  source_effect: string | null;
  alt_effect: string | null;
  series: string | null;
  pretty_url: string | null;
  set_name: string[] | string | null;
};

/**
 * Fetch from the API. `query` is the fuzzy `n=` search; an EMPTY query returns
 * the ENTIRE catalogue (~9.7k rows) in one response — there is no result cap
 * and no pagination, which is what makes whole-catalogue diffing practical.
 *
 * Rows are NOT unique by id: every alternate printing of a card comes back as
 * its own row with identical field values, so de-duplicating by id (or letting
 * the upsert collapse them) is safe and order-independent.
 */
export async function fetchCatalogue(query = ""): Promise<ApiCard[]> {
  const res = await fetch(`${DIGIMONCARDIO_API}?n=${encodeURIComponent(query)}`, {
    headers: { "user-agent": UA },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`digimoncard.io HTTP ${res.status}`);
  const rows = (await res.json()) as ApiCard[];
  if (!Array.isArray(rows)) throw new Error("digimoncard.io: unexpected payload");
  return rows;
}

/**
 * Card codes belonging to the CURRENT Digimon Card Game (2020–).
 *
 * The API also carries the late-90s/early-2000s Bandai card games — BO-, DM-,
 * DD- ("DD-001 Tai"), DV- ("DV-001 D-3 Digivice"), MD-, MO-, and a bare `ST-`
 * line with two-digit numbering. Those share our code shape but are a
 * different game entirely, so an unfiltered sync would dump ~620 junk cards
 * into the browser. Modern sets always carry a set NUMBER (ST1-, EX12-, RB1-),
 * which is what separates them from the legacy bare-prefix lines.
 */
export const MODERN_CODE = /^(?:BT|EX|ST|RB|AD)\d+-\d+$|^(?:P|LM)-\d+$/;

export type CardRow = {
  code: string;
  name: string;
  rarity: string;
  card_type: string;
  level: number | null;
  color: string;
  color2: string;
  play_cost: number | null;
  dp: number | null;
  attribute: string;
  form: string;
  stage: string;
  digi_types: string;
  evolution_cost: string;
  evolution_requirements: string;
  main_effect: string;
  security_effect: string;
  inherited_effect: string;
  source_effect: string;
  /** Dual cards only: the Option half. Empty on everything else. */
  dual_effect: string;
  /** Link cards only: what the card does while plugged in. */
  link_requirement: string;
  link_effect: string;
  set_names: string;
  image_url: string;
};

/** Map one API row onto our `cards` columns. */
export function toCardRow(c: ApiCard): CardRow {
  const type = c.type ?? "";
  // The API's `source_effect` is the second effect block, which means the
  // INHERITED effect on Digimon-ish cards but the SECURITY effect on
  // Option/Tamer cards — route it to the right column by card type.
  //
  // Dual (デジモン/オプション) is a third case: the second block is the whole
  // OPTION HALF of the card, not an inherited effect. It reads as one too
  // ("Use Requirement: …", "add 1 to this card's use cost") — filing it under
  // inherited_effect made the card page label it 进化元效果 on all 18 Dual
  // cards. This API has no field for a second card face, so `dual_effect` is
  // the closest true home; the official sites, which DO split the face out
  // properly, overwrite it with better text once they publish the set.
  const secondBlock = c.source_effect ?? "";
  const isOptionOrTamer = type === "Option" || type === "Tamer";
  const isDual = type === "Dual";
  // Link cards hit the same wall from the other side: the second block is what
  // the card does while PLUGGED INTO another Digimon, which is a different
  // thing from what it grants the Digimon it sits under. It announces itself —
  // the condition line always opens with the Link keyword — so it can be
  // recognized without a card list. First line is the condition, rest the
  // effect, exactly as the official JP site splits them.
  const isLink = /^[＜<〈《≪]\s*Link\s*[＞>〉》≫]/.test(secondBlock.trim());
  const linkLines = secondBlock.replace(/\r\n/g, "\n").split("\n");
  // "[Digivolve] Lv.X w/[…]: Cost N" lives in alt_effect (xros_req mirrors it).
  const evoLine = (c.alt_effect || c.xros_req || "").trim();
  // Compose the "Yellow 3 from Lv.4"-style cost line when the structured
  // pieces are present (they often aren't for newer JP/CN sets).
  const evoCost = c.evolution_color
    ? `${c.evolution_color} ${c.evolution_cost ?? ""} from Lv.${c.evolution_level ?? ""}`
        .replace(/\s+/g, " ")
        .trim()
    : "";
  return {
    code: c.id,
    name: c.name ?? "",
    rarity: c.rarity ?? "",
    card_type: type,
    level: c.level ?? null,
    color: c.color ?? "",
    color2: c.color2 ?? "",
    play_cost: c.play_cost ?? null,
    dp: c.dp ?? null,
    attribute: c.attribute ?? "",
    form: c.form ?? "",
    stage: c.stage ?? "",
    digi_types: [c.digi_type, c.digi_type2, c.digi_type3, c.digi_type4]
      .filter((t) => t && t.trim())
      .join(" / "),
    evolution_cost: evoCost,
    evolution_requirements: evoLine,
    main_effect: c.main_effect ?? "",
    security_effect: isOptionOrTamer ? secondBlock : "",
    inherited_effect:
      isOptionOrTamer || isDual || isLink ? "" : secondBlock,
    dual_effect: isDual ? secondBlock : "",
    link_requirement: isLink ? linkLines[0].trim() : "",
    link_effect: isLink ? linkLines.slice(1).join("\n").trim() : "",
    source_effect: "", // legacy column — always empty, matches official scraper
    set_names: Array.isArray(c.set_name)
      ? c.set_name.join("; ")
      : (c.set_name ?? ""),
    image_url: `${DIGIMONCARDIO_IMG_BASE}/${c.id}.jpg`,
  };
}

/** Upsert keyed on the card code (which is also the row id). */
export const UPSERT_CARD_SQL = `
  INSERT INTO cards (
    id, code, name, rarity, card_type, level, color, color2,
    play_cost, dp, attribute, form, stage, digi_types,
    evolution_cost, evolution_requirements,
    main_effect, security_effect, inherited_effect, source_effect,
    set_names, image_url, dual_effect, link_requirement, link_effect
  ) VALUES (
    @code, @code, @name, @rarity, @card_type, @level, @color, @color2,
    @play_cost, @dp, @attribute, @form, @stage, @digi_types,
    @evolution_cost, @evolution_requirements,
    @main_effect, @security_effect, @inherited_effect, @source_effect,
    @set_names, @image_url, @dual_effect, @link_requirement, @link_effect
  )
  -- COALESCE(NULLIF(...)): a source that can't SEE a block must not erase what
  -- another found. The official site has no Link block; this feed has no
  -- [Special Play Condition]. Whichever runs last used to win, blanking the
  -- other's rows — 20 cards lost their Link requirements every scrape.
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name, rarity = excluded.rarity,
    card_type = excluded.card_type, level = excluded.level,
    color = excluded.color, color2 = excluded.color2,
    play_cost = excluded.play_cost, dp = excluded.dp,
    attribute = COALESCE(NULLIF(excluded.attribute, ''), attribute), form = COALESCE(NULLIF(excluded.form, ''), form),
    stage = COALESCE(NULLIF(excluded.stage, ''), stage), digi_types = COALESCE(NULLIF(excluded.digi_types, ''), digi_types),
    evolution_cost = COALESCE(NULLIF(excluded.evolution_cost, ''), evolution_cost),
    evolution_requirements = COALESCE(NULLIF(excluded.evolution_requirements, ''), evolution_requirements),
    main_effect = COALESCE(NULLIF(excluded.main_effect, ''), main_effect),
    security_effect = COALESCE(NULLIF(excluded.security_effect, ''), security_effect),
    -- On a Dual card this feed used to write the Option half here, and the
    -- COALESCE guard then made that wrong value permanent. dual_name is set
    -- only by the official scrapers, so NULL means nothing authoritative has
    -- ever parsed this card and whatever sits in inherited_effect is our own
    -- mis-slotting — clear it. Once an official pass has spoken, its verdict
    -- on the inherited slot stands and this leaves it alone.
    inherited_effect = CASE
      WHEN excluded.card_type = 'Dual' AND dual_name IS NULL THEN NULL
      WHEN excluded.link_requirement <> '' THEN NULL
      ELSE COALESCE(NULLIF(excluded.inherited_effect, ''), inherited_effect)
    END,
    dual_effect = COALESCE(NULLIF(excluded.dual_effect, ''), dual_effect),
    link_requirement = COALESCE(NULLIF(excluded.link_requirement, ''), link_requirement),
    link_effect      = COALESCE(NULLIF(excluded.link_effect, ''), link_effect),
    source_effect = COALESCE(NULLIF(excluded.source_effect, ''), source_effect),
    set_names = COALESCE(NULLIF(excluded.set_names, ''), set_names), image_url = excluded.image_url`;

/** Set prefix of a card code ("EX12-001" → "EX12"), for grouped reporting. */
export function setOf(code: string): string {
  const m = code.match(/^([A-Z]+\d*)-/);
  return m ? m[1] : "?";
}
