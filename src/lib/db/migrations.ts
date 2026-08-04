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
import { CARD_TRANSLATIONS_DDL } from "./translations-ddl";
import { CARD_RULINGS_DDL } from "./rulings-ddl";

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
  {
    id: 16,
    name: "card_translations (CN/JP card text)",
    up: (db) => {
      // Localized card text, keyed by BASE card code + lang. Lives in the
      // MAIN (cards) db: scraper-maintained reference data, rebuildable any
      // time, like `cards` itself. DDL is shared with the scraper scripts
      // (which may create the table before the app ever migrates).
      db.exec(CARD_TRANSLATIONS_DDL);
    },
  },
  {
    id: 17,
    name: "card_rulings (official Q&A)",
    up: (db) => {
      db.exec(CARD_RULINGS_DDL);
    },
  },
  {
    id: 18,
    name: "deck_groups (shared physical card pools)",
    up: (db) => {
      // A "deck group" models several decks that SHARE one physical set of
      // cards: the owner buys each shared card only once (max copies any
      // single member deck needs) and reassembles whichever deck they're
      // playing. Membership is many-to-many and scoped to the group, so the
      // pooled requirement ignores decks outside the group. Both tables live
      // in user.db next to decks; deleting a deck or group cascades cleanly.
      db.exec(`
        CREATE TABLE IF NOT EXISTS user.deck_groups (
          id         TEXT PRIMARY KEY,
          name       TEXT NOT NULL,
          user_id    TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS user.deck_group_members (
          group_id TEXT NOT NULL REFERENCES deck_groups(id) ON DELETE CASCADE,
          deck_id  TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
          PRIMARY KEY (group_id, deck_id)
        );
        CREATE INDEX IF NOT EXISTS user.idx_deck_groups_user
          ON deck_groups(user_id);
        CREATE INDEX IF NOT EXISTS user.idx_deck_group_members_deck
          ON deck_group_members(deck_id);
      `);
    },
  },
  {
    id: 19,
    name: "card_images.lang (per-language alt arts)",
    up: (db) => {
      // card_images originally held ONLY English art (probed off
      // world.digimoncard.com), so a zh/ja card page showed the localized
      // base image followed by a gallery of English alt arts — the languages
      // visibly mixed. Key the table by language so each locale can carry its
      // own variants (JP art comes off digimoncard.com with the same _P1/_P2
      // suffixes; CN art comes from the CN API's parallel rows).
      //
      // SQLite can't extend a PRIMARY KEY in place — rebuild the table and
      // backfill every existing row as 'en', which is exactly what they are.
      const cols = db
        .prepare("SELECT name FROM pragma_table_info('card_images')")
        .all() as { name: string }[];
      if (cols.some((c) => c.name === "lang")) return;

      db.exec(`
        CREATE TABLE card_images_new (
          code       TEXT NOT NULL,
          lang       TEXT NOT NULL DEFAULT 'en',
          variant    TEXT NOT NULL,
          image_url  TEXT NOT NULL,
          checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (code, lang, variant)
        );
        INSERT INTO card_images_new (code, lang, variant, image_url, checked_at)
          SELECT code, 'en', variant, image_url, checked_at FROM card_images;
        DROP TABLE card_images;
        ALTER TABLE card_images_new RENAME TO card_images;
        CREATE INDEX IF NOT EXISTS idx_card_images_code ON card_images(code);
        CREATE INDEX IF NOT EXISTS idx_card_images_code_lang
          ON card_images(code, lang);
      `);
    },
  },
  {
    id: 20,
    name: "decks.pinned (main decks vs. ones just kept on record)",
    up: (db) => {
      // Not every deck is one you actually play — most of them are just kept
      // as a record. `pinned` floats the ones you main to the top of the deck
      // list; everything else still shows below, unchanged.
      //
      // Deliberately affects the deck list ONLY: shortfall/diff tools keep
      // treating every deck equally.
      // Name the schema explicitly — `decks` lives in the ATTACHed user DB,
      // and the unqualified form would silently inspect main if it ever grew
      // a table of the same name.
      const cols = db
        .prepare("SELECT name FROM pragma_table_info('decks','user')")
        .all() as { name: string }[];
      if (cols.some((c) => c.name === "pinned")) return;
      db.exec(
        `ALTER TABLE user.decks ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0`,
      );
    },
  },
  {
    id: 21,
    name: "decks.cover_variant (use an alt art as the deck cover)",
    up: (db) => {
      // The cover was always the card's BASE art, because it resolved through
      // `cards.image_url`. Alt arts live in `card_images` keyed by
      // (code, lang, variant), so remember WHICH printing was picked.
      // '' = base art, which is what every existing deck gets — their covers
      // keep rendering exactly as before.
      const cols = db
        .prepare("SELECT name FROM pragma_table_info('decks','user')")
        .all() as { name: string }[];
      if (cols.some((c) => c.name === "cover_variant")) return;
      db.exec(
        `ALTER TABLE user.decks ADD COLUMN cover_variant TEXT NOT NULL DEFAULT ''`,
      );
    },
  },
  {
    id: 22,
    name: "deck_adjustments (a scratch list of swaps you're considering)",
    up: (db) => {
      // A per-deck note-to-self about cards you're thinking of adding or
      // cutting. Deliberately its OWN table rather than a flag on deck_cards:
      // every count, price, shortfall, shared-pool and export query reads
      // deck_cards, so anything living there would inevitably leak into them.
      // Keeping it separate makes "participates in nothing else" structural
      // instead of something each query has to remember to filter out.
      //
      // ON DELETE CASCADE is real here — connection.ts sets
      // `PRAGMA foreign_keys = ON`, which is what deleteDeck already relies on.
      db.exec(`
        CREATE TABLE IF NOT EXISTS user.deck_adjustments (
          id         TEXT PRIMARY KEY,
          deck_id    TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
          card_id    TEXT NOT NULL,
          kind       TEXT NOT NULL CHECK (kind IN ('add','remove')),
          note       TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS user.idx_deck_adjustments_deck
          ON deck_adjustments(deck_id);
      `);
    },
  },
  {
    id: 23,
    name: "deck_adjustments.quantity (how many copies to add/cut)",
    up: (db) => {
      // "Try this card" usually means a specific number of copies — swapping
      // 2-for-2 is a different note than 1-for-1. Existing rows predate the
      // idea and mean one copy.
      const cols = db
        .prepare("SELECT name FROM pragma_table_info('deck_adjustments','user')")
        .all() as { name: string }[];
      if (cols.some((c) => c.name === "quantity")) return;
      db.exec(
        `ALTER TABLE user.deck_adjustments
           ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1`,
      );
      // One row per (deck, card, column) so re-adding a card bumps its count
      // instead of stacking duplicate entries. Created here rather than in
      // migration 22 because that's only true now that quantity exists.
      //
      // Migration 22 shipped without the constraint, so anything already
      // entered could contain duplicates — collapse them (summing the copies,
      // keeping the first note) or the index creation would fail.
      db.exec(`
        UPDATE deck_adjustments SET quantity = (
          SELECT SUM(d2.quantity) FROM deck_adjustments d2
           WHERE d2.deck_id = deck_adjustments.deck_id
             AND d2.card_id = deck_adjustments.card_id
             AND d2.kind    = deck_adjustments.kind
        )
        WHERE id IN (
          SELECT MIN(id) FROM deck_adjustments GROUP BY deck_id, card_id, kind
        );
        DELETE FROM deck_adjustments WHERE id NOT IN (
          SELECT MIN(id) FROM deck_adjustments GROUP BY deck_id, card_id, kind
        );
      `);
      db.exec(
        `CREATE UNIQUE INDEX IF NOT EXISTS user.idx_deck_adjustments_unique
           ON deck_adjustments(deck_id, card_id, kind)`,
      );
    },
  },
  {
    id: 24,
    name: "card_translations.evo_cost / evo_req (localized digivolve blocks)",
    up: (db) => {
      // The official-site parser already reads 進化条件1 and [特殊進化] — the
      // DNA / DigiXros / Assembly / Link requirement lines — but the
      // translations table had nowhere to put them, so every scrape threw
      // them away and those blocks existed in English only. EX12-060's
      // ジョグレス line was missing from the JP text for exactly this reason.
      const cols = db
        .prepare("SELECT name FROM pragma_table_info('card_translations')")
        .all() as { name: string }[];
      const have = new Set(cols.map((c) => c.name));
      if (!have.has("evo_cost")) {
        db.exec(`ALTER TABLE card_translations ADD COLUMN evo_cost TEXT`);
      }
      if (!have.has("evo_req")) {
        db.exec(`ALTER TABLE card_translations ADD COLUMN evo_req TEXT`);
      }
    },
  },
  {
    id: 25,
    name: "Dual cards: the Option half gets its own columns",
    up: (db) => {
      // A Dual card (デジモン/オプション) is two cards printed on one: a
      // Digimon on top, an Option on the bottom, each with its own name,
      // colour, cost and text. Nothing modelled that, so all three sources
      // improvised — and each improvised differently:
      //   EN (digimoncard.io) → the whole Option side crammed into
      //                          `inherited_effect`, i.e. labelled 进化元效果
      //   JA (official site)  → dropped on the floor; the parser had no label
      //                          for [デュアル効果] / [デュアルルール]
      //   ZH (digimoncard.cn) → inside `effect_3`, prefixed "选项：<name>",
      //                          and card_type left as 数码宝贝
      // Hence "双力卡牌的文本显示有问题，每个语言问题不一样".
      const addAll = (table: string, cols: [string, string][]) => {
        const have = new Set(
          (
            db
              .prepare(`SELECT name FROM pragma_table_info('${table}')`)
              .all() as { name: string }[]
          ).map((c) => c.name),
        );
        for (const [name, type] of cols) {
          if (!have.has(name)) {
            db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
          }
        }
      };
      addAll("cards", [
        ["dual_name", "TEXT"],
        // Canonical English colour run ("RedYellow"), same shape as
        // evolution_cost so the front end can split it the same way.
        ["dual_color", "TEXT"],
        ["dual_cost", "INTEGER"],
        ["dual_effect", "TEXT"],
        ["dual_rule", "TEXT"],
      ]);
      // Colour and cost are language-independent, so they live only on `cards`.
      addAll("card_translations", [
        ["dual_name", "TEXT"],
        ["dual_effect", "TEXT"],
        ["dual_rule", "TEXT"],
      ]);
    },
  },
  {
    id: 26,
    name: "Move mis-slotted Option text off inherited_effect on Dual cards",
    up: (db) => {
      // Migration 25 gave Dual cards somewhere to put their Option half, and
      // the scrapers now route it there. This backfills the rows that were
      // written BEFORE that — where digimoncard.io's Option text is still
      // sitting in inherited_effect and would show as 进化元效果.
      //
      // Same rule as the ON CONFLICT clause in UPSERT_CARD_SQL, not a list of
      // card codes: dual_name is written only by the official scrapers, so
      // NULL means nothing authoritative has ever parsed this card and
      // anything in inherited_effect came from our own mis-slotting. Cards the
      // official sites have already published are left alone — their
      // inherited_effect is a real verdict.
      //
      // Only bites where the official sites don't (yet) carry the set: as of
      // the 2026-08 BT26 and LM-09 leaks, 9 of 18 Dual cards.
      db.exec(`
        UPDATE cards
           SET dual_effect = inherited_effect,
               inherited_effect = NULL
         WHERE card_type = 'Dual'
           AND dual_name IS NULL
           AND (dual_effect IS NULL OR dual_effect = '')
           AND inherited_effect IS NOT NULL AND inherited_effect <> ''
      `);
    },
  },
  {
    id: 27,
    name: "Link cards: link DP / condition / effect, plus [特別ルール]",
    up: (db) => {
      // Third instance of the same shape as Dual (migration 25): a mechanic
      // printed in the card's LOWER text section that nothing modelled, so
      // every source improvised differently —
      //   JA official  labels all three blocks properly; we had no label map
      //                entry, so all three were dropped
      //   EN official  labels the DP block [Special Rule], has no Link
      //                Condition / Link Effect blocks at all, and concatenates
      //                both into [Inherited Effect] instead
      //   ZH           the whole lot appended to envolutionEffect
      //
      // link_dp is an INTEGER on purpose: the two official sites print the same
      // value as "DP+2000" and "+2000 DP", and the page should not read
      // differently per language over a formatting quirk. Colour/cost on Dual
      // are on `cards` for the same reason.
      const addAll = (table: string, cols: [string, string][]) => {
        const have = new Set(
          (
            db
              .prepare(`SELECT name FROM pragma_table_info('${table}')`)
              .all() as { name: string }[]
          ).map((c) => c.name),
        );
        for (const [name, type] of cols) {
          if (!have.has(name)) {
            db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
          }
        }
      };
      addAll("cards", [
        ["link_dp", "INTEGER"],
        ["link_requirement", "TEXT"],
        ["link_effect", "TEXT"],
        ["special_rule", "TEXT"],
      ]);
      addAll("card_translations", [
        ["link_requirement", "TEXT"],
        ["link_effect", "TEXT"],
        ["special_rule", "TEXT"],
      ]);
    },
  },
  {
    id: 28,
    name: "Clear text that isn't card text (wiki markup, leaked labels, impossible slots)",
    up: (db) => {
      // Found by auditing every card against the rules of the game rather than
      // by spot-checking. Each rule below states what makes the value provably
      // not card text; none of them is a list of card codes.
      //
      // All four survived because of the same trap: the COALESCE guard in the
      // upserts exists so a source that CAN'T see a block never erases what
      // another found — but when the bad value comes from digimoncard.io and
      // the official site's corresponding block is legitimately EMPTY, the
      // guard preserves the bad value forever.

      // 1. digimoncard.io is wiki-derived and leaks raw template syntax. 42
      //    cards were literally displaying "|applinkdp =" as their 进化元效果.
      for (const col of ["main_effect", "security_effect", "inherited_effect"]) {
        db.exec(`
          UPDATE cards SET ${col} = NULL
           WHERE ${col} IS NOT NULL
             AND (TRIM(${col}) GLOB '|*=' OR ${col} LIKE '%{{%')
        `);
      }

      // 2. A Digi-Egg cannot have a security effect — it lives in the egg deck
      //    and never enters the security stack. The official site nonetheless
      //    labels P-148's and P-149's one text block [Security Effect] on the
      //    BASE printing and [Inherited Effect] on both parallels; preferring
      //    the base print picked the impossible one.
      db.exec(`
        UPDATE cards
           SET inherited_effect = COALESCE(NULLIF(inherited_effect, ''), security_effect),
               security_effect = NULL
         WHERE card_type = 'Digi-Egg'
           AND security_effect IS NOT NULL AND security_effect <> ''
      `);

      // 3. The same text in both slots is one real value and one copy that
      //    digimoncard.io filed by card type. The official site names the
      //    block explicitly, and it named it the inherited effect.
      db.exec(`
        UPDATE cards SET security_effect = NULL
         WHERE security_effect IS NOT NULL AND security_effect <> ''
           AND security_effect = inherited_effect
      `);
      // 4. When a card has only an inherited effect, digimoncard.io writes it
      //    into main_effect with its own label still attached. 28 promo cards
      //    showed "Inherited Effect [Your Turn] …" as their main effect while
      //    the inherited slot sat empty. The label names its rightful home.
      //
      //    Runs LAST, and only fills a slot that is still empty: where the
      //    official site also has the text, its wording wins. P-149 reads
      //    "is multicolored" officially and "has 2 or more colors" on
      //    digimoncard.io — same rule, and the official phrasing is the one
      //    the printed card carries.
      for (const [label, col] of [
        ["Inherited Effect ", "inherited_effect"],
        ["Security Effect ", "security_effect"],
      ] as const) {
        db.prepare(
          `UPDATE cards
              SET ${col} = COALESCE(NULLIF(${col}, ''),
                                    TRIM(SUBSTR(main_effect, ?))),
                  main_effect = NULL
            WHERE main_effect LIKE ?`,
        ).run(label.length + 1, `${label}%`);
      }

      db.exec(`
        UPDATE card_translations SET effect_2 = NULL
         WHERE effect_2 IS NOT NULL AND effect_2 <> '' AND effect_2 = effect_3
      `);
    },
  },
  {
    id: 29,
    name: "Route the leaked labels sitting in the inherited slot",
    up: (db) => {
      // Migration 28 handled leaked labels in main_effect. They turn up in the
      // inherited slot too, and there the mis-slotting hides a real block:
      //
      //   4 cards  "Security Effect [Security] …" — the genuine security
      //            effect, shown as 进化元效果 with security_effect empty.
      //            EX10-012/020/035/057; world.digimoncard.com omits the block
      //            entirely, so only digimoncard.io has the English text and
      //            nothing was ever going to correct it.
      //   4 cards  "Card Effect(s) …" — a stale copy of the main effect, which
      //            the official site already supplies in better words (it has
      //            [Sistermon Ciel] where io has [Sistermon Noir]).
      //
      // The label names the block, so route by it: move the security ones,
      // drop the duplicates.
      db.exec(`
        UPDATE cards
           SET security_effect = COALESCE(NULLIF(security_effect, ''),
                                          TRIM(SUBSTR(inherited_effect, 17))),
               inherited_effect = NULL
         WHERE inherited_effect LIKE 'Security Effect %'
      `);
      db.exec(`
        UPDATE cards
           SET main_effect = COALESCE(NULLIF(main_effect, ''),
                                      TRIM(SUBSTR(inherited_effect, 16))),
               inherited_effect = NULL
         WHERE inherited_effect LIKE 'Card Effect(s) %'
      `);

      // A security effect only does anything while the card is being checked
      // in security, and the game marks that timing explicitly — 809 of the
      // 810 stored ones carry [Security] / 【セキュリティ】. The one that
      // doesn't (P-146) is digimoncard.io's copy of the inherited effect,
      // which the official site already gave us in its own wording.
      db.exec(`
        UPDATE cards SET security_effect = NULL
         WHERE security_effect IS NOT NULL AND security_effect <> ''
           AND security_effect NOT LIKE '%[Security]%'
           AND security_effect NOT LIKE '%【セキュリティ%'
           AND inherited_effect IS NOT NULL AND inherited_effect <> ''
      `);
    },
  },
  {
    id: 30,
    name: "A Dual card's play cost is really its Option-side use cost",
    up: (db) => {
      // The official sites print a Dual card's cost cell as the letter "D" —
      // the card cannot be played, only digivolved into or Arts Digivolved. The
      // number digimoncard.io returns in play_cost is the OPTION side's use
      // cost instead: it equals the official DUAL Cost on all 9 Dual cards both
      // sources carry, with 0 mismatches. Six BT26 and three LM cards, which
      // neither official site has published, were therefore rendering "Play
      // Cost 4" on a card that has no play cost at all.
      db.exec(`
        UPDATE cards
           SET dual_cost = COALESCE(dual_cost, play_cost),
               play_cost = NULL
         WHERE card_type = 'Dual' AND play_cost IS NOT NULL
      `);
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
