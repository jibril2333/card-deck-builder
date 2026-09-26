import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { seedDigimonDb, seedUserDb } from "./e2e/fixtures/seed";

/**
 * A deck write that meets another writer waits for it instead of failing.
 *
 * The app is not the only writer of the user database: Litestream writes its
 * own `_litestream_seq` / `_litestream_lock` rows there on every sync (every
 * 10s against R2). A transaction that starts as a READ — BEGIN DEFERRED, which
 * is what better-sqlite3's `db.transaction()` issues — and then needs the
 * write lock while Litestream holds it gets SQLITE_BUSY at once: SQLite does
 * not run the busy handler for a connection already inside a read
 * transaction. That was the "database is locked" error page on 2026-09-24,
 * adding a card from the card page.
 *
 * So this holds the write lock from a second process — standing in for
 * Litestream — for a moment, and makes the real repository write during it.
 * Taken as BEGIN IMMEDIATE, the write queues behind the lock and lands.
 */
const ROOT = process.cwd();
const HOLD_MS = 600;
let dir: string;

async function probe(body: string): Promise<Record<string, unknown>> {
  const script = path.join(dir, "probe.ts");
  const userDb = path.join(dir, "digimon-user.db");
  const marker = path.join(dir, "locked");
  fs.writeFileSync(
    script,
    `import { spawn } from "node:child_process";
     import fs from "node:fs";
     import * as digimon from "${ROOT}/src/lib/db/digimon";
     const out: Record<string, unknown> = {};
     const sleep = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

     /** Another process takes the write lock and keeps it for HOLD_MS. */
     function holdWriteLock() {
       fs.rmSync(${JSON.stringify(marker)}, { force: true });
       const child = spawn(process.execPath, ["-e", \`
         const D = require(${JSON.stringify(path.join(ROOT, "node_modules/better-sqlite3"))});
         const db = new D(${JSON.stringify(userDb)});
         db.exec("CREATE TABLE IF NOT EXISTS _other_writer (n INTEGER)");
         db.exec("BEGIN IMMEDIATE");
         db.prepare("INSERT INTO _other_writer VALUES (1)").run();
         require("fs").writeFileSync(${JSON.stringify(marker)}, "");
         Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ${HOLD_MS});
         db.exec("COMMIT");
       \`], { stdio: "inherit" });
       while (!fs.existsSync(${JSON.stringify(marker)})) sleep(10);
       return child;
     }
     const attempt = (name: string, fn: () => void) => {
       const t = Date.now();
       try { fn(); out[name] = "ok"; }
       catch (e) { out[name] = \`\${(e as { code?: string }).code ?? ""}:\${(e as Error).message}\`; }
       out[name + "Ms"] = Date.now() - t;
     };
     ${body}
     console.log(JSON.stringify(out));`,
  );
  const { stdout } = await promisify(execFile)("npx", ["tsx", script], {
    cwd: ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      CDB_DIGIMON_DB: path.join(dir, "digimon.db"),
      CDB_DIGIMON_USER_DB: userDb,
    },
  });
  return JSON.parse(stdout.trim().split("\n").pop()!);
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cdb-contention-"));
  seedDigimonDb(path.join(dir, "digimon.db"));
  seedUserDb(path.join(dir, "digimon-user.db"));
});

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("a deck write during another process's write", () => {
  it("waits for the lock and lands", async () => {
    const out = await probe(`
      // Open the connection (and run its migrations) before the lock is taken.
      const deckId = digimon.createDeck({ user_id: "u1", name: "busy", accent_color: "#fff" });

      holdWriteLock();
      attempt("add", () => digimon.adjustDeckCard("u1", deckId, "BT1-084", 1));
      out.cards = digimon.getDeckCards(deckId).map((c) => [c.code, c.quantity]);
    `);

    expect(out.add, String(out.add)).toBe("ok");
    expect(out.cards).toEqual([["BT1-084", 1]]);
    // It really did meet the lock, rather than miss it.
    expect(out.addMs as number).toBeGreaterThanOrEqual(HOLD_MS / 2);
  });

  it("is how every transaction on the app's connection is taken", () => {
    // The test above exercises one write path; this keeps the next one from
    // quietly going back to `tx()`. Each `.transaction(` in src/lib/db must be
    // run through `.immediate(`, so the counts match per file.
    const offenders: string[] = [];
    const walk = (d: string): string[] =>
      fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)],
      );
    for (const f of walk(path.join(ROOT, "src/lib/db"))) {
      if (!f.endsWith(".ts")) continue;
      // Comments mention both words while explaining them; count code only.
      const src = fs
        .readFileSync(f, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      const made = src.match(/\.transaction\(/g)?.length ?? 0;
      const immediate = src.match(/\.immediate\(/g)?.length ?? 0;
      if (made !== immediate) {
        offenders.push(`${path.relative(ROOT, f)}: ${made} transaction(s), ${immediate} immediate`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
