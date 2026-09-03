/**
 * Filters → SQL. No database in this file.
 *
 * The query builder was 280 lines inside `searchCards`, so the only way to ask
 * "what does ticking two colours actually do" was to run a search and look at
 * the results. It builds a plan now — two statements and their parameters —
 * and `tests/card-search.test.ts` asks that question directly.
 *
 * The shapes worth knowing before reading:
 *   · Terms are ANDed, and each term is ORed across the columns it may match
 *     (name / code / effects, plus the translated rows). `q_mode: "name"`
 *     narrows that to names and codes.
 *   · Colours INTERSECT — two selected colours mean dual-colour cards only —
 *     while every other multi-select is an IN.
 *   · Ownership is a property of the (card, printing) pair, so it lands in a
 *     different place in each of the two branches.
 *   · Collapsed (default) returns one row per card; `show_alt_arts` joins
 *     card_images and returns one row per printing.
 */
import { splitTerms } from "@/lib/search-terms";
import { kanaVariants } from "@/lib/kana";

export type DigimonFilters = {
  q?: string;
  colors?: string[];
  card_types?: string[];
  rarities?: string[];
  forms?: string[];
  stages?: string[];
  attributes?: string[];
  sets?: string[];
  level_min?: number;
  level_max?: number;
  play_cost_min?: number;
  play_cost_max?: number;
  dp_min?: number;
  dp_max?: number;
  has_inherited?: boolean;
  has_security?: boolean;
  /** If false (default), parallel / alt-art versions are hidden. */
  show_alt_arts?: boolean;
  /** Which language's printings to expand / count. card_images holds a row
   *  per (code, lang, variant), so without this every card multiplies by the
   *  number of languages we have art for. */
  art_lang?: string;
  sort_field?: string;
  sort_dir?: "asc" | "desc";
  limit?: number;
  offset?: number;
  /**
   * Restrict to what this user does — or does not — physically own.
   *
   * The collection page browses all ~4,400 cards so you can tick off what
   * arrives in the post, which leaves no way to look at the shelf itself, or
   * at the holes in it. Needs `owned_by` to mean anything.
   *
   * Ownership is recorded per PRINTING, so with `show_alt_arts` on (which is
   * how the collection page reads it) a parallel you own does not make the
   * base art count as owned.
   */
  owned?: "yes" | "no";
  owned_by?: string;
  /**
   * What `q` is allowed to match.
   *   "all"  (default) — names, codes, every effect block and traits. What the
   *          card browser wants: you go there to find cards BY what they do.
   *   "name" — names and codes only, ranked by how well the name matches. What
   *          the add-a-card pickers want: you already know which card you
   *          mean and are typing its name.
   */
  q_mode?: "all" | "name";
};

/**
 * A card code read as a NUMBER rather than as text.
 *
 * `ORDER BY code` puts BT10 before BT2 and -010 before -002, because "1" < "2"
 * one character at a time. Every list of cards in the app is affected: the
 * browser's 编号 sort, the collection, and the tie-break under every other
 * sort.
 *
 * "BT13-089" splits into "BT" / 13 / 89. rtrim/ltrim take a character SET, not
 * a prefix, which is what separates the letters from the set number without a
 * regex; CAST stops at the first non-digit, which also handles a `_P1` suffix.
 * A code with no "-" (none today) falls through to the plain string at the end.
 */
export function codeNatural(col: string, dir: "ASC" | "DESC" = "ASC"): string {
  const head = `substr(${col}, 1, instr(${col}, '-') - 1)`;
  return [
    // The two TOKEN rows carry no "-" at all; keep them out of the way in
    // both directions rather than letting an empty head float them to the top.
    `CASE WHEN instr(${col}, '-') = 0 THEN 1 ELSE 0 END`,
    `rtrim(${head}, '0123456789') ${dir}`,
    `CAST(ltrim(${head}, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') AS INTEGER) ${dir}`,
    `CAST(substr(${col}, instr(${col}, '-') + 1) AS INTEGER) ${dir}`,
    `${col} ${dir}`,
  ].join(", ");
}

