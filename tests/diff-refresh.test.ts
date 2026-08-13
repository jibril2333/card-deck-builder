import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * The refresh changelog, run against two hand-built databases.
 *
 * Built from scratch rather than copied from the real one: the interesting
 * cases are "one field moved" and "a restriction was lifted", and those are
 * only legible when the fixture contains six rows instead of four thousand.
 */
const ROOT = process.cwd();
let dir: string;
const before = () => path.join(dir, "before.db");
const after = () => path.join(dir, "after.db");

const SCHEMA = `
  CREATE TABLE cards (
    id TEXT PRIMARY KEY, code TEXT UNIQUE, name TEXT, card_type TEXT, level INTEGER,
    play_cost INTEGER, dp INTEGER, color TEXT, color2 TEXT, rarity TEXT,
    attribute TEXT, form TEXT, stage TEXT, digi_types TEXT, main_effect TEXT,
    security_effect TEXT, inherited_effect TEXT, evolution_cost TEXT,
    evolution_requirements TEXT, dual_name TEXT, dual_effect TEXT, dual_rule TEXT,
    link_requirement TEXT, link_effect TEXT, special_rule TEXT
  );
  CREATE TABLE card_translations (
    code TEXT, lang TEXT, name TEXT, card_type TEXT, traits TEXT, form TEXT,
    attribute TEXT, effect_main TEXT, effect_2 TEXT, effect_3 TEXT,
    evo_cost TEXT, evo_req TEXT, special_rule TEXT,
    PRIMARY KEY (code, lang)
  );
  CREATE TABLE card_restrictions (
    source TEXT, identity TEXT, status TEXT, max_count INTEGER,
    PRIMARY KEY (source, identity)
  );
  CREATE TABLE banned_pairs (
    source TEXT, trigger_identity TEXT, banned_identity TEXT,
    PRIMARY KEY (source, trigger_identity, banned_identity)
  );
  CREATE TABLE card_images (
    code TEXT, lang TEXT, variant TEXT, image_url TEXT,
    PRIMARY KEY (code, lang, variant)
  );
  CREATE TABLE refresh_changes (
    id INTEGER PRIMARY KEY, run_at TEXT NOT NULL, kind TEXT NOT NULL,
    code TEXT, lang TEXT, field TEXT, before TEXT, after TEXT
  );
`;

function seed(file: string) {
  const db = new Database(file);
  db.exec(SCHEMA);
  db.exec(`
    INSERT INTO cards (id, code, name, card_type, main_effect) VALUES
      ('a','BT1-001','Agumon','Digimon','old text'),
      ('b','BT1-002','Gabumon','Digimon',NULL);
    INSERT INTO card_translations (code, lang, name, effect_main) VALUES
      ('BT1-001','ja','アグモン','旧テキスト');
    INSERT INTO card_restrictions VALUES ('digimon','BT1-001','limited_1',1);
    INSERT INTO banned_pairs VALUES ('digimon','BT1-001','BT1-002');
    INSERT INTO card_images VALUES ('BT1-001','en','','a.png');
  `);
  db.close();
}

