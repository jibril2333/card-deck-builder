import { getDB } from "./connection";
import { isAltArt, stripAltArt } from "@/lib/alt-art";
import { createDeckRepo, OwnershipError } from "./deck-shared";

export type UACard = {
  id: string;
  code: string;
  name: string;
  series: string;
  color: string;
  rarity: string;
  card_type: string;
  energy_cost: number;
  ap_cost: number;
  bp: number;
  trigger_text: string | null;
  effect_text: string | null;
  image_url: string | null;
  source_url: string | null;
  locale: string;
  source: string;
  name_reading: string | null;
};

export type UADeck = {
  id: string;
  name: string;
  format: string;
  notes: string | null;
  accent_color: string;
  /** Optional secondary accent color for dual-color decks. NULL = single. */
  accent_color2: string | null;
  cover_card_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  locale: string;
  source: string;
  locked_series: string | null;
  locked_color: string | null;
  author_nickname: string;
  user_id: string | null;
};

const db = () => getDB("unionarena");

export type UAFilters = {
  q?: string;
  colors?: string[];
  card_types?: string[];
  series_list?: string[];
  rarities?: string[];
  packs?: string[];
  energy_min?: number;
  energy_max?: number;
  ap_min?: number;
  ap_max?: number;
  bp_min?: number;
  bp_max?: number;
  has_trigger?: boolean;
  has_effect?: boolean;
  /** When true, show every printing/alt-art as its own tile (default: collapse to one per card). */
  show_alt_arts?: boolean;
  sort_field?: string;
  sort_dir?: "asc" | "desc";
  limit?: number;
  offset?: number;
};

const SORT_FIELDS: Record<string, string> = {
  code: "code",
  name: "name",
  series: "series",
  energy_cost: "energy_cost",
  ap_cost: "ap_cost",
  bp: "bp",
  rarity: "rarity",
};

export type UASearchRow = UACard & {
  variant_count: number;
  /** Canonical (representative) code for this card's identity — the page all versions link to. */
  base_code: string;
};

