import { getDB } from "./connection";

export type { DigimonFilters };
import { createDeckRepo, DeckLockedError, OwnershipError } from "./deck-shared";
import {
  buildSearchQuery,
  codeNatural,
  type DigimonFilters,
} from "./card-search";
import { keywordBase, NON_KEYWORDS } from "@/lib/keyword-derive";
import type { CardTranslation } from "./translations-ddl";
import type { CardRuling } from "./rulings-ddl";
import type { CardLang } from "../card-lang";
import { splitSetNames } from "../card-sets";

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
  /** ---- Dual cards (card_type 'Dual') ----------------------------------
   *  Two cards printed on one: everything above describes the Digimon half,
   *  these describe the Option half on the bottom. NULL on every other card.
   *  `dual_color` is a run of canonical colour names ("RedYellow"), the same
   *  shape as `evolution_cost`. */
  dual_name: string | null;
  dual_color: string | null;
  dual_cost: number | null;
  dual_effect: string | null;
  dual_rule: string | null;
  /** ---- Link cards -------------------------------------------------------
   *  What this card contributes while plugged sideways into another Digimon.
   *  `link_dp` is a number so the page reads the same in every language — the
   *  two official sites print it as "DP+2000" and "+2000 DP". */
  link_dp: number | null;
  link_requirement: string | null;
  link_effect: string | null;
  /** [特別ルール] — card-specific rules text (Overflow &c.). */
  special_rule: string | null;
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
  /** 1 = a deck the owner actually plays; floats to the top of the deck list. */
  pinned: number;
  /** Which printing of the cover card to show: '' = base art, else a
   *  `card_images.variant` key such as '_P1'. */
  cover_variant: string;
  /** Pack this list is built for, e.g. 'BT-26'. NULL = never set.
   *  See lib/deck-version — it's a label, nothing enforces it. */
  version: string | null;
  /** 1 = closed to edits. Enforced in the repo, not just the UI. */
  locked: number;
  /** JSON `ImportReport` from the import that made this deck: the cards it
   *  couldn't place. Shown in the deck's info bar until dismissed, then NULL
   *  forever. See lib/import-report. */
  import_report: string | null;
  created_at: string;
  updated_at: string;
  user_id: string | null;
};

export type DigimonDeckCard = {
  card_id: string;
  quantity: number;
};

const db = () => getDB("digimon");

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
  const plan = buildSearchQuery(filters);
  const rows = db()
    .prepare(plan.rowsSql)
    .all({
      ...plan.params,
      limit: plan.limit,
      offset: plan.offset,
    }) as DigimonSearchRow[];
  const total = (db().prepare(plan.countSql).get(plan.params) as { n: number })
    .n;
  return { rows, total };
}

export function getCardByCode(code: string): DigimonCard | undefined {
  return db().prepare(`SELECT * FROM cards WHERE code = ?`).get(code) as
    DigimonCard | undefined;
}

// ---- Card rulings (official Q&A from the JP site) ----

/** Official Q&A for a card, newest first. Empty if the card has no rulings. */
export function getCardRulings(code: string): CardRuling[] {
  return db()
    .prepare(
      `SELECT code, q_number, lang, date, question, answer
       FROM card_rulings WHERE code = ?
       ORDER BY date DESC, q_number DESC`,
    )
    .all(code) as CardRuling[];
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
  const out = new Map<
    string,
    { name: string | null; image_url: string | null }
  >();
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
    for (const r of rows)
      out.set(r.code, { name: r.name, image_url: r.image_url });
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
  const map = getDisplayTranslations(
    rows.map((r) => r.code),
    lang,
  );
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
  return db().prepare(`SELECT * FROM cards WHERE id = ?`).get(id) as
    DigimonCard | undefined;
}

export type CardImageVariant = {
  variant: string;
  image_url: string;
  /** Language the art itself is in — lets the UI flag a non-native fallback. */
  lang: string;
};

/**
 * Alt-art variants for a card, in the requested language.
 *
 * Falls back to English when that language has no art for the card at all (the
 * CN/JP cardlists lag behind on new sets), so the gallery is never empty — but
 * we never MIX languages: a zh page shows zh art, or English art, not both
 * interleaved. Callers can tell which they got from `lang`.
 */