function run(runAt = "2026-01-01T00:00:00Z") {
  const out = execFileSync(
    "npx",
    ["tsx", "scripts/diff-refresh.ts", before(), after(), `--run-at=${runAt}`],
    { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  return JSON.parse(out.trim().split("\n").pop()!);
}

function rows() {
  const db = new Database(after(), { readonly: true });
  const r = db.prepare("SELECT * FROM refresh_changes ORDER BY kind, code").all();
  db.close();
  return r as Record<string, string>[];
}

function edit(sql: string) {
  const db = new Database(after());
  db.exec(sql);
  db.close();
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cdb-diff-"));
  seed(before());
  fs.copyFileSync(before(), after());
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("diff-refresh", () => {
  it("reports nothing when nothing changed", () => {
    const s = run();
    expect(s.total).toBe(0);
    expect(rows()).toEqual([]);
  });

  it("catches a new card", () => {
    edit(`INSERT INTO cards (id, code, name, card_type) VALUES ('c','BT1-003','Piyomon','Digimon')`);
    expect(run().cardsAdded).toBe(1);
    expect(rows()[0]).toMatchObject({ kind: "card_added", code: "BT1-003", after: "Piyomon" });
  });

  it("catches a card disappearing, which should never happen", () => {
    // sync-cards never deletes — reporting it is the point.
    edit(`DELETE FROM cards WHERE code='BT1-002'`);
    expect(run().cardsRemoved).toBe(1);
  });

  it("catches an upstream errata, with both sides", () => {
    edit(`UPDATE cards SET main_effect='new text' WHERE code='BT1-001'`);
    const s = run();
    expect(s.fieldsChanged).toBe(1);
    expect(rows()[0]).toMatchObject({
      kind: "field_changed",
      code: "BT1-001",
      field: "main_effect",
      before: "old text",
      after: "new text",
    });
  });

  it("treats NULL and empty string as the same value", () => {
    // Scrapers write '' where others write NULL; flagging that as a change
    // would fill the log with noise on every run.
    edit(`UPDATE cards SET main_effect='' WHERE code='BT1-002'`);
    expect(run().fieldsChanged).toBe(0);
  });

  it("catches translation changes per language", () => {
    edit(`UPDATE card_translations SET effect_main='新テキスト' WHERE code='BT1-001' AND lang='ja'`);
    edit(`INSERT INTO card_translations (code,lang,name) VALUES ('BT1-002','zh','加布兽')`);
    const s = run();
    expect(s.translationsChanged).toBe(1);
    expect(s.translationsAdded).toBe(1);
    expect(rows().find((r) => r.kind === "translation_changed")).toMatchObject({
      lang: "ja",
      field: "effect_main",
    });
  });

  it("catches every shape of banlist move", () => {
    edit(`
      UPDATE card_restrictions SET status='banned', max_count=0 WHERE identity='BT1-001';
      INSERT INTO card_restrictions VALUES ('digimon','BT1-002','limited_1',1);
    `);
    const s = run();
    expect(s.restrictions).toBe(2);
    const kinds = rows().map((r) => r.kind);
    expect(kinds).toContain("restriction_changed");
    expect(kinds).toContain("restriction_added");
  });

  it("notices a restriction being LIFTED, not just added", () => {
    edit(`DELETE FROM card_restrictions WHERE identity='BT1-001'`);
    expect(run().restrictions).toBe(1);
    expect(rows()[0]).toMatchObject({ kind: "restriction_removed", before: "limited_1" });
  });

  it("counts new artwork rather than listing it", () => {
    // An art refresh can touch thousands of rows; listing them would bury a
    // real errata underneath.
    edit(`INSERT INTO card_images VALUES ('BT1-001','en','_P1','p1.png'),('BT1-001','ja','','j.png')`);
    const s = run();
    expect(s.artAdded).toEqual({ en: 1, ja: 1 });
    expect(rows().filter((r) => r.kind.startsWith("art"))).toHaveLength(0);
  });

  it("truncates a very long value instead of storing the whole card", () => {
    edit(`UPDATE cards SET main_effect='${"x".repeat(900)}' WHERE code='BT1-001'`);
    run();
    const after = rows()[0].after;
    expect(after.length).toBeLessThan(600);
    expect(after.endsWith("…")).toBe(true);
  });

  it("keeps runs apart instead of merging them", () => {
    edit(`UPDATE cards SET main_effect='v2' WHERE code='BT1-001'`);
    run("2026-01-01T00:00:00Z");
    run("2026-01-08T00:00:00Z");
    const byRun = new Set(rows().map((r) => r.run_at));
    expect(byRun.size).toBe(2);
    expect(rows()).toHaveLength(2);
  });
});