/**
 * How recent the pack a card comes from is — the default order of the card
 * browser and of 已收集, newest pack first.
 *
 * The default used to be `level, code`, so the first screen was every Digi-Egg
 * ever printed. What someone opening the card list actually wants to see is
 * what the newest pack holds.
 *
 * The pack comes off the card's own code (BT26-082 → BT-26) rather than out of
 * `set_names`, because the code is what a reprint keeps: a card printed again
 * in a later pack still belongs, for this purpose, to the one it is numbered
 * for. `card_sets.code` is inconsistently padded — the official dropdown says
 * BT-01 but ST-1 — so both forms are tried.
 *
 * Promos (P-…) and the limited packs (LM-…) carry no pack number in their
 * codes; they resolve to NULL and DESC leaves them at the end, which is where
 * a "what's new" list wants them anyway.
 *
 * `col` MUST be qualified (cards.code / base.code): inside the subquery a bare
 * `code` resolves to card_sets.code, and every row silently comes back NULL.
 */
function setRecency(col: string): string {
  const head = `substr(${col}, 1, instr(${col}, '-') - 1)`;
  const alpha = `rtrim(${head}, '0123456789')`;
  const num = `CAST(ltrim(${head}, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') AS INTEGER)`;
  return `(SELECT s.release_order FROM card_sets s
             WHERE s.code = ${alpha} || '-' || ${num}
                OR s.code = printf('%s-%02d', ${alpha}, ${num}))`;
}

const SORT_FIELDS: Record<string, string> = {
  code: "code",
  name: "name",
  level: "level",
  play_cost: "play_cost",
  dp: "dp",
  rarity: "rarity",
};

/** The two statements a search runs, and what to bind to them. */
export type SearchPlan = {
  /** The page of rows. Bind `params` plus `limit` / `offset`. */
  rowsSql: string;
  /** The unpaged count for the same filters. Bind `params`. */
  countSql: string;
  params: Record<string, unknown>;
  limit: number;
  offset: number;
};

