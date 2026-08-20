import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runMigrations, TARGET_SCHEMA_VERSION } from "@/lib/db/migrations";
import { seedDigimonDb, seedUserDb } from "./e2e/fixtures/seed";

/**
 * A database built from nothing.
 *
 * The project had no fresh-install path at all: `data.nosync/` is gitignored,
 * and migration 1 ALTERs a `decks` table that an empty file doesn't have, so
 * anyone cloning the repo got "no such table: decks". scripts/init-db.ts is
 * that path, and this is what keeps it honest.
 *
 * The comparison against the e2e fixture is the point of the second test. The
 * fixture deliberately keeps its OWN copy of the schema (see its header: it
 * pins what an e2e run exercises, so drift surfaces as a user-visible failure
 * rather than an internal refactor). Two independent definitions are only safe
 * if something checks they agree — this does.
 */
const ROOT = process.cwd();
let dir: string;

/** name → sorted "column:type" list, for every table in both schemas. */
function shapeOf(dbPath: string, userPath: string): Record<string, string[]> {
  const db = new Database(dbPath, { readonly: true });
  db.exec(`ATTACH DATABASE '${userPath.replace(/'/g, "''")}' AS user`);
  const out: Record<string, string[]> = {};
  for (const schema of ["main", "user"]) {
    const tables = db
      .prepare(
        `SELECT name FROM ${schema}.sqlite_master
          WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
      )
      .all() as { name: string }[];
    for (const t of tables) {
      const cols = db
        .prepare(`PRAGMA ${schema}.table_info(${t.name})`)
        .all() as { name: string; type: string }[];
      out[`${schema}.${t.name}`] = cols
        .map((c) => `${c.name}:${c.type}`)
        .sort();
    }
  }
  db.close();
  return out;
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cdb-init-"));
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("scripts/init-db.ts", () => {
  it("builds a fully-migrated database out of an empty directory", async () => {
    const fresh = path.join(dir, "fresh");
    const { stdout } = await promisify(execFile)(
      "npx",
      ["tsx", "scripts/init-db.ts"],
      { cwd: ROOT, encoding: "utf8", env: { ...process.env, CDB_DATA_DIR: fresh } },
    );
    expect(stdout).toContain(`migrated to ${TARGET_SCHEMA_VERSION}`);

    const db = new Database(path.join(fresh, "digimon.db"), { readonly: true });
    expect(db.pragma("user_version", { simple: true })).toBe(
      TARGET_SCHEMA_VERSION,
    );
    // The tables the app reads on its very first request. A migration chain
    // that "succeeds" without these is the failure this test exists for.
    const names = (
      db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
        .all() as { name: string }[]
    ).map((r) => r.name);
    for (const t of ["cards", "card_images", "card_translations", "card_sets"]) {
      expect(names, `missing ${t}`).toContain(t);
    }
    db.close();

    // And it won't run over a database that's already there.
    await expect(
      promisify(execFile)("npx", ["tsx", "scripts/init-db.ts"], {
        cwd: ROOT,
        encoding: "utf8",
        env: { ...process.env, CDB_DATA_DIR: fresh },
      }),
    ).rejects.toThrow(/refusing/);
  }, 180_000);

  it("agrees with the schema the e2e fixture builds", () => {
    const viaFixture = path.join(dir, "fixture");
    fs.mkdirSync(viaFixture, { recursive: true });
    const cards = path.join(viaFixture, "digimon.db");
    const user = path.join(viaFixture, "digimon-user.db");
    seedDigimonDb(cards);
    seedUserDb(user);
    const db = new Database(cards);
    db.exec(`ATTACH DATABASE '${user.replace(/'/g, "''")}' AS user`);
    runMigrations(db);
    db.close();

    const fresh = path.join(dir, "fresh");
    expect(
      shapeOf(cards, user),
      "init-db and the e2e fixture have drifted apart",
    ).toEqual(
      shapeOf(path.join(fresh, "digimon.db"), path.join(fresh, "digimon-user.db")),
    );
  }, 60_000);
});
