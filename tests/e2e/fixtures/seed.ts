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

  -- Market prices (migration 10). Seeded here so the card page's two shop
  -- blocks have something to render: Cardrush's per-illustrator list and
  -- PAO's per-printing quote.
  CREATE TABLE IF NOT EXISTS external_prices (
    source TEXT NOT NULL,
    card_id TEXT NOT NULL,
    variant_type TEXT NOT NULL,
    price_yen INTEGER NOT NULL,
    in_stock INTEGER NOT NULL DEFAULT 1,
    fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (source, card_id, variant_type)
  );
  CREATE INDEX IF NOT EXISTS idx_external_prices_card
    ON external_prices(card_id);
  INSERT OR IGNORE INTO external_prices (source, card_id, variant_type, price_yen, in_stock)
    VALUES ('pao', 'BT1-084', 'base', 180, 1),
           ('pao', 'BT1-084', 'parallel', 3800, 0);

  -- Written by the 关键词 refresh stage. The game-knowledge page builds its
  -- keyword table from these two, so a fixture without them only ever
  -- exercises the fallback.
  CREATE TABLE IF NOT EXISTS card_keywords (
    lang       TEXT NOT NULL,
    keyword    TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (lang, keyword)
  );
  CREATE TABLE IF NOT EXISTS keyword_names (
    official   TEXT PRIMARY KEY,
    ja         TEXT,
    zh         TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  -- Blocker is written up in lib/keywords. "Sample Keyword" is not, and never
  -- will be: it stands in for what a new set brings — a keyword that reaches
  -- the page with its three spellings and no explanation. A real one would
  -- stop testing that the day someone writes it up.
  INSERT OR IGNORE INTO card_keywords (lang, keyword) VALUES
    ('en', 'Blocker'), ('en', 'Sample Keyword'), ('en', 'Rule'),
    ('ja', 'ブロッカー'), ('ja', 'サンプル');
  INSERT OR IGNORE INTO keyword_names (official, ja, zh) VALUES
    ('Blocker', 'ブロッカー', '阻挡者'),
    ('Sample Keyword', 'サンプル', '样例');
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
const SEED_RESTRICTIONS: [
  string,
  "banned" | "limited_1" | "limited_2",
  number,
][] = [
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
/** code, lang, name, image, and — ja only — the katakana reading of the name. */
const SEED_TRANSLATIONS: [string, "ja" | "zh", string, string, string?][] = [
  [
    "BT1-086",
    "ja",
    "石田ヤマト",
    "https://digimoncard.com/images/cardlist/card/BT1-086.png",
    // What the price scraper lifts off the shop listing. The kanji half is
    // unreachable without it: 「いしだ」 matches nothing in 石田ヤマト.
    "イシダヤマト",
  ],
  ["BT1-086", "zh", "石田大和", "https://source.windoent.com/DTCG/BT1-086.png"],
];

/**
 * Two packs, so a deck can be dated (see lib/deck-version).
 *
 * The release order here is deliberately the REVERSE of the codes' string
 * sort: the invented ZZ-03 is the OLD one and BT-01 the newest. That's the
 * only arrangement these two codes can express that tells the two orderings
 * apart — with BT-01 old and ZZ-03 new, sorting by code gives the same answer
 * as sorting by release, and the fixture would agree with a version picker
 * that had the whole idea wrong.
 *
 * (In the real data the distinction is BT-25 → AD-01 → EX-11 → BT-24, where
 * no string comparison finds the order at all.)
 */
const SEED_SETS: [string, string, number][] = [
  ["ZZ-03", "テストブースター【ZZ-03】", 1],
  ["BT-01", "ブースターパック NEW EVOLUTION【BT-01】", 90],
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
  // ── Ordering fixture ──────────────────────────────────────────────────
  // Two Lv.3s from sets whose codes sort one way as TEXT and the other way as
  // numbers (BT10 before BT2 as text), and an Option whose code sorts before
  // both Tamers'. Together they tell the deck's card order apart from the old
  // `level NULLS LAST, code` — see tests/e2e/deck-card-order.spec.ts.
  //
  // No name here contains "mon": the adjustment dropdown's spec searches that
  // and measures how tall the result list is.
  {
    code: "BT2-030",
    name: "Cliff Raptor",
    card_type: "Digimon",
    color: "Red",
    level: 3,
    play_cost: 3,
    dp: 3000,
    rarity: "C",
  },
  {
    code: "BT10-050",
    name: "Dune Raptor",
    card_type: "Digimon",
    color: "Red",
    level: 3,
    play_cost: 3,
    dp: 3000,
    rarity: "C",
  },
  {
    code: "BT1-050",
    name: "Sky Fissure",
    card_type: "Option",
    color: "Blue",
    play_cost: 2,
    rarity: "C",
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
  // ── ジョグレス fixture ─────────────────────────────────────────────────
  // A DNA-digivolution target and three Lv.6s, one of which fits NEITHER half
  // of the condition — without that one, "lists the right pair" and "lists
  // every Lv.6 in the deck" would look identical.
  //
  // None of these names ends in -mon, unlike every real Digimon: the
  // adjustment dropdown's spec searches "mon" and measures how tall the result
  // list is, so four more matches there would fail a test about a different
  // feature entirely.
  {
    code: "ZZ3-001",
    name: "Jogress Prime",
    card_type: "Digimon",
    color: "Purple",
    level: 7,
    play_cost: 12,
    dp: 13000,
    rarity: "SR",
    image: STUB_IMAGE,
  },
  {
    code: "ZZ3-002",
    name: "Kiiro Six",
    card_type: "Digimon",
    color: "Yellow",
    level: 6,
    play_cost: 10,
    dp: 11000,
    rarity: "R",
    image: STUB_IMAGE,
  },
  {
    code: "ZZ3-003",
    name: "Kuro Six",
    card_type: "Digimon",
    color: "Black",
    level: 6,
    play_cost: 10,
    dp: 11000,
    rarity: "R",
    image: STUB_IMAGE,
  },
  {
    code: "ZZ3-004",
    name: "Midori Six",
    card_type: "Digimon",
    color: "Green",
    level: 6,
    play_cost: 10,
    dp: 11000,
    rarity: "R",
    image: STUB_IMAGE,
  },
];

/**
 * The condition itself, which only exists in Japanese (see lib/jogress on why
 * the parser reads the JP row). Written the way the live data writes it,
 * trailing rules sentence and all.
 */
const SEED_JOGRESS: [string, string][] = [
  [
    "ZZ3-001",
    "〔ジョグレス〕黄Lv.6+黒Lv.6:コスト0 指定のデジモン2体を重ね、アクティブで進化する",
  ],
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

    // card_sets arrives with migration 34; the fixture stamps user_version at 6
    // and lets the app migrate, but the rows have to exist before the first
    // request — same reason the translations DDL is run here by hand.
    db.exec(`
      CREATE TABLE IF NOT EXISTS card_sets (
        code TEXT PRIMARY KEY, category TEXT, name_ja TEXT NOT NULL,
        release_order INTEGER NOT NULL
      )`);
    const insertSet = db.prepare(
      `INSERT INTO card_sets (code, category, name_ja, release_order)
       VALUES (?, 'e2e', ?, ?)`,
    );
    for (const [code, name, order] of SEED_SETS)
      insertSet.run(code, name, order);

    const insertRestriction = db.prepare(
      `INSERT INTO card_restrictions (source, identity, status, max_count)
       VALUES ('digimon', ?, ?, ?)`,
    );
    for (const [identity, status, max] of SEED_RESTRICTIONS) {
      insertRestriction.run(identity, status, max);
    }
    db.exec(CARD_TRANSLATIONS_DDL);
    const insertTranslation = db.prepare(
      `INSERT INTO card_translations (code, lang, name, image_url, name_kana)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const [code, lang, name, img, kana] of SEED_TRANSLATIONS) {
      insertTranslation.run(code, lang, name, img, kana ?? null);
    }
    const insertJogress = db.prepare(
      `INSERT INTO card_translations (code, lang, name, evo_req)
       VALUES (?, 'ja', ?, ?)`,
    );
    for (const [code, req] of SEED_JOGRESS) {
      insertJogress.run(code, `${code}（日本語）`, req);
    }

    // One recorded refresh, so the admin page's changelog has something to show
    // — including a banlist move, which is the row that must sort to the top.
    const insertChange = db.prepare(
      `INSERT INTO refresh_changes (run_at, kind, code, lang, field, before, after)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const c of [
      [
        "2026-08-10T04:30:00Z",
        "card_added",
        "BT1-001",
        null,
        null,
        null,
        "Yokomon",
      ],
      [
        "2026-08-10T04:30:00Z",
        "field_changed",
        "BT1-084",
        null,
        "main_effect",
        "old",
        "new",
      ],
      [
        "2026-08-10T04:30:00Z",
        "restriction_changed",
        "BT1-086",
        null,
        null,
        "limited_1",
        "banned",
      ],
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

/**
 * A deck that the CURRENT banlist disagrees with: 4× BT1-086, which
 * `SEED_RESTRICTIONS` caps at 1.
 *
 * It has to be written straight into the DB, because the app cannot produce
 * one: `clampQuantityToRestriction` caps quantities as they are written, so
 * adding this card through the UI would stop at 1. That's the whole situation
 * the notice exists for — the deck was legal when it was built, and a later
 * banlist refresh moved the card underneath it.
 */
export const LEGACY_DECK = {
  id: "e2e-legacy-deck",
  name: "禁限提醒测试",
  code: "BT1-086",
  quantity: 4,
  max: 1,
} as const;

/**
 * A deck whose contents have outrun its label: it says ZZ-03 (the fixture's
 * older pack) and holds two cards from BT-01 (the newer one).
 *
 * Seeded rather than built through the UI because the interesting state is the
 * COMBINATION of a recorded version and a newer card, and the app only ever
 * writes a version that already covers everything — you reach this by adding a
 * card to an old deck, which is what happens to a real deck the week a pack
 * drops.
 */
export const VERSION_DECK = {
  id: "e2e-version-deck",
  name: "版本测试",
  version: "ZZ-03",
  /** Newer than the recorded version — the two copies that should be counted.
   *  Deliberately NOT BT1-084: add-to-deck-collapse.spec opens that card and
   *  asserts no deck holds it yet. */
  newerCode: "BT1-085",
  newerCount: 2,
  newerSet: "BT-01",
} as const;

export function seedVersionDeck(dbPath: string, userId: string): void {
  const db = new Database(dbPath);
  try {
    db.prepare(
      `INSERT INTO decks (id, name, user_id, sort_order, version) VALUES (?, ?, ?, 0, ?)`,
    ).run(VERSION_DECK.id, VERSION_DECK.name, userId, VERSION_DECK.version);
    const card = db.prepare(
      `INSERT INTO deck_cards (deck_id, card_id, quantity) VALUES (?, ?, ?)`,
    );
    card.run(VERSION_DECK.id, VERSION_DECK.newerCode, VERSION_DECK.newerCount);
    card.run(VERSION_DECK.id, "ZZ3-001", 1);
  } finally {
    db.close();
  }
}

export function seedViolatingDeck(dbPath: string, userId: string): void {
  const db = new Database(dbPath);
  try {
    db.prepare(
      `INSERT INTO decks (id, name, user_id, sort_order) VALUES (?, ?, ?, 0)`,
    ).run(LEGACY_DECK.id, LEGACY_DECK.name, userId);
    db.prepare(
      `INSERT INTO deck_cards (deck_id, card_id, quantity) VALUES (?, ?, ?)`,
    ).run(LEGACY_DECK.id, LEGACY_DECK.code, LEGACY_DECK.quantity);
  } finally {
    db.close();
  }
}

/** A deck holding the ジョグレス target and every Lv.6 in the fixture. */
export const JOGRESS_DECK = {
  id: "e2e-jogress-deck",
  name: "联展测试",
  target: "ZZ3-001",
  /** The two that satisfy 黄Lv.6+黒Lv.6, and the one that satisfies neither. */
  yellow: "ZZ3-002",
  black: "ZZ3-003",
  green: "ZZ3-004",
} as const;

export function seedJogressDeck(dbPath: string, userId: string): void {
  const db = new Database(dbPath);
  try {
    db.prepare(
      `INSERT INTO decks (id, name, user_id, sort_order) VALUES (?, ?, ?, 1)`,
    ).run(JOGRESS_DECK.id, JOGRESS_DECK.name, userId);
    const add = db.prepare(
      `INSERT INTO deck_cards (deck_id, card_id, quantity) VALUES (?, ?, 1)`,
    );
    for (const code of [
      JOGRESS_DECK.target,
      JOGRESS_DECK.yellow,
      JOGRESS_DECK.black,
      JOGRESS_DECK.green,
    ]) {
      add.run(JOGRESS_DECK.id, code);
    }
  } finally {
    db.close();
  }
}