export function buildSearchQuery(filters: DigimonFilters = {}): SearchPlan {
  const where: string[] = [];
  const params: Record<string, unknown> = {};

  const terms = splitTerms(filters.q);

  if (terms.length) {
    // Translated names are matched in BOTH modes, so 「天女兽」 or 「テイルモン」
    // finds the card whatever the display language — that is still someone
    // typing a name, just not in English.
    terms.forEach((term, i) => {
      // A kana term is looked for in both scripts: an IME hands you あぐもん
      // and the card is named アグモン. Together with `name_kana` — the
      // reading of a name written in kanji — that is what makes やがみたいち
      // find 八神太一. `@q{i}` stays the term AS TYPED — the
      // relevance ranking further down is written against it — and the other
      // script, when there is one, comes in as `@q{i}k1`. A term with no kana
      // produces exactly one placeholder, as before.
      const keys = kanaVariants(term).map((v, j) => {
        const key = j === 0 ? `q${i}` : `q${i}k${j}`;
        params[key] = `%${v}%`;
        return `@${key}`;
      });
      /** `col LIKE` against every form of this term. */
      const any = (col: string) =>
        keys.map((k) => `${col} LIKE ${k}`).join(" OR ");
      if (filters.q_mode === "name") {
        where.push(
          `(${any("name")} OR ${any("code")}
            OR EXISTS (
              SELECT 1 FROM card_translations t
              WHERE t.code = cards.code
                AND (${any("t.name")} OR ${any("t.name_kana")})
            ))`,
        );
      } else {
        where.push(
          `(${any("name")} OR ${any("code")} OR ${any("main_effect")} OR ${any("inherited_effect")} OR ${any("security_effect")} OR ${any("digi_types")}
            OR EXISTS (
              SELECT 1 FROM card_translations t
              WHERE t.code = cards.code
                AND (${any("t.name")} OR ${any("t.name_kana")} OR ${any("t.effect_main")} OR ${any("t.traits")})
            ))`,
        );
      }
    });
    params.q_exact = filters.q!.trim();
    params.q_prefix = `${terms[0]}%`;
  }

  // Multi-select: build IN clauses with positional placeholders
  function addIn(
    field: string,
    values: string[] | undefined,
    paramKey: string,
  ) {
    if (!values || values.length === 0) return;
    const keys = values.map((_, i) => `@${paramKey}${i}`);
    where.push(`${field} IN (${keys.join(",")})`);
    values.forEach((v, i) => {
      params[`${paramKey}${i}`] = v;
    });
  }

  // Intersection: a card must have EVERY selected color (in color or color2).
  // Selecting two colors → only cards that are both (dual-color cards).
  if (filters.colors && filters.colors.length) {
    filters.colors.forEach((v, i) => {
      where.push(`(color = @color${i} OR color2 = @color${i})`);
      params[`color${i}`] = v;
    });
  }
  addIn("card_type", filters.card_types, "ct");
  // Rarity match is case-insensitive (DB has both "SEC" and "sec" for same rarity)
  if (filters.rarities && filters.rarities.length) {
    const keys = filters.rarities.map((_, i) => `@ra${i}`);
    where.push(`UPPER(rarity) IN (${keys.join(",")})`);
    filters.rarities.forEach((v, i) => {
      params[`ra${i}`] = v.toUpperCase();
    });
  }
  addIn("form", filters.forms, "fm");
  addIn("stage", filters.stages, "sg");
  addIn("attribute", filters.attributes, "at");

  // set_names is a " | " joined field; match if it contains any selected set
  if (filters.sets && filters.sets.length) {
    const parts: string[] = [];
    filters.sets.forEach((v, i) => {
      parts.push(`set_names LIKE @set${i}`);
      params[`set${i}`] = `%${v}%`;
    });
    where.push(`(${parts.join(" OR ")})`);
  }

  if (filters.has_inherited) {
    where.push("(inherited_effect IS NOT NULL AND inherited_effect != '')");
  }
  if (filters.has_security) {
    where.push("(security_effect IS NOT NULL AND security_effect != '')");
  }
  // Note: Digimon DB has rarity in mixed case (e.g. both "SEC" and "sec") due to
  // multiple scrape sources. They are NOT parallel/alt-art markers — they're the
  // same rarity, just inconsistent casing across data sources. We don't have a
  // reliable alt-art indicator in this dataset, so show_alt_arts is ignored.

  function addRange(
    field: string,
    min?: number,
    max?: number,
    prefix?: string,
  ) {
    if (min !== undefined && Number.isFinite(min)) {
      where.push(`${field} >= @${prefix}_min`);
      params[`${prefix}_min`] = min;
    }
    if (max !== undefined && Number.isFinite(max)) {
      where.push(`${field} <= @${prefix}_max`);
      params[`${prefix}_max`] = max;
    }
  }
  addRange("level", filters.level_min, filters.level_max, "level");
  addRange(
    "play_cost",
    filters.play_cost_min,
    filters.play_cost_max,
    "play_cost",
  );
  addRange("dp", filters.dp_min, filters.dp_max, "dp");

  // Ownership is a property of the (card, printing) pair, so the predicate
  // differs between the two branches below: collapsed rows count a card as
  // owned when ANY of its printings is, expanded rows only when that exact
  // one is. Both are spelled out here; the branches pick one.
  const ownedFilter = filters.owned && filters.owned_by ? filters.owned : null;
  if (ownedFilter) params.owned_by = filters.owned_by;
  const ownsAny = `EXISTS (SELECT 1 FROM user.card_collection cc
        WHERE cc.user_id = @owned_by AND cc.card_id = cards.id
          AND cc.quantity > 0)`;
  const ownsThisPrinting = `EXISTS (SELECT 1 FROM user.card_collection cc
        WHERE cc.user_id = @owned_by AND cc.card_id = base.id
          AND cc.variant = COALESCE(ci.variant, '') AND cc.quantity > 0)`;
  const test = (predicate: string) =>
    ownedFilter === "yes" ? predicate : `NOT ${predicate}`;
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  // Collapsed rows: fold it into the card-level WHERE. Expanded rows: it has
  // to wait until after the join, where the printing is known.
  const collapsedWhereSql = !ownedFilter
    ? whereSql
    : whereSql
      ? `${whereSql} AND ${test(ownsAny)}`
      : `WHERE ${test(ownsAny)}`;
  const printingWhereSql = ownedFilter ? `WHERE ${test(ownsThisPrinting)}` : "";

  // Sort
  const sortField = filters.sort_field
    ? SORT_FIELDS[filters.sort_field]
    : undefined;
  const sortDir: "ASC" | "DESC" = filters.sort_dir === "desc" ? "DESC" : "ASC";

  /**
   * Relevance, for name searches only.
   *
   * Without it the tie-break is level then code, and typing "Agumon" returned
   * ten Pagumon before the first Agumon — Pagumon is a Lv.2 Digi-Egg, so it
   * sorted first, and a substring match treats the two as equally good. An
   * exact name wins, then a name starting with the first term, then a name
   * carrying ALL the terms, then a code, then a match that only came from a
   * translated name.
   *
   * Tier 2 has to re-test every term against the name: the WHERE clause is
   * satisfied if each term matched SOMETHING, and a card whose name holds one
   * term while its code holds the other is a weaker hit than one whose name
   * holds both.
   */
  const nameHasAll = terms.map((_, i) => `name LIKE @q${i}`).join(" AND ");
  const codeHasAll = terms.map((_, i) => `code LIKE @q${i}`).join(" AND ");
  const relevanceSql = `
    CASE
      WHEN name = @q_exact COLLATE NOCASE THEN 0
      WHEN name LIKE @q_prefix THEN 1
      WHEN ${nameHasAll} THEN 2
      WHEN ${codeHasAll} THEN 3
      ELSE 4
    END,`;
  const rank = terms.length && filters.q_mode === "name" ? relevanceSql : "";
  // `code` isn't a column here but four expressions — see codeNatural. Every
  // other sort still falls back to it, so two cards with the same level (or
  // the same cost, or no DP at all) come out in pack order rather than in
  // whatever order the text happened to give.
  const orderSql =
    filters.sort_field === "code"
      ? `ORDER BY ${rank} ${codeNatural("code", sortDir)}`
      : sortField
        ? `ORDER BY ${rank} ${sortField} ${sortDir} NULLS LAST, ${codeNatural("code")}`
        : `ORDER BY ${rank} ${setRecency("cards.code")} DESC NULLS LAST, ${codeNatural("code")}`;

  const limit = filters.limit ?? 60;
  const offset = filters.offset ?? 0;

  // Alt-art variants live in the card_images table (base + _P1/_P2…).
  //  - Default: ONE tile per card (base image), with variant_count for the badge.
  //  - show_alt_arts: expand to one tile per image variant. Every tile keeps the
  //    same card `code` (variants share it); the page links each to ?v=<variant>.
  const showAll = filters.show_alt_arts === true;
  const artLang = filters.art_lang ?? "en";
  params.art_lang = artLang;
  const VC = `(SELECT COUNT(*) FROM card_images
                WHERE card_images.code = cards.code
                  AND card_images.lang = @art_lang)`;

  if (!showAll) {
    return {
      rowsSql: `SELECT *, '' AS variant, image_url AS display_image,
           ${VC} AS variant_count
         FROM cards ${collapsedWhereSql} ${orderSql} LIMIT @limit OFFSET @offset`,
      countSql: `SELECT COUNT(*) as n FROM cards ${collapsedWhereSql}`,
      params,
      limit,
      offset,
    };
  }

  // Same relevance rank as above, qualified for the CTE — otherwise ticking
  // "异画各版本单独显示" would silently lose the ordering.
  const rankQualified =
    terms.length && filters.q_mode === "name"
      ? `
      CASE
        WHEN base.name = @q_exact COLLATE NOCASE THEN 0
        WHEN base.name LIKE @q_prefix THEN 1
        WHEN ${terms.map((_, i) => `base.name LIKE @q${i}`).join(" AND ")} THEN 2
        WHEN ${terms.map((_, i) => `base.code LIKE @q${i}`).join(" AND ")} THEN 3
        ELSE 4
      END,`
      : "";
  const orderQualified =
    filters.sort_field === "code"
      ? `ORDER BY ${rankQualified} ${codeNatural("base.code", sortDir)}, ci.variant`
      : sortField
        ? `ORDER BY ${rankQualified} base.${sortField} ${sortDir} NULLS LAST, ${codeNatural("base.code")}, ci.variant`
        : `ORDER BY ${rankQualified} ${setRecency("base.code")} DESC NULLS LAST, ${codeNatural("base.code")}, ci.variant`;

  return {
    rowsSql: `WITH base AS (SELECT * FROM cards ${whereSql})
         SELECT base.*,
           COALESCE(ci.variant, '') AS variant,
           COALESCE(ci.image_url, base.image_url) AS display_image,
           (SELECT COUNT(*) FROM card_images
             WHERE card_images.code = base.code
               AND card_images.lang = @art_lang) AS variant_count
         FROM base LEFT JOIN card_images ci
           ON ci.code = base.code AND ci.lang = @art_lang
         ${printingWhereSql}
         ${orderQualified} LIMIT @limit OFFSET @offset`,
    countSql: `SELECT COUNT(*) as n FROM (SELECT * FROM cards ${whereSql}) base
           LEFT JOIN card_images ci
             ON ci.code = base.code AND ci.lang = @art_lang
           ${printingWhereSql}`,
    params,
    limit,
    offset,
  };
}
