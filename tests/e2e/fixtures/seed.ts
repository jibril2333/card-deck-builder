/**
 * Build a fresh Digimon-shaped SQLite DB for e2e tests.
 *
 * The fixture is intentionally tiny — just enough cards to exercise filters,
 * search, deck add/remove, and the three deck-detail modes. We don't seed user
 * data (decks / deck_cards / card_prices); migrations.ts creates those tables
 * lazily on first connection, and the test scenarios populate them via the
 * real Server Actions.
 *
 * Why we ship schema as code: re-using the production migrations file would
 * pull in better-sqlite3 in Playwright's test runner process, which is fine,
 * but pinning the e2e schema here means schema drift caught by the e2e suite
 * is the kind that affects users — not just an internal refactor.
 */

import Database from "better-sqlite3";

const CARDS_SCHEMA = `
  CREATE TABLE cards (
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
  CREATE INDEX idx_cards_name ON cards(name, code);
  CREATE INDEX idx_cards_filters ON cards(color, level, play_cost, dp, card_type, attribute);

  -- Alt-art variants table (migration #4). digimon.ts reads from it via
  -- LEFT JOIN even when there are no alt-arts, so the table must exist.
  CREATE TABLE card_images (
    code TEXT NOT NULL,
    variant TEXT NOT NULL,
    image_url TEXT NOT NULL,
    checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (code, variant)
  );
  CREATE INDEX idx_card_images_code ON card_images(code);
`;

type CardSeed = {
  code: string;
  name: string;
  card_type: string;
  color: string | null;
  level?: number | null;
  play_cost?: number | null;
  dp?: number | null;
  rarity?: string;
  main_effect?: string | null;
};

// Real card data sampled from the live DB so search / filter behavior matches
// real-world expectations. Image URLs are intentionally left null so tests
// don't make outbound HTTP requests.
const SEED_CARDS: CardSeed[] = [
  {
    code: "BT1-001",
    name: "Yokomon",
    card_type: "Digi-Egg",
    color: "Red",
    level: 2,
    rarity: "U",
  },
  {
    code: "BT1-005",
    name: "Kyaromon",
    card_type: "Digi-Egg",
    color: "Yellow",
    level: 2,
    rarity: "U",
  },
  {
    code: "BT1-009",
    name: "Monodramon",
    card_type: "Digimon",
    color: "Red",
    level: 3,
    play_cost: 2,
    dp: 3000,
    rarity: "C",
    main_effect: "When this Digimon attacks,\ndraw 1.",
  },
  {
    code: "BT1-021",
    name: "MetalGreymon",
    card_type: "Digimon",
    color: "Red",
    level: 5,
    play_cost: 6,
    dp: 7000,
    rarity: "R",
  },
  {
    code: "BT1-084",
    name: "Omnimon",
    card_type: "Digimon",
    color: "White",
    level: 7,
    play_cost: 15,
    dp: 15000,
    rarity: "SR",
    main_effect: "End your turn.",
  },
  {
    code: "BT1-085",
    name: "Tai Kamiya",
    card_type: "Tamer",
    color: "Red",
    play_cost: 4,
    rarity: "R",
  },
  {
    code: "BT1-086",
    name: "Matt Ishida",
    card_type: "Tamer",
    color: "Blue",
    play_cost: 4,
    rarity: "R",
  },
];

/** Keep this aligned with `TARGET_SCHEMA_VERSION` in `src/lib/db/migrations.ts`.
 *  When we stamp a freshly seeded card DB at this version, the app's migration
 *  runner will skip every migration step (all of them assume some prior schema
 *  state we deliberately don't reproduce). */
const SCHEMA_VERSION = 6;

export function seedDigimonDb(dbPath: string): void {
  const db = new Database(dbPath);
  try {
    db.exec(CARDS_SCHEMA);

    const insert = db.prepare(
      `INSERT INTO cards (
         id, code, name, card_type, color, level, play_cost, dp, rarity, main_effect
       ) VALUES (
         @id, @code, @name, @card_type, @color, @level, @play_cost, @dp, @rarity, @main_effect
       )`,
    );
    const insertMany = db.transaction((rows: CardSeed[]) => {
      for (const r of rows) {
        insert.run({
          id: r.code,
          code: r.code,
          name: r.name,
          card_type: r.card_type,
          color: r.color ?? null,
          level: r.level ?? null,
          play_cost: r.play_cost ?? null,
          dp: r.dp ?? null,
          rarity: r.rarity ?? null,
          main_effect: r.main_effect ?? null,
        });
      }
    });
    insertMany(SEED_CARDS);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } finally {
    db.close();
  }
}