export function searchCards(filters: UAFilters = {}): {
  rows: UASearchRow[];
  total: number;
} {
  const where: string[] = [];
  const params: Record<string, unknown> = {};

  if (filters.q) {
    where.push(
      "(name LIKE @q OR name_reading LIKE @q OR code LIKE @q OR effect_text LIKE @q OR trigger_text LIKE @q)",
    );
    params.q = `%${filters.q}%`;
  }

  function addIn(field: string, values: string[] | undefined, paramKey: string) {
    if (!values || values.length === 0) return;
    const keys = values.map((_, i) => `@${paramKey}${i}`);
    where.push(`${field} IN (${keys.join(",")})`);
    values.forEach((v, i) => {
      params[`${paramKey}${i}`] = v;
    });
  }
  addIn("color", filters.colors, "co");
  addIn("card_type", filters.card_types, "ct");
  addIn("series", filters.series_list, "se");
  addIn("rarity", filters.rarities, "ra");

  // Pack code = prefix before '/' in card code (e.g. "EX01BT" from "EX01BT/HTR-1-030_p1")
  if (filters.packs && filters.packs.length) {
    const parts: string[] = [];
    filters.packs.forEach((v, i) => {
      parts.push(`code LIKE @pk${i}`);
      params[`pk${i}`] = `${v}/%`;
    });
    where.push(`(${parts.join(" OR ")})`);
  }

  if (filters.has_effect) {
    where.push("(effect_text IS NOT NULL AND effect_text != '')");
  }

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
  addRange("energy_cost", filters.energy_min, filters.energy_max, "e");
  addRange("ap_cost", filters.ap_min, filters.ap_max, "a");
  addRange("bp", filters.bp_min, filters.bp_max, "b");

  if (filters.has_trigger) {
    where.push("(trigger_text IS NOT NULL AND trigger_text != '')");
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const sortField = filters.sort_field ? SORT_FIELDS[filters.sort_field] : undefined;
  const sortDir = filters.sort_dir === "desc" ? "DESC" : "ASC";
  const orderSql = sortField
    ? `ORDER BY ${sortField} ${sortDir} NULLS LAST, code`
    : `ORDER BY series, code`;

  const limit = filters.limit ?? 60;
  const offset = filters.offset ?? 0;

  // "Card identity" = the code after the pack prefix ('/'), with any parallel
  // suffix (_p1, _p2 …) stripped — e.g. "EX01BT/HTR-1-030_p1" → "HTR-1-030".
  // All printings / alt-arts of the same card share this identity.
  //  - Default: collapse to ONE representative row per identity.
  //  - show_alt_arts: return every version as its own row, but each carries
  //    `base_code` = the representative, so all link to the same detail page.
  // Representative = base printing (non-parallel, non-★, non-Pc, then code).
  const showAll = filters.show_alt_arts === true;
  const AFTER = `substr(code, instr(code,'/')+1)`;
  const IDENT = `CASE WHEN instr(${AFTER}, '_p') > 0 THEN substr(${AFTER}, 1, instr(${AFTER}, '_p') - 1) ELSE ${AFTER} END`;
  const IS_PARALLEL = `CASE WHEN instr(${AFTER}, '_p') > 0 THEN 1 ELSE 0 END`;
  const REP_ORDER = `${IS_PARALLEL}, (CASE WHEN rarity GLOB '*★*' THEN 1 ELSE 0 END), (CASE WHEN rarity LIKE 'Pc%' THEN 1 ELSE 0 END), code`;

  const rows = db()
    .prepare(
      `WITH ranked AS (
         SELECT *,
           COUNT(*) OVER (PARTITION BY ${IDENT}) AS variant_count,
           FIRST_VALUE(code) OVER (PARTITION BY ${IDENT} ORDER BY ${REP_ORDER}) AS base_code,
           ROW_NUMBER() OVER (PARTITION BY ${IDENT} ORDER BY ${REP_ORDER}) AS _rn
         FROM cards
         ${whereSql}
       )
       SELECT * FROM ranked
       ${showAll ? "" : "WHERE _rn = 1"}
       ${orderSql} LIMIT @limit OFFSET @offset`,
    )
    .all({ ...params, limit, offset }) as UASearchRow[];

  const total = (
    db()
      .prepare(
        showAll
          ? `SELECT COUNT(*) as n FROM cards ${whereSql}`
          : `SELECT COUNT(*) as n FROM (SELECT 1 FROM cards ${whereSql} GROUP BY ${IDENT})`,
      )
      .get(params) as { n: number }
  ).n;

  return { rows, total };
}

export function getCardByCode(code: string): UACard | undefined {
  return db()
    .prepare(`SELECT * FROM cards WHERE code = ? LIMIT 1`)
    .get(code) as UACard | undefined;
}

export function getCardById(id: string): UACard | undefined {
  return db()
    .prepare(`SELECT * FROM cards WHERE id = ?`)
    .get(id) as UACard | undefined;
}

export type UAVariant = {
  code: string;
  rarity: string;
  image_url: string | null;
};

/**
 * The "card identity" = the part after the pack prefix ('/'), with any
 * parallel suffix (_p1, _p2, …) stripped. e.g. "EX01BT/HTR-1-030_p1" → "HTR-1-030".
 * All printings / alt-arts of the same card share this identity.
 */
function cardIdentity(code: string): string {
  const afterSlash = code.includes("/")
    ? code.slice(code.indexOf("/") + 1)
    : code;
  return stripAltArt(afterSlash);
}

/**
 * All printings & alt-arts of the same card (same identity), for the image
 * switcher on the card detail page. The given `code` is sorted first.
 */
export function getCardVariants(code: string): UAVariant[] {
  const ident = cardIdentity(code);
  const rows = db()
    .prepare(
      `SELECT code, rarity, image_url FROM cards WHERE code LIKE ? ORDER BY code`,
    )
    .all(`%${ident}%`) as UAVariant[];
  const matches = rows.filter((r) => cardIdentity(r.code) === ident);
  matches.sort((a, b) => {
    if (a.code === code) return -1;
    if (b.code === code) return 1;
    const ap = isAltArt(a.code) ? 1 : 0;
    const bp = isAltArt(b.code) ? 1 : 0;
    return ap - bp || a.code.localeCompare(b.code);
  });
  return matches;
}

export function distinct(col: keyof UACard): string[] {
  return (
    db()
      .prepare(
        `SELECT DISTINCT ${col} as v FROM cards WHERE ${col} IS NOT NULL AND ${col} != '' ORDER BY v`,
      )
      .all() as { v: string }[]
  ).map((r) => r.v);
}

export function distinctNumbers(col: keyof UACard): number[] {
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

export function distinctPacks(): string[] {
  const rows = db()
    .prepare(
      `SELECT DISTINCT substr(code, 1, instr(code, '/') - 1) AS pack
       FROM cards WHERE code LIKE '%/%'
       ORDER BY pack`,
    )
    .all() as { pack: string }[];
  return rows.map((r) => r.pack).filter(Boolean);
}

export function seriesList(): { name: string; count: number }[] {
  return db()
    .prepare(
      `SELECT series as name, COUNT(*) as count FROM cards WHERE series IS NOT NULL AND series != '' GROUP BY series ORDER BY count DESC`,
    )
    .all() as { name: string; count: number }[];
}

// ---- Decks ----

// ────────────────────────────────────────────────────────────────────────
// Deck operations — generic helpers live in `./deck-shared.ts`. Only the
// UA-specific overrides (createDeck's locked_series/locked_color extra
// columns, updateDeckMeta's extra patch keys) stay below.
// ────────────────────────────────────────────────────────────────────────

const deckRepo = createDeckRepo<UACard, UADeck>({
  db,
  deckCardOrderBy: "c.energy_cost, c.code",
  restrictionSource: "unionarena",
  // UA encodes parallels as their own cards rows with _pN suffixes on
  // `cards.code`. Banlist identities collapse all of those into the base
  // code (matches the "※パラレルカード含む" rule).
  identityForCode: (code) => stripAltArt(code),
  // Keep `defaultAccent` in lock-step with the createDeck default below.
  defaultAccent: "#7c3aed",
  // UA official rules: single 作品 (series) + single color per deck. The
  // first card added to an empty deck seeds all three — accent_color,
  // locked_series, locked_color — and from then on the clamp refuses any
  // card that doesn't match the locks. The locks are NOT manually
  // deletable; emptying the deck (removing every card) auto-clears them,
  // which is the only way to switch a deck to a different series/color.
  firstCardSeed: { accent: true, series: true, color: true },
});

export const {
  listDecks,
  listDecksWithCover,
  reorderDecks,
  setDeckCover,
  backfillLockFromCards,
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
  locked_series?: string | null;
  locked_color?: string | null;
}): string {
  const id = crypto.randomUUID();
  db()
    .prepare(
      `INSERT INTO user.decks
         (id, name, format, notes, accent_color, accent_color2, locked_series, locked_color, user_id)
       VALUES (?, ?, 'standard', ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.name,
      input.notes ?? null,
      input.accent_color ?? "#7c3aed",
      input.accent_color2 ?? null,
      input.locked_series ?? null,
      input.locked_color ?? null,
      input.user_id,
    );
  return id;
}

/**
 * Update a deck's editable metadata. Ownership enforced by the WHERE clause —
 * throws `OwnershipError` if no row matches.
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
    locked_series?: string | null;
    locked_color?: string | null;
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
  if (patch.locked_series !== undefined) {
    sets.push("locked_series = ?");
    params.push(patch.locked_series);
  }
  if (patch.locked_color !== undefined) {
    sets.push("locked_color = ?");
    params.push(patch.locked_color);
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
// Card collection (per-user ownership ledger)
//
// UA encodes alt-arts as distinct cards rows (card_id already includes _p1),
// so `variant` is always "" here — same column shape as Digimon, but the
// dimension is collapsed into card_id. No card_images join needed.
// ────────────────────────────────────────────────────────────────────────

export type UACollectionRow = {
  card_id: string;
  code: string;
  name: string;
  series: string;
  color: string;
  rarity: string;
  card_type: string;
  energy_cost: number;
  variant: string;
  image_url: string | null;
  quantity: number;
};

export function listCollection(currentUserId: string): UACollectionRow[] {
  return db()
    .prepare(
      `SELECT
         cc.card_id,
         c.code,
         c.name,
         c.series,
         c.color,
         c.rarity,
         c.card_type,
         c.energy_cost,
         cc.variant,
         c.image_url,
         cc.quantity
       FROM user.card_collection cc
       JOIN cards c ON c.id = cc.card_id
       WHERE cc.user_id = ? AND cc.quantity > 0
       ORDER BY c.series, c.code`,
    )
    .all(currentUserId) as UACollectionRow[];
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
 * UA's variant is always "" so the key is effectively just card_id, but we
 * keep the same shape as Digimon for symmetry.
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
 * Batch fetch of banlist / limited-list restrictions for a set of UA card
 * IDs. The CASE in SQL strips the `_pN` parallel suffix from `cards.code`
 * so a restriction on `UA01BT/CGH-1-083` matches every parallel printing's
 * `card_id` too.
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
         ON r.source = 'unionarena'
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

/** Same shape as digimon.getExternalListings. UA isn't currently scraped
 *  into external_listings (Cardrush doesn't sell UA), but keep symmetry. */
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
 * Batch fetch of third-party market prices. Same shape as digimon.ts.
 * Cardrush doesn't sell UA, so this returns an empty map until a different
 * source is added.
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

