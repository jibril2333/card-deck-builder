/**
 * Versioned, transactional SQLite migrations.
 *
 *   Each migration brings the schema from version N → N+1.
 *   The current schema version is tracked in `PRAGMA user_version`.
 *
 * For the four "catch-up" migrations (1–5) the bodies are idempotent so that
 * old databases that were already mutated by the previous ad-hoc migrator
 * stamp cleanly to version 5 without errors. Future migrations don't need to
 * be idempotent — the version gate handles that.
 */

import type Database from "better-sqlite3";

type Migration = {
  id: number; // monotonically increasing; equals the resulting user_version
  name: string;
  up: (db: Database.Database) => void;
};

function hasColumn(
  db: Database.Database,
  table: string,
  column: string,
): boolean {
  // Supports `schema.table` (e.g. "user.decks") for attached-database tables.
  // SQLite's PRAGMA syntax for attached schemas is `PRAGMA <schema>.table_info(<table>)`,
  // not `PRAGMA table_info(<schema>.<table>)` — the dotted form silently
  // returns no rows.
  const [schema, name] = table.includes(".")
    ? table.split(".", 2)
    : ["main", table];
  const cols = db
    .prepare(`PRAGMA ${schema}.table_info(${name})`)
    .all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: "decks.cover_card_id",
    up: (db) => {
      if (!hasColumn(db, "decks", "cover_card_id")) {
        db.exec("ALTER TABLE decks ADD COLUMN cover_card_id TEXT");
      }
    },
  },
  {
    id: 2,
    name: "decks.sort_order (seeded)",
    up: (db) => {
      if (hasColumn(db, "decks", "sort_order")) return;
      db.exec(
        "ALTER TABLE decks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0",
      );
      const rows = db
        .prepare("SELECT id FROM decks ORDER BY updated_at DESC")
        .all() as { id: string }[];
      const upd = db.prepare("UPDATE decks SET sort_order = ? WHERE id = ?");
      rows.forEach((r, i) => upd.run(i, r.id));
    },
  },
  {
    id: 3,
    name: "deck_cards.purchased",
    up: (db) => {
      if (!hasColumn(db, "deck_cards", "purchased")) {
        db.exec(
          "ALTER TABLE deck_cards ADD COLUMN purchased INTEGER NOT NULL DEFAULT 0",
        );
      }
    },
  },
  {
    id: 4,
    name: "card_images table",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS card_images (
          code TEXT NOT NULL,
          variant TEXT NOT NULL,
          image_url TEXT NOT NULL,
          checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (code, variant)
        )
      `);
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_card_images_code ON card_images(code)",
      );
    },
  },
  {
    id: 5,
    name: "card_prices table",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS card_prices (
          card_id TEXT PRIMARY KEY,
          price REAL NOT NULL,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
    },
  },
  {
    id: 6,
    name: "split user data to user.db",
    up: (db) => {
      const userTables = (
        db
          .prepare(
            `SELECT name FROM user.sqlite_master
             WHERE type='table' AND name IN ('decks','deck_cards','card_prices')`,
          )
          .all() as { name: string }[]
      ).map((r) => r.name);

      // Already migrated previously? Done.
      if (userTables.length === 3) return;

      // Partial state → unsafe to auto-resolve.
      if (userTables.length > 0) {
        throw new Error(
          `migration 6: user.db is partially populated (${userTables.join(
            ", ",
          )}). Refusing to proceed. Inspect manually.`,
        );
      }

      const mainTables = (
        db
          .prepare(
            `SELECT name FROM main.sqlite_master
             WHERE type='table' AND name IN ('decks','deck_cards','card_prices')`,
          )
          .all() as { name: string }[]
      ).map((r) => r.name);
      if (mainTables.length === 0) {
        throw new Error(
          "migration 6: main DB has no decks/deck_cards/card_prices to move; refusing to proceed",
        );
      }

      type SchemaRow = { name: string; sql: string };
      const tableDefs = db
        .prepare(
          `SELECT name, sql FROM main.sqlite_master
           WHERE type='table' AND name IN ('decks','deck_cards','card_prices')
           ORDER BY CASE name
             WHEN 'decks' THEN 1
             WHEN 'deck_cards' THEN 2
             WHEN 'card_prices' THEN 3
           END`,
        )
        .all() as SchemaRow[];

      const indexDefs = db
        .prepare(
          `SELECT name, sql FROM main.sqlite_master
           WHERE type='index'
             AND tbl_name IN ('decks','deck_cards','card_prices')
             AND sql IS NOT NULL`,
        )
        .all() as SchemaRow[];

      // No explicit BEGIN/COMMIT: runMigrations() already wraps each migration
      // in db.transaction(), which uses SAVEPOINT under the hood. Nesting BEGIN
      // inside that throws "cannot start a transaction within a transaction".
      for (const t of tableDefs) {
        // Rewrite "CREATE TABLE [IF NOT EXISTS] <name>" → "CREATE TABLE user.<name>"
        // and strip cross-DB FK to main.cards (SQLite can't enforce across ATTACHed schemas).
        let sql = t.sql.replace(
          /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?\w+[`"]?/i,
          `CREATE TABLE user.${t.name}`,
        );
        sql = sql.replace(
          /,\s*FOREIGN\s+KEY\s*\([^)]+\)\s*REFERENCES\s+cards\s*\([^)]+\)(?:\s+ON\s+DELETE\s+CASCADE)?(?:\s+ON\s+UPDATE\s+\w+)?/gi,
          "",
        );
        db.exec(sql);
        db.exec(`INSERT INTO user.${t.name} SELECT * FROM main.${t.name}`);
      }

      for (const idx of indexDefs) {
        // "CREATE [UNIQUE] INDEX <name>" → "CREATE [UNIQUE] INDEX user.<name>"
        const sql = idx.sql.replace(
          /CREATE\s+(UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?\w+[`"]?/i,
          (_m, uniq) =>
            `CREATE ${uniq ? "UNIQUE " : ""}INDEX user.${idx.name}`,
        );
        db.exec(sql);
      }

      for (const t of tableDefs) {
        db.exec(`DROP TABLE main.${t.name}`);
      }
    },
  },
  {
    id: 7,
    name: "users + sessions + invites tables",
    up: (db) => {
      // All three live in `user.*` (the per-user DB attached as `user`).
      // The shared cards DB stays untouched. Per-row ownership is added in
      // a later migration once we backfill existing decks.
      // Note SQLite syntax: schema-prefix on CREATE INDEX goes on the index
      // NAME (`user.idx_x`), not the table name. The reverse (`ON user.users`)
      // is a syntax error.
      db.exec(`
        CREATE TABLE IF NOT EXISTS user.users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          display_name TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS user.idx_users_email ON users(email);

        CREATE TABLE IF NOT EXISTS user.sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS user.idx_sessions_user ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS user.idx_sessions_expires ON sessions(expires_at);

        CREATE TABLE IF NOT EXISTS user.invites (
          code TEXT PRIMARY KEY,
          used_by TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          used_at TEXT,
          FOREIGN KEY (used_by) REFERENCES users(id) ON DELETE SET NULL
        );
      `);
    },
  },
  {
    id: 8,
    name: "decks.user_id + card_prices(user_id, card_id) PK",
    up: (db) => {
      // Phase 1: add user_id column to decks if missing.
      const decksCols = (
        db
          .prepare("PRAGMA user.table_info(decks)")
          .all() as { name: string }[]
      ).map((r) => r.name);
      if (!decksCols.includes("user_id")) {
        db.exec("ALTER TABLE user.decks ADD COLUMN user_id TEXT");
        db.exec(
          "CREATE INDEX IF NOT EXISTS user.idx_decks_user ON decks(user_id)",
        );
      }

      // Phase 2: rebuild card_prices with a composite PK (user_id, card_id).
      // SQLite can't ALTER a primary key in place, so we rename → create new
      // → copy → drop old. user_id stays NULL on copied rows (legacy data
      // from the single-user era); the app will keep these as "global" entries
      // visible to everyone until the deploy-time owner script claims them.
      const pricesCols = (
        db
          .prepare("PRAGMA user.table_info(card_prices)")
          .all() as { name: string; pk: number }[]
      );
      const hasUserId = pricesCols.some((c) => c.name === "user_id");
      const compositePk =
        pricesCols.filter((c) => c.pk > 0).length >= 2;

      if (!hasUserId || !compositePk) {
        db.exec(`
          ALTER TABLE user.card_prices RENAME TO card_prices_old;
          CREATE TABLE user.card_prices (
            user_id TEXT,
            card_id TEXT NOT NULL,
            price REAL NOT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, card_id)
          );
          INSERT INTO user.card_prices (user_id, card_id, price, updated_at)
            SELECT NULL, card_id, price, updated_at FROM user.card_prices_old;
          DROP TABLE user.card_prices_old;
        `);
      }
    },
  },
  {
    id: 9,
    name: "card_collection table",
    up: (db) => {
      // Per-user collection ledger: how many copies of each card variant the
      // user owns IRL. Independent of decks — a user collects cards, and may
      // or may not assemble them into decks. The (user_id, card_id, variant)
      // PK lets a user record "I own 3 of BT1-001 base art AND 1 of _P1".
      // For UA, every alt-art is its own cards row (card_id includes _p1),
      // so variant is always "" — same shape, simpler reality.
      db.exec(`
        CREATE TABLE IF NOT EXISTS user.card_collection (
          user_id TEXT NOT NULL,
          card_id TEXT NOT NULL,
          variant TEXT NOT NULL DEFAULT '',
          quantity INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, card_id, variant)
        );
        CREATE INDEX IF NOT EXISTS user.idx_collection_user ON card_collection(user_id);
      `);
    },
  },
  {
    id: 10,
    name: "external_prices table",
    up: (db) => {
      // Market prices scraped from third-party shops (Cardrush, dorasuta,
      // suruga-ya, …). Lives in the cards DB (NOT user.*) because the data
      // is per-card not per-user. Composite PK lets us store separate
      // base-art and parallel-art prices for the same card_id.
      //
      // `variant_type`: 'base' for the standard printing, 'parallel' for
      // alt-art prints (Cardrush lumps all _P1 / _P2 / etc into "パラレル").
      // We don't try to map back to specific _P1 vs _P2 here — that's a
      // refinement for later.
      //
      // `in_stock`: 1 if the cheapest listing scraped was actually in
      // stock; 0 if everything was sold out (price still recorded as a
      // historical marker).
      db.exec(`
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
      `);
    },
  },
  {
    id: 12,
    name: "external_listings table",
    up: (db) => {
      // Per-illustrator/per-version market listings. `external_prices` only
      // stores the cheapest base + cheapest parallel for a card, but in
      // practice a single card can have multiple distinct illustrations
      // priced very differently (e.g. Omnimon: sasasi original ¥100 vs
      // Tonamikanji re-illustration ¥19,300 — both "base", different art).
      //
      // We keep `external_prices` as the cheap aggregate for list pages
      // (one number per card / variant) and use this table to drill down
      // on the card detail page so the user can tell which printing each
      // price corresponds to.
      db.exec(`
        CREATE TABLE IF NOT EXISTS external_listings (
          source TEXT NOT NULL,
          card_id TEXT NOT NULL,
          variant_type TEXT NOT NULL,
          illustrator TEXT NOT NULL,
          price_yen INTEGER NOT NULL,
          in_stock INTEGER NOT NULL DEFAULT 1,
          fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (source, card_id, variant_type, illustrator)
        );
        CREATE INDEX IF NOT EXISTS idx_external_listings_card
          ON external_listings(card_id);
      `);
    },
  },
  {
    id: 11,
    name: "card_restrictions table",
    up: (db) => {
      // Banlist / limited-list per game. Stored in the cards DB (per-game,
      // shared across users).
      //
      // `identity` is the deduplication key the restriction applies to:
      //   - Digimon: the card code itself (alt-arts live in card_images, the
      //     base cards.code is unique).
      //   - UA: the cards.code with any `_pN` parallel suffix stripped, so
      //     base + all parallels resolve to the same identity. This matches
      //     the official wording "※パラレルカード含む" — restrictions apply
      //     across all printings of the same card.
      //
      // `max_count` is the absolute cap in a single deck:
      //   - 0 = banned
      //   - 1 = restricted to 1 (Digimon) / 制限カード(1枚) (UA)
      //   - 2 = 制限カード(2枚) (UA)
      // Anything not in this table defaults to 4 (the standard rule).
      db.exec(`
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
      `);
    },
  },
  {
    id: 13,
    name: "webauthn_credentials + webauthn_challenges",
    up: (db) => {
      // Passkey storage. One user can register multiple credentials (phone +
      // laptop + ...). credential_id and public_key are base64url-encoded as
      // produced by @simplewebauthn — we keep them as TEXT so the DB stays
      // human-inspectable.
      //
      // counter is the WebAuthn signature counter; we monotonically bump it
      // on every successful auth to detect cloned authenticators. transports
      // ("internal", "hybrid", "usb", …) helps the browser hint preferred
      // ones in subsequent authentications.
      //
      // webauthn_challenges holds the short-lived random challenge between
      // a /begin and /finish round-trip. Keyed by (user_id, type) so a user
      // can have at most one pending register and one pending auth at a
      // time. Rows older than 5 minutes are ignored by the verify step.
      db.exec(`
        CREATE TABLE IF NOT EXISTS user.webauthn_credentials (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          credential_id TEXT NOT NULL UNIQUE,
          public_key TEXT NOT NULL,
          counter INTEGER NOT NULL DEFAULT 0,
          transports TEXT,
          label TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          last_used_at TEXT,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS user.idx_webauthn_user
          ON webauthn_credentials(user_id);

        CREATE TABLE IF NOT EXISTS user.webauthn_challenges (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          type TEXT NOT NULL,
          challenge TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS user.idx_webauthn_challenges_user
          ON webauthn_challenges(user_id);
      `);
    },
  },
  {
    id: 14,
    name: "banned_pairs table",
    up: (db) => {
      // Digimon's "Banned Pair" rule: if card A is in your deck, then every
      // card listed alongside it (call them B) is banned from that same
      // deck. Real example: BT20-037 (Chaosmon: Valdur Arm) being present
      // outlaws BT17-035 (Taomon) AND EX8-037 (Sakuyamon X Antibody) in the
      // same deck.
      //
      // Model: one row per A→B *edge*, denormalized. A trigger card with
      // two banned partners produces two rows sharing the same
      // trigger_identity. This keeps queries simple (no join table) and the
      // dataset is tiny (single-digit rows globally), so denormalization
      // costs nothing.
      //
      // Identity semantics mirror card_restrictions: the column stores the
      // base code (sans `_pN` suffix where applicable). Parallel printings
      // are implicitly covered.
      //
      // Lives in the cards DB (main, not user) — it's reference data
      // maintained by the periodic scraper, same as card_restrictions.
      db.exec(`
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
      `);
    },
  },
  {
    id: 15,
    name: "decks.accent_color2 (dual-color support)",
    up: (db) => {
      // Optional secondary accent color. NULL = single-color deck (existing
      // behavior). A non-null value enables dual-color rendering in the
      // header banner and the deck-tile dot. Auto-populated from the cover
      // card's color2 when the user sets a cover; can be overridden in the
      // deck meta form.
      if (!hasColumn(db, "user.decks", "accent_color2")) {
        db.exec(
          "ALTER TABLE user.decks ADD COLUMN accent_color2 TEXT DEFAULT NULL",
        );
      }
    },
  },
];

export const TARGET_SCHEMA_VERSION = MIGRATIONS.reduce(
  (m, x) => Math.max(m, x.id),
  0,
);

export function runMigrations(db: Database.Database): void {
  const cur = (
    db.prepare("PRAGMA user_version").get() as { user_version: number }
  ).user_version;

  const pending = MIGRATIONS.filter((m) => m.id > cur).sort(
    (a, b) => a.id - b.id,
  );
  if (pending.length === 0) return;

  for (const m of pending) {
    const tx = db.transaction(() => {
      m.up(db);
      // PRAGMA can't be parameterized; m.id is a const integer from our list.
      db.exec(`PRAGMA user_version = ${m.id}`);
    });
    try {
      tx();
      console.log(`[db] migration ${m.id} applied: ${m.name}`);
    } catch (err) {
      console.error(`[db] migration ${m.id} (${m.name}) failed:`, err);
      throw err;
    }
  }
}
