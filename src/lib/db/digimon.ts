import { getDB } from "./connection";
import { createDeckRepo, OwnershipError } from "./deck-shared";
import type { CardTranslation } from "./translations-ddl";
import type { CardLang } from "../card-lang";

export type DigimonCard = {
  id: string;
  code: string;
  name: string;
  card_type: string;
  color: string | null;
  color2: string | null;
  level: number | null;
  play_cost: number | null;
  dp: number | null;
  attribute: string | null;
  form: string | null;
  stage: string | null;
  digi_types: string | null;
  rarity: string | null;
  main_effect: string | null;
  security_effect: string | null;
  inherited_effect: string | null;
  source_effect: string | null;
  evolution_cost: string | null;
  evolution_requirements: string | null;
  set_names: string | null;
  series: string | null;
  artist: string | null;
  image_url: string | null;
  source_url: string | null;
};

export type DigimonDeck = {
  id: string;
  name: string;
  notes: string | null;
  accent_color: string;
  /** Optional secondary accent color for dual-color decks. NULL = single. */
  accent_color2: string | null;
  cover_card_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  user_id: string | null;
};

export type DigimonDeckCard = {
  card_id: string;
  quantity: number;
};

const db = () => getDB("digimon");

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
  sort_field?: string;
  sort_dir?: "asc" | "desc";
  limit?: number;
  offset?: number;
};

const SORT_FIELDS: Record<string, string> = {
  code: "code",
  name: "name",
  level: "level",
  play_cost: "play_cost",
  dp: "dp",
  rarity: "rarity",
};

export type DigimonSearchRow = DigimonCard & {
  variant_count: number;
  /** Image-variant suffix: "" base, "_P1" / "_P2" … (alt arts live in card_images) */
  variant: string;
  /** The image to display for this tile (variant image, or base image_url). */
  display_image: string | null;
};

