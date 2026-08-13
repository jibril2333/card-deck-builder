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
import { CARD_TRANSLATIONS_DDL } from "../../../src/lib/db/translations-ddl";

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

  -- Migrations 12 and 14. Created here with the same shape so the app's
  -- migration runner hits IF NOT EXISTS and skips, and so the seed below can
  -- insert into them.
  CREATE TABLE IF NOT EXISTS card_restrictions (
    source TEXT NOT NULL,
    identity TEXT NOT NULL,
    status TEXT NOT NULL,
    max_count INTEGER NOT NULL,
    since_date TEXT,
    includes_parallel INTEGER NOT NULL DEFAULT 1,
    fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (source, identity)
  );
  CREATE INDEX IF NOT EXISTS idx_restrictions_identity
    ON card_restrictions(identity);
  CREATE TABLE IF NOT EXISTS banned_pairs (
    source TEXT NOT NULL,
    trigger_identity TEXT NOT NULL,
    banned_identity TEXT NOT NULL,
    fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (source, trigger_identity, banned_identity)
  );
  CREATE INDEX IF NOT EXISTS idx_banned_pairs_trigger
    ON banned_pairs(source, trigger_identity);
  CREATE INDEX IF NOT EXISTS idx_banned_pairs_banned
    ON banned_pairs(source, banned_identity);

  -- Migration 33. The admin page reads this on load, so a fixture without it
  -- 500s the whole page rather than showing an empty changelog.
  CREATE TABLE IF NOT EXISTS refresh_changes (
    id       INTEGER PRIMARY KEY,
    run_at   TEXT NOT NULL,
    kind     TEXT NOT NULL,
    code     TEXT,
    lang     TEXT,
    field    TEXT,
    before   TEXT,
    after    TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_refresh_changes_run ON refresh_changes(run_at DESC);
  CREATE INDEX IF NOT EXISTS idx_refresh_changes_code ON refresh_changes(code);
`;

/**
 * Banlist rows for the restrictions page's layout tests.
 *
 * Every identity here is DELIBERATELY absent from SEED_CARDS. A restriction on
 * a fixture card would clamp it in every deck spec that adds copies of it
 * (`clampQuantityToRestriction` runs on every add), so seeding real ones would
 * make an unrelated test fail for a reason nobody would look for. Unmatched
 * identities render as "未在卡库中" placeholder tiles, which is the same box
 * the layout is measured on.
 *
 * Six in one status so a four-up row is a real row with something after it.
 */
const SEED_RESTRICTIONS: [string, "banned" | "limited_1" | "limited_2", number][] = [
  // The one restriction on a card that actually EXISTS in the fixture, so the
  // banlist has a tile with real art and a real name to localize. BT1-086 is
  // referenced by no other spec, so its `limited_1` cap can't clamp a deck
  // some other test is building (see the note below on why the rest are
  // deliberately unmatched).
  ["BT1-086", "limited_1", 1],
  ["ZZ1-001", "banned", 0],
  ["ZZ1-010", "limited_1", 1],
  ["ZZ1-011", "limited_1", 1],
  ["ZZ1-012", "limited_1", 1],
  ["ZZ1-013", "limited_1", 1],
  ["ZZ1-014", "limited_1", 1],
  ["ZZ1-015", "limited_1", 1],
];

/**
 * Localized rows for the one restricted card that exists here, so the banlist
 * and card pages have something to switch languages between. The image hosts
 * are the real per-language CDNs: the point of the fixture is that they DIFFER,
 * which is what tells a name-only localization apart from a full one.
 */
const SEED_TRANSLATIONS: [string, "ja" | "zh", string, string][] = [
  ["BT1-086", "ja", "石田ヤマト", "https://digimoncard.com/images/cardlist/card/BT1-086.png"],
  ["BT1-086", "zh", "石田大和", "https://source.windoent.com/DTCG/BT1-086.png"],
];

/** One trigger with two partners, mirroring the real Chaosmon: Valdur Arm row. */
const SEED_PAIRS: [string, string][] = [
  ["ZZ2-001", "ZZ2-010"],
  ["ZZ2-001", "ZZ2-011"],
];

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
  /** Set to give this card art — see STUB_IMAGE. Null/absent = no image. */
  image?: string | null;
};

/**
 * A 1×1 PNG as a data: URI. Anything rendering card art needs a non-null
 * `image_url` to take its image branch at all, and a data: URI exercises that
 * branch while still issuing no request — which is the point of leaving the
 * rest null.
 */
const STUB_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

// Real card data sampled from the live DB so search / filter behavior matches
// real-world expectations. Image URLs are left null except where a test needs
// the image branch (see `image`), so tests make no outbound HTTP requests.
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
    image: STUB_IMAGE,
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
    image: STUB_IMAGE,
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
    image: STUB_IMAGE,
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
    // Needs art: it's the fixture's one restricted card that exists, and the
    // banlist's language test compares the image it renders per language.
    image: STUB_IMAGE,
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
         id, code, name, card_type, color, level, play_cost, dp, rarity, main_effect,
         image_url
       ) VALUES (
         @id, @code, @name, @card_type, @color, @level, @play_cost, @dp, @rarity, @main_effect,
         @image_url
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
          image_url: r.image ?? null,
        });
      }
    });
    insertMany(SEED_CARDS);

    const insertRestriction = db.prepare(
      `INSERT INTO card_restrictions (source, identity, status, max_count)
       VALUES ('digimon', ?, ?, ?)`,
    );
    for (const [identity, status, max] of SEED_RESTRICTIONS) {
      insertRestriction.run(identity, status, max);
    }
    db.exec(CARD_TRANSLATIONS_DDL);
    const insertTranslation = db.prepare(
      `INSERT INTO card_translations (code, lang, name, image_url)
       VALUES (?, ?, ?, ?)`,
    );
    for (const [code, lang, name, img] of SEED_TRANSLATIONS) {
      insertTranslation.run(code, lang, name, img);
    }

    // One recorded refresh, so the admin page's changelog has something to show
    // — including a banlist move, which is the row that must sort to the top.
    const insertChange = db.prepare(
      `INSERT INTO refresh_changes (run_at, kind, code, lang, field, before, after)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const c of [
      ["2026-08-10T04:30:00Z", "card_added", "BT1-001", null, null, null, "Yokomon"],
      ["2026-08-10T04:30:00Z", "field_changed", "BT1-084", null, "main_effect", "old", "new"],
      ["2026-08-10T04:30:00Z", "restriction_changed", "BT1-086", null, null, "limited_1", "banned"],
    ] as const) {
      insertChange.run(...c);
    }

    const insertPair = db.prepare(
      `INSERT INTO banned_pairs (source, trigger_identity, banned_identity)
       VALUES ('digimon', ?, ?)`,
    );
    for (const [trigger, banned] of SEED_PAIRS) insertPair.run(trigger, banned);

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