// Seed a minimal UA fixture so the game switcher works. We don't drive UA
// scenarios yet — the table just has to exist so the connection layer can run
// its migrations.
const UA_CARDS_SCHEMA = `
  CREATE TABLE cards (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    series TEXT NOT NULL,
    color TEXT NOT NULL,
    rarity TEXT NOT NULL,
    card_type TEXT NOT NULL,
    energy_cost INTEGER NOT NULL DEFAULT 0,
    ap_cost INTEGER NOT NULL DEFAULT 0,
    bp INTEGER NOT NULL DEFAULT 0,
    trigger_text TEXT,
    effect_text TEXT,
    image_url TEXT,
    source_url TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    locale TEXT NOT NULL DEFAULT 'jp',
    source TEXT NOT NULL DEFAULT 'official-jp',
    name_reading TEXT,
    UNIQUE (locale, code)
  );
`;

export function seedUADb(dbPath: string): void {
  const db = new Database(dbPath);
  try {
    db.exec(UA_CARDS_SCHEMA);
    db.prepare(
      `INSERT INTO cards (id, code, name, series, color, rarity, card_type)
       VALUES ('jp-EX01BT-HTR-2-001', 'EX01BT/HTR-2-001', 'アベンガネ', 'HUNTER×HUNTER', 'Yellow', 'U', 'Character')`,
    ).run();
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } finally {
    db.close();
  }
}

/**
 * Seed an empty user.db with the post-migration schema (decks / deck_cards /
 * card_prices + indexes). Mirrors what migration #6 produces, so the app
 * skips all migrations on first connection.
 *
 * (Kept in sync by hand with `src/lib/db/migrations.ts` — the alternative is
 * pulling the migration module in here, but that would create an import cycle
 * via better-sqlite3 native binary loading we'd rather avoid.)
 */
export function seedUserDb(dbPath: string): void {
  const db = new Database(dbPath);
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS decks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        notes TEXT,
        accent_color TEXT NOT NULL DEFAULT '#f59e0b',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        cover_card_id TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        user_id TEXT
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
        user_id TEXT,
        card_id TEXT NOT NULL,
        price REAL NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, card_id)
      );
      CREATE INDEX IF NOT EXISTS idx_decks_updated ON decks(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_deck_cards_deck ON deck_cards(deck_id);
      CREATE INDEX IF NOT EXISTS idx_decks_user ON decks(user_id);

      -- Auth tables (migration #7). Created here so the app's migration
      -- runner sees IF NOT EXISTS and skips.
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
      CREATE TABLE IF NOT EXISTS invites (
        code TEXT PRIMARY KEY,
        used_by TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        used_at TEXT,
        FOREIGN KEY (used_by) REFERENCES users(id) ON DELETE SET NULL
      );

      -- Migration #9: per-user card collection ledger.
      CREATE TABLE IF NOT EXISTS card_collection (
        user_id TEXT NOT NULL,
        card_id TEXT NOT NULL,
        variant TEXT NOT NULL DEFAULT '',
        quantity INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, card_id, variant)
      );
      CREATE INDEX IF NOT EXISTS idx_collection_user ON card_collection(user_id);
    `);
  } finally {
    db.close();
  }
}

/**
 * Insert a pre-authenticated test user + session into the digimon user.db.
 * Returns a Playwright-formatted storageState so tests start logged in.
 *
 * We bypass `auth/repo.createUser` (and therefore bcrypt) — e2e tests don't
 * exercise the login flow, they assume an existing session. The password_hash
 * field is filled with a dummy string that's not a valid bcrypt hash, so
 * /login can't accidentally succeed against this fixture.
 */
export function createE2ESession(dbPath: string): {
  userId: string;
  sessionToken: string;
  expiresAt: Date;
} {
  const db = new Database(dbPath);
  try {
    const userId = `e2e-user-${Date.now()}`;
    const sessionToken = `e2e-session-${Date.now()}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    db.prepare(
      `INSERT INTO users (id, email, password_hash, display_name)
       VALUES (?, ?, ?, ?)`,
    ).run(userId, "e2e@test.local", "not-a-real-bcrypt-hash", "E2E Tester");
    db.prepare(
      `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
    ).run(sessionToken, userId, expiresAt.toISOString());
    return { userId, sessionToken, expiresAt };
  } finally {
    db.close();
  }
}