export function searchCards(filters: DigimonFilters = {}): {
  rows: DigimonSearchRow[];
  total: number;
} {
  const where: string[] = [];
  const params: Record<string, unknown> = {};

  if (filters.q) {
    // Also match translated names/effects (any language) so 「天女兽」 or
    // 「テイルモン」 finds the card regardless of the display language.
    where.push(
      `(name LIKE @q OR code LIKE @q OR main_effect LIKE @q OR inherited_effect LIKE @q OR security_effect LIKE @q OR digi_types LIKE @q
        OR EXISTS (
          SELECT 1 FROM card_translations t
          WHERE t.code = cards.code
            AND (t.name LIKE @q OR t.effect_main LIKE @q OR t.traits LIKE @q)
        ))`,
    );
    params.q = `%${filters.q}%`;
  }

  // Multi-select: build IN clauses with positional placeholders
  function addIn(field: string, values: string[] | undefined, paramKey: string) {
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

  function addRange(field: string, min?: number, max?: number, prefix?: string) {
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
  addRange("play_cost", filters.play_cost_min, filters.play_cost_max, "play_cost");
  addRange("dp", filters.dp_min, filters.dp_max, "dp");

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  // Sort
  const sortField = filters.sort_field
    ? SORT_FIELDS[filters.sort_field]
    : undefined;
  const sortDir = filters.sort_dir === "desc" ? "DESC" : "ASC";
  const orderSql = sortField
    ? `ORDER BY ${sortField} ${sortDir} NULLS LAST, code`
    : `ORDER BY level NULLS LAST, code`;

  const limit = filters.limit ?? 60;
  const offset = filters.offset ?? 0;

  // Alt-art variants live in the card_images table (base + _P1/_P2…).
  //  - Default: ONE tile per card (base image), with variant_count for the badge.
  //  - show_alt_arts: expand to one tile per image variant. Every tile keeps the
  //    same card `code` (variants share it); the page links each to ?v=<variant>.
  const showAll = filters.show_alt_arts === true;
  const VC = `(SELECT COUNT(*) FROM card_images WHERE card_images.code = cards.code)`;

  let rows: DigimonSearchRow[];
  let total: number;

  if (!showAll) {
    rows = db()
      .prepare(
        `SELECT *, '' AS variant, image_url AS display_image,
           ${VC} AS variant_count
         FROM cards ${whereSql} ${orderSql} LIMIT @limit OFFSET @offset`,
      )
      .all({ ...params, limit, offset }) as DigimonSearchRow[];
    total = (
      db()
        .prepare(`SELECT COUNT(*) as n FROM cards ${whereSql}`)
        .get(params) as { n: number }
    ).n;
  } else {
    const orderQualified = sortField
      ? `ORDER BY base.${sortField} ${sortDir} NULLS LAST, base.code, ci.variant`
      : `ORDER BY base.level NULLS LAST, base.code, ci.variant`;
    rows = db()
      .prepare(
        `WITH base AS (SELECT * FROM cards ${whereSql})
         SELECT base.*,
           COALESCE(ci.variant, '') AS variant,
           COALESCE(ci.image_url, base.image_url) AS display_image,
           (SELECT COUNT(*) FROM card_images WHERE card_images.code = base.code) AS variant_count
         FROM base LEFT JOIN card_images ci ON ci.code = base.code
         ${orderQualified} LIMIT @limit OFFSET @offset`,
      )
      .all({ ...params, limit, offset }) as DigimonSearchRow[];
    total = (
      db()
        .prepare(
          `SELECT COUNT(*) as n FROM (SELECT * FROM cards ${whereSql}) base
           LEFT JOIN card_images ci ON ci.code = base.code`,
        )
        .get(params) as { n: number }
    ).n;
  }

  return { rows, total };
}

export function getCardByCode(code: string): DigimonCard | undefined {
  return db()
    .prepare(`SELECT * FROM cards WHERE code = ?`)
    .get(code) as DigimonCard | undefined;
}

// ---- Card translations (CN/JP text from the official sites) ----

/** Full translation row — the card detail page renders every field. */
export function getCardTranslation(
  code: string,
  lang: CardLang,
): CardTranslation | undefined {
  if (lang === "en") return undefined;
  return db()
    .prepare(`SELECT * FROM card_translations WHERE code = ? AND lang = ?`)
    .get(code, lang) as CardTranslation | undefined;
}

/**
 * Display fields (name + localized art) for a batch of codes — used to
 * overlay card grids/lists without changing any query's shape.
 */
export function getDisplayTranslations(
  codes: string[],
  lang: CardLang,
): Map<string, { name: string | null; image_url: string | null }> {
  const out = new Map<string, { name: string | null; image_url: string | null }>();
  if (lang === "en" || codes.length === 0) return out;
  const unique = [...new Set(codes)];
  // SQLite caps host parameters; chunk to stay well under it.
  for (let i = 0; i < unique.length; i += 500) {
    const chunk = unique.slice(i, i + 500);
    const rows = db()
      .prepare(
        `SELECT code, name, image_url FROM card_translations
         WHERE lang = ? AND code IN (${chunk.map(() => "?").join(",")})`,
      )
      .all(lang, ...chunk) as {
      code: string;
      name: string | null;
      image_url: string | null;
    }[];
    for (const r of rows) out.set(r.code, { name: r.name, image_url: r.image_url });
  }
  return out;
}

/**
 * Overlay translated display fields (name / image) onto card-shaped rows,
 * leaving every other field untouched. Pass `keepImage: true` for surfaces
 * pinned to a specific printing's art (collection variants, chosen covers).
 */
export function overlayDisplay<
  T extends { code: string; name: string; image_url?: string | null },
>(rows: T[], lang: CardLang, opts?: { keepImage?: boolean }): T[] {
  if (lang === "en" || rows.length === 0) return rows;
  const map = getDisplayTranslations(rows.map((r) => r.code), lang);
  return rows.map((r) => {
    const t = map.get(r.code);
    if (!t) return r;
    return {
      ...r,
      name: t.name ?? r.name,
      ...(opts?.keepImage
        ? {}
        : { image_url: t.image_url ?? r.image_url ?? null }),
    };
  });
}

export function getCardById(id: string): DigimonCard | undefined {
  return db()
    .prepare(`SELECT * FROM cards WHERE id = ?`)
    .get(id) as DigimonCard | undefined;
}

export type CardImageVariant = {
  variant: string;
  image_url: string;
};

export function getCardImages(code: string): CardImageVariant[] {
  return db()
    .prepare(
      `SELECT variant, image_url FROM card_images WHERE code = ? ORDER BY variant`,
    )
    .all(code) as CardImageVariant[];
}

/** Returns how many image variants each given code has, mapped by code. */
export function getCardImageCounts(
  codes: string[],
): Map<string, number> {
  if (codes.length === 0) return new Map();
  const placeholders = codes.map(() => "?").join(",");
  const rows = db()
    .prepare(
      `SELECT code, COUNT(*) as n FROM card_images WHERE code IN (${placeholders}) GROUP BY code`,
    )
    .all(...codes) as { code: string; n: number }[];
  return new Map(rows.map((r) => [r.code, r.n]));
}

export function distinct(col: keyof DigimonCard): string[] {
  return (
    db()
      .prepare(
        `SELECT DISTINCT ${col} as v FROM cards WHERE ${col} IS NOT NULL AND ${col} != '' ORDER BY v`,
      )
      .all() as { v: string }[]
  ).map((r) => r.v);
}

/**
 * Splits the `set_names` field (which contains multiple set descriptors joined
 * by " | ") into a deduped, sorted list of individual set strings.
 */
export function distinctSetNames(): string[] {
  const rows = db()
    .prepare(
      `SELECT DISTINCT set_names FROM cards WHERE set_names IS NOT NULL AND set_names != ''`,
    )
    .all() as { set_names: string }[];
  const sets = new Set<string>();
  for (const r of rows) {
    for (const part of r.set_names.split(" | ")) {
      const t = part.trim();
      if (t) sets.add(t);
    }
  }
  return [...sets].sort();
}

export function distinctNumbers(col: keyof DigimonCard): number[] {
  return (
    db()
      .prepare(
        `SELECT DISTINCT ${col} as v FROM cards WHERE ${col} IS NOT NULL ORDER BY v ASC`,
      )
      .all() as { v: number }[]
  )
    .map((r) => r.v)
    .filter((n) => Number.isFinite(n));
}

// ---- Decks ----

// ────────────────────────────────────────────────────────────────────────
// Deck operations — generic helpers live in `./deck-shared.ts`. Only the
// game-specific overrides (createDeck's default accent color, the empty
// deck-meta-update shape) stay below.
// ────────────────────────────────────────────────────────────────────────

const deckRepo = createDeckRepo<DigimonCard, DigimonDeck>({
  // Keep `defaultAccent` in lock-step with the createDeck default below.
  defaultAccent: "#f59e0b",
  db,
  deckCardOrderBy: "c.level NULLS LAST, c.code",
  restrictionSource: "digimon",
  // Digimon stores parallel art in card_images keyed off the base code,
  // so cards.code IS the restriction identity — no transformation needed.
  identityForCode: (code) => code,
});

export const {
  listDecks,
  listDecksWithCover,
  reorderDecks,
  setDeckCover,
  listDecksWithCardQty,
  getCompletedDeckIds,
  getDeck,
  getDeckCards,
  getCardPrice,
  setCardPrice,
  deckCardCount,
  deleteDeck,
  setDeckCardQuantity,
  setDeckCardPurchased,
  adjustDeckCardPurchased,
  adjustDeckCard,
  listRestrictions,
  listBannedPairs,
} = deckRepo;

export function createDeck(input: {
  user_id: string;
  name: string;
  notes?: string;
  accent_color?: string;
  accent_color2?: string | null;
}): string {
  const id = crypto.randomUUID();
  db()
    .prepare(
      `INSERT INTO user.decks (id, name, notes, accent_color, accent_color2, user_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.name,
      input.notes ?? null,
      input.accent_color ?? "#f59e0b",
      input.accent_color2 ?? null,
      input.user_id,
    );
  return id;
}

/**
 * Update a deck's editable metadata. The WHERE clause enforces ownership —
 * `currentUserId` must match `decks.user_id`. Throws `OwnershipError` if not.
 *
 * Passing `accent_color2: null` explicitly clears the secondary color
 * (single-color mode). `undefined` leaves it untouched.
 */
export function updateDeckMeta(
  currentUserId: string,
  id: string,
  patch: {
    name?: string;
    notes?: string | null;
    accent_color?: string;
    accent_color2?: string | null;
  },
): void {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.name !== undefined) {
    sets.push("name = ?");
    params.push(patch.name);
  }
  if (patch.notes !== undefined) {
    sets.push("notes = ?");
    params.push(patch.notes);
  }
  if (patch.accent_color !== undefined) {
    sets.push("accent_color = ?");
    params.push(patch.accent_color);
  }
  if (patch.accent_color2 !== undefined) {
    sets.push("accent_color2 = ?");
    params.push(patch.accent_color2);
  }
  if (sets.length === 0) return;
  sets.push("updated_at = CURRENT_TIMESTAMP");
  params.push(id, currentUserId);
  const r = db()
    .prepare(
      `UPDATE user.decks SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`,
    )
    .run(...params);
  if (r.changes === 0) throw new OwnershipError(id);
}

// ────────────────────────────────────────────────────────────────────────
// Card collection (per-user, per-variant ownership ledger)
// ────────────────────────────────────────────────────────────────────────

export type DigimonCollectionRow = {
  card_id: string;
  code: string;
  name: string;
  color: string | null;
  rarity: string | null;
  card_type: string;
  level: number | null;
  variant: string; // "" base, "_P1", "_P2" …
  image_url: string | null;
  quantity: number;
};

/**
 * All collected (qty > 0) cards for the given user, with the image URL of the
 * specific variant joined in. Sorted by code then variant so base art comes
 * before its parallels.
 */
export function listCollection(currentUserId: string): DigimonCollectionRow[] {
  return db()
    .prepare(
      `SELECT
         cc.card_id,
         c.code,
         c.name,
         c.color,
         c.rarity,
         c.card_type,
         c.level,
         cc.variant,
         COALESCE(ci.image_url, c.image_url) AS image_url,
         cc.quantity
       FROM user.card_collection cc
       JOIN cards c ON c.id = cc.card_id
       LEFT JOIN card_images ci
         ON ci.code = c.code AND ci.variant = cc.variant
       WHERE cc.user_id = ? AND cc.quantity > 0
       ORDER BY c.code, cc.variant`,
    )
    .all(currentUserId) as DigimonCollectionRow[];
}

export function getCardCollectionQty(
  currentUserId: string,
  cardId: string,
  variant: string,
): number {
  const r = db()
    .prepare(
      `SELECT quantity FROM user.card_collection
       WHERE user_id = ? AND card_id = ? AND variant = ?`,
    )
    .get(currentUserId, cardId, variant) as
    | { quantity: number }
    | undefined;
  return r?.quantity ?? 0;
}

export function setCardCollectionQuantity(
  currentUserId: string,
  cardId: string,
  variant: string,
  quantity: number,
): void {
  if (quantity <= 0) {
    db()
      .prepare(
        `DELETE FROM user.card_collection
         WHERE user_id = ? AND card_id = ? AND variant = ?`,
      )
      .run(currentUserId, cardId, variant);
    return;
  }
  db()
    .prepare(
      `INSERT INTO user.card_collection (user_id, card_id, variant, quantity)
         VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, card_id, variant) DO UPDATE SET
         quantity = excluded.quantity,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .run(currentUserId, cardId, variant, quantity);
}

export function adjustCardCollection(
  currentUserId: string,
  cardId: string,
  variant: string,
  delta: number,
): number {
  const cur = getCardCollectionQty(currentUserId, cardId, variant);
  const next = Math.max(0, cur + delta);
  setCardCollectionQuantity(currentUserId, cardId, variant, next);
  return next;
}

/**
 * All of the user's collection entries as a Map keyed by `${card_id}|${variant}`.
 * Used by the collection page to inject the owned-quantity into the grid in a
 * single query — instead of one lookup per displayed tile.
 */
export function getCollectionMap(
  currentUserId: string,
): Map<string, number> {
  const rows = db()
    .prepare(
      `SELECT card_id, variant, quantity FROM user.card_collection
       WHERE user_id = ? AND quantity > 0`,
    )
    .all(currentUserId) as {
    card_id: string;
    variant: string;
    quantity: number;
  }[];
  return new Map(rows.map((r) => [`${r.card_id}|${r.variant}`, r.quantity]));
}

export type Restriction = {
  status: "banned" | "limited_1" | "limited_2";
  max_count: number;
};

/**
 * Batch fetch of banlist / limited-list restrictions for a set of card IDs.
 * The CASE in SQL strips any `_pN` suffix from the card code to match how
 * `card_restrictions.identity` is stored (alt-arts collapse onto the base
 * code). For Digimon there's no `_p` in cards.code so the CASE no-ops.
 *
 * Returns a Map keyed by `card_id` → restriction. Cards without a row in
 * `card_restrictions` are omitted (caller treats absence as "standard limit").
 */
export function getRestrictionMap(
  cardIds: string[],
): Map<string, Restriction> {
  if (cardIds.length === 0) return new Map();
  const placeholders = cardIds.map(() => "?").join(",");
  const rows = db()
    .prepare(
      `SELECT c.id, r.status, r.max_count
       FROM cards c
       JOIN card_restrictions r
         ON r.source = 'digimon'
         AND r.identity = CASE
           WHEN instr(c.code, '_p') > 0
             THEN substr(c.code, 1, instr(c.code, '_p') - 1)
           ELSE c.code
         END
       WHERE c.id IN (${placeholders})`,
    )
    .all(...cardIds) as {
    id: string;
    status: Restriction["status"];
    max_count: number;
  }[];
  return new Map(
    rows.map((r) => [r.id, { status: r.status, max_count: r.max_count }]),
  );
}

export type ExternalPrice = {
  price_yen: number;
  in_stock: boolean;
  fetched_at: string;
};

export type ExternalListing = {
  variant_type: "base" | "parallel";
  illustrator: string;
  price_yen: number;
  in_stock: boolean;
};

/**
 * All per-illustrator price entries for a single card, ordered base-first
 * then by ascending price. Used by the detail page to break out distinct
 * printings (e.g. Omnimon's sasasi base vs Tonamikanji re-illustration
 * are both listed as "base" but at wildly different prices).
 */
export function getExternalListings(
  cardId: string,
  source = "cardrush",
): ExternalListing[] {
  const rows = db()
    .prepare(
      `SELECT variant_type, illustrator, price_yen, in_stock
       FROM external_listings
       WHERE source = ? AND card_id = ?
       ORDER BY
         CASE variant_type WHEN 'base' THEN 0 ELSE 1 END,
         price_yen ASC`,
    )
    .all(source, cardId) as {
    variant_type: "base" | "parallel";
    illustrator: string;
    price_yen: number;
    in_stock: number;
  }[];
  return rows.map((r) => ({
    variant_type: r.variant_type,
    illustrator: r.illustrator,
    price_yen: r.price_yen,
    in_stock: r.in_stock === 1,
  }));
}

/**
 * Batch fetch of third-party market prices for a set of card IDs.
 *
 * Returns a Map keyed by `${card_id}|${variant_type}` where `variant_type`
 * is "base" or "parallel". The UI decides which side to surface based on
 * the collection tile's variant — variant "" → base, anything else → parallel.
 *
 * `source` defaults to "cardrush" (the only price source we currently
 * scrape); the schema supports more shops side-by-side once we add them.
 */
export function getExternalPrices(
  cardIds: string[],
  source = "cardrush",
): Map<string, ExternalPrice> {
  if (cardIds.length === 0) return new Map();
  const placeholders = cardIds.map(() => "?").join(",");
  const rows = db()
    .prepare(
      `SELECT card_id, variant_type, price_yen, in_stock, fetched_at
       FROM external_prices
       WHERE source = ? AND card_id IN (${placeholders})`,
    )
    .all(source, ...cardIds) as {
    card_id: string;
    variant_type: string;
    price_yen: number;
    in_stock: number;
    fetched_at: string;
  }[];
  return new Map(
    rows.map((r) => [
      `${r.card_id}|${r.variant_type}`,
      {
        price_yen: r.price_yen,
        in_stock: r.in_stock === 1,
        fetched_at: r.fetched_at,
      },
    ]),
  );
}
