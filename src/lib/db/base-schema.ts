/**
 * The floor a brand-new database starts from.
 *
 * Migrations 1–6 are catch-up steps: they ALTER tables that a 2024-era
 * hand-built database already had, and 6 splits the user tables out into their
 * own file. None of them CREATE the base tables, so running the migration
 * chain against an empty file dies on step 1 with "no such table: decks" —
 * which is exactly what anyone cloning this repo hit, and why there was no
 * such thing as a fresh install.
 *
 * So a fresh database is built to the shape migration 6 leaves behind and
 * stamped at that version; 7 onward then replay normally and bring it to
 * TARGET_SCHEMA_VERSION.
 *
 * ## Why this is duplicated in tests/e2e/fixtures/seed.ts
 *
 * On purpose, and the duplication is guarded rather than removed. The fixture
 * pins the schema an e2e run exercises so that drift shows up as a USER-VISIBLE
 * failure rather than an internal refactor passing silently (its own header
 * explains this). `tests/init-db.test.ts` builds a database each way and
 * compares the results, so the two definitions can't quietly disagree.
 */

/** The version this base schema represents — the state after migration 6. */
export const BASE_SCHEMA_VERSION = 6;

/** Cards database: scraper output. Everything else is added by migrations. */
export const CARDS_BASE_DDL = `
  CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    card_type TEXT NOT NULL,
    color TEXT,
    color2 TEXT,
    level INTEGER,
    play_cost INTEGER,
    dp INTEGER,
    attribute TEXT,
    form TEXT,
    stage TEXT,
    digi_types TEXT,
    rarity TEXT,
    main_effect TEXT,
    security_effect TEXT,
    inherited_effect TEXT,
    source_effect TEXT,
    evolution_cost TEXT,
    evolution_requirements TEXT,
    set_names TEXT,
    series TEXT,
    artist TEXT,
    image_url TEXT,
    source_url TEXT,
    imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_cards_name ON cards(name, code);
  CREATE INDEX IF NOT EXISTS idx_cards_filters
    ON cards(color, level, play_cost, dp, card_type, attribute);

  -- Migration 4. Alt-art printings; read through a LEFT JOIN even when empty,
  -- so the table has to exist before the app serves its first request.
  CREATE TABLE IF NOT EXISTS card_images (
    code TEXT NOT NULL,
    variant TEXT NOT NULL,
    image_url TEXT NOT NULL,
    checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (code, variant)
  );
  CREATE INDEX IF NOT EXISTS idx_card_images_code ON card_images(code);
`;

/**
 * User database: decks, ownership, prices. Separate file because migration 6
 * put it there — card data is regenerable scraper output, this is not, and
 * only this one is worth backing up.
 */
export const USER_BASE_DDL = `
  CREATE TABLE IF NOT EXISTS decks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    notes TEXT,
    accent_color TEXT NOT NULL DEFAULT '#f59e0b',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cover_card_id TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS deck_cards (
    deck_id TEXT NOT NULL,
    card_id TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    purchased INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (deck_id, card_id),
    FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS card_prices (
    card_id TEXT PRIMARY KEY,
    price REAL NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_decks_updated ON decks(updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_deck_cards_deck ON deck_cards(deck_id);
`;