export function getCardImages(code: string, lang = "en"): CardImageVariant[] {
  const stmt = db().prepare(
    `SELECT variant, image_url, lang FROM card_images
      WHERE code = ? AND lang = ? ORDER BY variant`,
  );
  const own = stmt.all(code, lang) as CardImageVariant[];
  if (own.length > 0 || lang === "en") return own;
  return stmt.all(code, "en") as CardImageVariant[];
}

/**
 * Returns how many image variants each given code has, mapped by code.
 * Counted in `lang`, falling back to the English count for codes that have no
 * art in that language (mirrors getCardImages so badges match the gallery).
 */
export function getCardImageCounts(
  codes: string[],
  lang = "en",
): Map<string, number> {
  if (codes.length === 0) return new Map();
  const placeholders = codes.map(() => "?").join(",");
  const count = (l: string) =>
    db()
      .prepare(
        `SELECT code, COUNT(*) as n FROM card_images
          WHERE code IN (${placeholders}) AND lang = ? GROUP BY code`,
      )
      .all(...codes, l) as { code: string; n: number }[];

  const out = new Map(count(lang).map((r) => [r.code, r.n]));
  if (lang !== "en") {
    for (const r of count("en")) if (!out.has(r.code)) out.set(r.code, r.n);
  }
  return out;
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
 * Every individual product name across the whole card pool, deduped + sorted,
 * for the browse page's set filter.
 */
/**
 * Official keyword vocabulary for a language, used by EffectText to chip the
 * keywords that are printed WITHOUT brackets (アセンブリ-6, デジクロス-2).
 * Empty until scrape-digimon-keywords.ts has run; the renderer just skips
 * bare-keyword matching in that case.
 */
export function listKeywords(lang: string): string[] {
  try {
    return (
      db()
        .prepare(`SELECT keyword FROM card_keywords WHERE lang = ?`)
        .all(lang) as { keyword: string }[]
    ).map((r) => r.keyword);
  } catch {
    // Table not created yet (fresh DB, scraper never run).
    return [];
  }
}

/**
 * The keyword table the game-knowledge page prints: every keyword the official
 * English list carries, with the ja / zh spelling worked out from the cards
 * (see keyword-derive) where one could be.
 *
 * The list is scraped, so a new set's keywords are here the day it ships. The
 * Chinese explanation is not scraped — the page merges that in from
 * lib/keywords, and a keyword nobody has written up yet still gets a row.
 *
 * Empty until the 关键词 refresh stage has run.
 */
export function listKeywordGlossary(): {
  /** Null for a keyword only the Japanese list carries. */
  official: string | null;
  ja: string | null;
  zh: string | null;
}[] {
  let official: string[];
  try {
    official = (
      db()
        .prepare(`SELECT keyword FROM card_keywords WHERE lang = 'en'`)
        .all() as { keyword: string }[]
    ).map((r) => keywordBase(r.keyword));
  } catch {
    // Table not created yet (fresh DB, scraper never run).
    return [];
  }
  // Its own try: the names are filled by the same stage but a version behind
  // it, and a database that has the vocabulary without the pairings should
  // still list every keyword — just in English only.
  let names = new Map<string, { ja: string | null; zh: string | null }>();
  try {
    names = new Map(
      (
        db().prepare(`SELECT official, ja, zh FROM keyword_names`).all() as {
          official: string;
          ja: string | null;
          zh: string | null;
        }[]
      ).map((r) => [r.official, r]),
    );
  } catch {
    // Not scraped since this feature shipped; names stay empty.
  }
  {
    const seen = new Set<string>();
    const out: {
      official: string | null;
      ja: string | null;
      zh: string | null;
    }[] = [];
    for (const k of official) {
      if (!k || NON_KEYWORDS.has(k) || seen.has(k)) continue;
      seen.add(k);
      const n = names.get(k);
      out.push({ official: k, ja: n?.ja ?? null, zh: n?.zh ?? null });
    }

    // Japan gets sets first, so its list carries keywords the English one has
    // not heard of — アセンブリ among them. Those go in with no English name
    // rather than being dropped for lacking one.
    const paired = new Set(
      [...names.values()].map((n) => n.ja).filter((x): x is string => !!x),
    );
    let ja: string[] = [];
    try {
      ja = (
        db()
          .prepare(`SELECT keyword FROM card_keywords WHERE lang = 'ja'`)
          .all() as { keyword: string }[]
      ).map((r) => keywordBase(r.keyword));
    } catch {
      ja = [];
    }
    for (const k of ja) {
      if (!k || NON_KEYWORDS.has(k) || paired.has(k) || seen.has(k)) continue;
      seen.add(k);
      out.push({ official: null, ja: k, zh: null });
    }

    return out.sort((a, b) =>
      (a.official ?? a.ja ?? "").localeCompare(b.official ?? b.ja ?? ""),
    );
  }
}

export function distinctSetNames(): string[] {
  const rows = db()
    .prepare(
      `SELECT DISTINCT set_names FROM cards WHERE set_names IS NOT NULL AND set_names != ''`,
    )
    .all() as { set_names: string }[];
  const sets = new Set<string>();
  for (const r of rows) {
    for (const part of splitSetNames(r.set_names)) sets.add(part);
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
  /**
   * The order a deck's cards are read in — the grid, the text export, the
   * image export and the stats all take it from here.
   *
   * Two things were wrong with `level NULLS LAST, code`:
   *
   *  - Tamers and Options both have a NULL level, so they landed in one pile
   *    sorted by code and interleaved with each other. They're the two groups
   *    a player counts separately.
   *  - `code` is TEXT, so BT10 sorted before BT2 and -010 before -002. A deck
   *    holding several sets read as if it had been shuffled.
   *
   * So: eggs, then Digimon by level, then Tamers, then Options — the order the
   * text export already used for its two halves and the one a decklist is
   * written in. Inside a group, the card number read as a NUMBER: the letters
   * of the set, then the set's number, then the card's.
   *
   * rtrim/ltrim with a character SET (not a prefix) is what splits "BT13" into
   * "BT" and 13 without regex; CAST stops at the first non-digit, which also
   * takes care of a `_P1` suffix.
   */
  deckCardOrderBy: `
    CASE c.card_type
      WHEN 'Digi-Egg' THEN 0
      WHEN 'Tamer' THEN 2
      WHEN 'Option' THEN 3
      ELSE 1
    END,
    c.level NULLS LAST,
    ${codeNatural("c.code")}`,
  restrictionSource: "digimon",
  // Digimon stores parallel art in card_images keyed off the base code,
  // so cards.code IS the restriction identity — no transformation needed.
  identityForCode: (code) => code,
});

export const {
  listDecks,
  listDecksWithCover,
  reorderDecks,
  setDeckPinned,
  setDeckLocked,
  isDeckLocked,
  setDeckCoverVariant,
  listDeckAdjustments,
  addDeckAdjustment,
  removeDeckAdjustment,
  setDeckAdjustmentNote,
  setDeckAdjustmentQuantity,
  selfDeclaredCopyLimit,
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
  listGroups,
  getGroup,
  createGroup,
  renameGroup,
  deleteGroup,
  setGroupDecks,
  setDeckGroups,
  getGroupPool,
  groupMemberDeckIds,
  decksSharingPoolWith,
  pooledOwnedForCard,
  maxNeedForCard,
  reconcilePoolCard,
} = deckRepo;

export function createDeck(input: {
  user_id: string;
  name: string;
  notes?: string;
  accent_color?: string;
  accent_color2?: string | null;
  /** Serialized `ImportReport` — only the importer sets this. */
  import_report?: string | null;
}): string {
  const id = crypto.randomUUID();
  db()
    .prepare(
      `INSERT INTO user.decks (id, name, notes, accent_color, accent_color2, user_id, import_report)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.name,
      input.notes ?? null,
      input.accent_color ?? "#f59e0b",
      input.accent_color2 ?? null,
      input.user_id,
      input.import_report ?? null,
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
    /** Pack code from `card_sets`, or null to clear. See lib/deck-version. */
    version?: string | null;
    /** Only ever set to null, by the 知道了 button on the info bar. */
    import_report?: string | null;
  },
): void {
  // Name, notes, colours and version are all "the deck", so a lock covers
  // them too — see assertUnlocked in deck-shared.
  if (isDeckLocked(id)) throw new DeckLockedError(id);
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
  if (patch.version !== undefined) {
    sets.push("version = ?");
    params.push(patch.version);
  }
  if (patch.import_report !== undefined) {
    sets.push("import_report = ?");
    params.push(patch.import_report);
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
    .get(currentUserId, cardId, variant) as { quantity: number } | undefined;
  return r?.quantity ?? 0;
}

/**
 * Copies of one card on the user's shelf, and how they are split between
 * printings. The card page shows the total and names the parallels, which is
 * the one place where "3 张,其中 P1 一张" is worth the words.
 */
export function getCardOwnership(
  currentUserId: string,
  cardId: string,
): { total: number; byVariant: { variant: string; quantity: number }[] } {
  const rows = db()
    .prepare(
      `SELECT variant, quantity FROM user.card_collection
       WHERE user_id = ? AND card_id = ? AND quantity > 0
       ORDER BY variant`,
    )
    .all(currentUserId, cardId) as { variant: string; quantity: number }[];
  return {
    total: rows.reduce((n, r) => n + r.quantity, 0),
    byVariant: rows,
  };
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
 * How many copies of each card the user owns, summed across printings.
 *
 * The collection is recorded per printing — a base art and its parallel are
 * separate rows — but a deck slot doesn't care which art fills it, so the
 * deck page wants one number per card. Hence the SUM.
 */
export function getOwnedCounts(currentUserId: string): Map<string, number> {
  const rows = db()
    .prepare(
      `SELECT card_id, SUM(quantity) AS n FROM user.card_collection
       WHERE user_id = ? AND quantity > 0
       GROUP BY card_id`,
    )
    .all(currentUserId) as { card_id: string; n: number }[];
  return new Map(rows.map((r) => [r.card_id, r.n]));
}

/**
 * All of the user's collection entries as a Map keyed by `${card_id}|${variant}`.
 * Used by the collection page to inject the owned-quantity into the grid in a
 * single query — instead of one lookup per displayed tile.
 */
export function getCollectionMap(currentUserId: string): Map<string, number> {
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
export function getRestrictionMap(cardIds: string[]): Map<string, Restriction> {
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
 * One shop's own quote for each card — price, stock and the shop's product id.
 *
 * Not the same question as `getExternalPrices`/the deck's `market_price`,
 * which answer "what is this card worth" by taking the cheapest quote across
 * shops. The cart is PAO's cart: what it needs is PAO's listing for every card
 * PAO stocks, including the ones where Cardrush happens to be cheaper.
 * Conflating the two silently dropped those cards from the cart script.
 *
 * Base printings only, matching what the cart script buys.
 */
export function getShopQuotes(
  cardIds: string[],
  source: string,
): Map<
  string,
  { price_yen: number; in_stock: boolean; item_code: string | null }
> {
  if (cardIds.length === 0) return new Map();
  const placeholders = cardIds.map(() => "?").join(",");
  const rows = db()
    .prepare(
      `SELECT card_id, price_yen, in_stock, item_code
         FROM external_prices
        WHERE source = ? AND variant_type = 'base'
          AND card_id IN (${placeholders})`,
    )
    .all(source, ...cardIds) as {
    card_id: string;
    price_yen: number;
    in_stock: number;
    item_code: string | null;
  }[];
  return new Map(
    rows.map((r) => [
      r.card_id,
      {
        price_yen: r.price_yen,
        in_stock: r.in_stock === 1,
        item_code: r.item_code,
      },
    ]),
  );
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

/**
 * Main-deck and egg-deck counts for many decks at once.
 *
 * One query for the whole list: the deck grid used to call `deckCardCount` per
 * deck, which is 48 round trips to render one page, and it only ever returned
 * the combined total — the tile could show "53" without saying whether that was
 * a 50-card deck with 3 eggs or an illegal one.
 *
 * A Digi-Egg is `cards.card_type = 'Digi-Egg'`. That column is the canonical
 * English type (the JP scraper rewrites it through `canonicalJpType`); the
 * localized wording that may read デジモン lives in `card_translations`, and is
 * exactly what this must NOT key off.
 */
export function deckMainEggCounts(
  deckIds: string[],
): Map<string, { main: number; egg: number }> {
  const out = new Map<string, { main: number; egg: number }>();
  for (const id of deckIds) out.set(id, { main: 0, egg: 0 });
  if (deckIds.length === 0) return out;

  for (let i = 0; i < deckIds.length; i += 500) {
    const chunk = deckIds.slice(i, i + 500);
    const rows = db()
      .prepare(
        `SELECT dc.deck_id,
                COALESCE(SUM(CASE WHEN c.card_type = 'Digi-Egg' THEN dc.quantity END), 0) AS egg,
                COALESCE(SUM(CASE WHEN c.card_type = 'Digi-Egg' THEN 0 ELSE dc.quantity END), 0) AS main
           FROM user.deck_cards dc
           JOIN cards c ON c.id = dc.card_id
          WHERE dc.deck_id IN (${chunk.map(() => "?").join(",")})
          GROUP BY dc.deck_id`,
      )
      .all(...chunk) as { deck_id: string; egg: number; main: number }[];
    for (const r of rows) out.set(r.deck_id, { main: r.main, egg: r.egg });
  }
  return out;
}

export type RefreshChange = {
  kind: string;
  code: string | null;
  lang: string | null;
  field: string | null;
  before: string | null;
  after: string | null;
  /** The card's name, so a row reads as a card rather than as a code. */
  name?: string | null;
};

export type RefreshRun = {
  run_at: string;
  total: number;
  counts: Record<string, number>;
  /** A sample, newest kinds first — a big run can be thousands of rows and the
   *  admin page is a summary, not an audit log. The full set is in the table. */
  sample: RefreshChange[];
};

/**
 * Recent refreshes and what each one changed.
 *
 * Written by `scripts/diff-refresh.ts` into the work copy just before the swap,
 * so a run's rows land together with the data they describe.
 */
/**
 * Every pack, newest first — the vocabulary for `decks.version`.
 *
 * `name_en` is pulled out of our own `set_names` when we have it: the JP site
 * is where the ORDER comes from, but "Booster TIMELESS BONDS" reads better in
 * a dropdown than ブースターパック TIMELESS BONDS for someone playing in
 * Chinese or English.
 */
export function listCardSets(): {
  code: string;
  name_ja: string;
  name_en: string | null;
  release_order: number;
}[] {
  const sets = db()
    .prepare(
      `SELECT code, name_ja, release_order FROM card_sets ORDER BY release_order DESC`,
    )
    .all() as { code: string; name_ja: string; release_order: number }[];
  if (sets.length === 0) return [];

  // One pass over the distinct product titles, matched back by bracket code.
  const en = new Map<string, string>();
  for (const r of db()
    .prepare(
      `SELECT DISTINCT set_names FROM cards WHERE set_names LIKE '%[%]%'`,
    )
    .all() as { set_names: string }[]) {
    for (const part of r.set_names.split(/\s*;\s*/)) {
      const m = part.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
      if (!m) continue;
      const key = m[2].toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!en.has(key)) en.set(key, m[1].trim());
    }
  }
  const norm = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return sets.map((s) => {
    const k = norm(s.code);
    // "BT26" vs "BT026" vs "LM1"/"LM01" — try the padded and unpadded forms.
    const m = k.match(/^([A-Z]+)0*(\d+)$/);
    const alt = m ? `${m[1]}${m[2].padStart(2, "0")}` : k;
    return { ...s, name_en: en.get(k) ?? en.get(alt) ?? null };
  });
}

export function listRefreshRuns(limit = 5): RefreshRun[] {
  const runs = db()
    .prepare(
      `SELECT run_at, COUNT(*) AS total FROM refresh_changes
        GROUP BY run_at ORDER BY run_at DESC LIMIT ?`,
    )
    .all(limit) as { run_at: string; total: number }[];

  const byKind = db().prepare(
    `SELECT kind, COUNT(*) AS n FROM refresh_changes WHERE run_at = ? GROUP BY kind`,
  );
  // Restrictions first: a banlist move is the one change that can invalidate a
  // deck you already built, so it must not fall off the end of the sample.
  const sample = db().prepare(
    `SELECT kind, code, lang, field, before, after FROM refresh_changes
      WHERE run_at = ?
      ORDER BY CASE
                 WHEN kind LIKE 'restriction%' THEN 0
                 WHEN kind LIKE 'pair%' THEN 1
                 WHEN kind = 'field_changed' THEN 2
                 WHEN kind = 'translation_changed' THEN 3
                 ELSE 4
               END, code
      LIMIT 40`,
  );

  return runs.map((r) => ({
    run_at: r.run_at,
    total: r.total,
    counts: Object.fromEntries(
      (byKind.all(r.run_at) as { kind: string; n: number }[]).map((k) => [
        k.kind,
        k.n,
      ]),
    ),
    sample: sample.all(r.run_at) as RefreshChange[],
  }));
}

/**
 * Everything one refresh changed, in full.
 *
 * The run summaries carry a short sample — enough for the collapsed row. This
 * is what the panel asks for when you open one: every row, with the card's
 * name joined in, because "BT26-010 rarity C → R" is a sentence and
 * "BT26-010" alone is a lookup exercise.
 *
 * `lang` picks which name to show: a translation change is about that
 * language's text, so it reads better labelled with that language's name.
 */
export function listRefreshChanges(
  runAt: string,
  lang: string,
  limit = 500,
): RefreshChange[] {
  const rows = db()
    .prepare(
      `SELECT ch.kind, ch.code, ch.lang, ch.field, ch.before, ch.after,
              COALESCE(
                (SELECT t.name FROM card_translations t
                  WHERE t.code = ch.code AND t.lang = COALESCE(ch.lang, @lang)),
                (SELECT t.name FROM card_translations t
                  WHERE t.code = ch.code AND t.lang = @lang),
                (SELECT c.name FROM cards c WHERE c.code = ch.code)
              ) AS name
         FROM refresh_changes ch
        WHERE ch.run_at = @run
        ORDER BY CASE
                   WHEN ch.kind LIKE 'restriction%' THEN 0
                   WHEN ch.kind LIKE 'pair%' THEN 1
                   WHEN ch.kind = 'card_added' THEN 2
                   WHEN ch.kind = 'card_removed' THEN 3
                   WHEN ch.kind = 'field_changed' THEN 4
                   ELSE 5
                 END, ch.code, ch.field
        LIMIT @limit`,
    )
    .all({ run: runAt, lang, limit }) as RefreshChange[];
  return rows;
}

export type DeckRestrictionIssue =
  | {
      kind: "over_limit";
      card_id: string;
      code: string;
      name: string;
      quantity: number;
      max_count: number;
      status: string;
    }
  | {
      kind: "pair";
      card_id: string;
      code: string;
      name: string;
      /** The card whose presence outlaws this one. */
      with_code: string;
      with_name: string;
    };

/**
 * Which cards in a deck the CURRENT banlist disagrees with.
 *
 * Read-only, and reported rather than corrected. `clampQuantityToRestriction`
 * already caps quantities as they're written, but it only runs on a write — a
 * deck built before a banlist move keeps its four copies, silently, until
 * someone touches that card. This is what makes that visible; it never edits
 * the deck, because throwing away three copies of a card is the owner's call.
 *
 * Digimon's identity is the card code itself (alt-art printings live in
 * `card_images`, not as separate `cards` rows — 4404 rows, 4404 distinct
 * codes), so a row-by-row comparison is the whole check.
 */
export function deckRestrictionIssues(deckId: string): DeckRestrictionIssue[] {
  const over = db()
    .prepare(
      `SELECT dc.card_id, c.code, c.name, dc.quantity, r.max_count, r.status
         FROM user.deck_cards dc
         JOIN cards c ON c.id = dc.card_id
         JOIN card_restrictions r
           ON r.source = 'digimon' AND r.identity = c.code
        WHERE dc.deck_id = ? AND dc.quantity > r.max_count
        ORDER BY r.max_count, c.code`,
    )
    .all(deckId) as Omit<
    Extract<DeckRestrictionIssue, { kind: "over_limit" }>,
    "kind"
  >[];

  // Both halves of a banned pair present in the same deck. Reported against
  // the BANNED card rather than the trigger: the trigger is legal on its own,
  // and it's the other one you'd take out.
  const pairs = db()
    .prepare(
      `SELECT cb.id AS card_id, cb.code, cb.name,
              ca.code AS with_code, ca.name AS with_name
         FROM banned_pairs p
         JOIN cards ca ON ca.code = p.trigger_identity
         JOIN cards cb ON cb.code = p.banned_identity
         JOIN user.deck_cards da ON da.deck_id = ? AND da.card_id = ca.id
         JOIN user.deck_cards dbc ON dbc.deck_id = da.deck_id AND dbc.card_id = cb.id
        WHERE p.source = 'digimon'
        ORDER BY cb.code`,
    )
    .all(deckId) as Omit<
    Extract<DeckRestrictionIssue, { kind: "pair" }>,
    "kind"
  >[];

  return [
    ...over.map((o) => ({ kind: "over_limit" as const, ...o })),
    ...pairs.map((p) => ({ kind: "pair" as const, ...p })),
  ];
}

/**
 * How many issues each of many decks has, in one query.
 *
 * The deck list renders 48 tiles; asking per deck would be 48 round trips to
 * decide whether to draw a dot.
 */
export function deckIssueCounts(deckIds: string[]): Map<string, number> {
  const out = new Map<string, number>();
  if (deckIds.length === 0) return out;
  for (const id of deckIds) out.set(id, 0);

  for (let i = 0; i < deckIds.length; i += 400) {
    const chunk = deckIds.slice(i, i + 400);
    const ph = chunk.map(() => "?").join(",");
    const rows = db()
      .prepare(
        `SELECT deck_id, SUM(n) AS n FROM (
           SELECT dc.deck_id, COUNT(*) AS n
             FROM user.deck_cards dc
             JOIN cards c ON c.id = dc.card_id
             JOIN card_restrictions r
               ON r.source = 'digimon' AND r.identity = c.code
            WHERE dc.deck_id IN (${ph}) AND dc.quantity > r.max_count
            GROUP BY dc.deck_id
           UNION ALL
           SELECT da.deck_id, COUNT(*) AS n
             FROM banned_pairs p
             JOIN cards ca ON ca.code = p.trigger_identity
             JOIN cards cb ON cb.code = p.banned_identity
             JOIN user.deck_cards da ON da.card_id = ca.id
             JOIN user.deck_cards dbc
               ON dbc.deck_id = da.deck_id AND dbc.card_id = cb.id
            WHERE p.source = 'digimon' AND da.deck_id IN (${ph})
            GROUP BY da.deck_id
         ) GROUP BY deck_id`,
      )
      .all(...chunk, ...chunk) as { deck_id: string; n: number }[];
    for (const r of rows) out.set(r.deck_id, r.n);
  }
  return out;
}

export type JapaneseFacts = {
  name: string | null;
  traits: string | null;
  evo_req: string | null;
  /** Effect blocks joined — what a 「X」の記述がある condition searches. */
  text: string;
};

/**
 * The Japanese rows the ジョグレス matcher reads (see lib/jogress.ts).
 *
 * Always Japanese, whatever language the page is being shown in: the
 * requirement is written in Japanese and names its materials in Japanese, so
 * matching against a localized name would only work for one audience. What
 * the reader sees is translated separately, from `getDisplayTranslations`.
 */
export function getJapaneseFacts(codes: string[]): Map<string, JapaneseFacts> {
  const out = new Map<string, JapaneseFacts>();
  const unique = [...new Set(codes)];
  for (let i = 0; i < unique.length; i += 500) {
    const chunk = unique.slice(i, i + 500);
    const rows = db()
      .prepare(
        `SELECT code, name, traits, evo_req, effect_main, effect_2, effect_3
           FROM card_translations
          WHERE lang = 'ja' AND code IN (${chunk.map(() => "?").join(",")})`,
      )
      .all(...chunk) as {
      code: string;
      name: string | null;
      traits: string | null;
      evo_req: string | null;
      effect_main: string | null;
      effect_2: string | null;
      effect_3: string | null;
    }[];
    for (const r of rows) {
      out.set(r.code, {
        name: r.name,
        traits: r.traits,
        evo_req: r.evo_req,
        text: [r.effect_main, r.effect_2, r.effect_3]
          .filter(Boolean)
          .join("\n"),
      });
    }
  }
  return out;
}
