import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { seedDigimonDb, seedUserDb } from "./e2e/fixtures/seed";
import { describeExport, isUserExport, type UserExport } from "@/lib/user-data";

/**
 * Moving one account's work from one install to another.
 *
 * Two temp databases, because that IS the scenario — the whole feature exists
 * because two deployments share no ids, and a test with one database would
 * pass while proving nothing about the part that matters: every row must land
 * under the DESTINATION's user, not the id written in the file.
 *
 * Driven in child processes so each side gets its own module-level connection.
 */
const ROOT = process.cwd();
let dirA: string;
let dirB: string;

async function run(dir: string, body: string): Promise<Record<string, unknown>> {
  const script = path.join(dir, `probe-${Math.random().toString(36).slice(2)}.ts`);
  fs.writeFileSync(
    script,
    `import * as digimon from "${ROOT}/src/lib/db/digimon";
     import { exportUserData, importUserData } from "${ROOT}/src/lib/db/user-transfer";
     import fs from "node:fs";
     const out: Record<string, unknown> = {};
     ${body}
     console.log("@@" + JSON.stringify(out));`,
  );
  const { stdout } = await promisify(execFile)("npx", ["tsx", script], {
    cwd: ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      CDB_DIGIMON_DB: path.join(dir, "digimon.db"),
      CDB_DIGIMON_USER_DB: path.join(dir, "digimon-user.db"),
    },
  });
  return JSON.parse(stdout.split("@@").pop()!.trim());
}

function makeInstall(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cdb-xfer-"));
  seedDigimonDb(path.join(dir, "digimon.db"));
  seedUserDb(path.join(dir, "digimon-user.db"));
  return dir;
}

beforeAll(() => {
  dirA = makeInstall();
  dirB = makeInstall();
});
afterAll(() => {
  for (const d of [dirA, dirB]) fs.rmSync(d, { recursive: true, force: true });
});

describe("user data transfer", () => {
  it("carries a deck from one install to another, under the new owner", async () => {
    const file = path.join(os.tmpdir(), `cdb-export-${Date.now()}.json`);

    // Install A: build something worth moving.
    const made = await run(
      dirA,
      `const deckId = digimon.createDeck({ user_id: "alice", name: "红混", accent_color: "#f00" });
       digimon.setDeckCardQuantity("alice", deckId, "BT1-084", 4);
       digimon.setDeckCardQuantity("alice", deckId, "BT1-085", 2);
       digimon.updateDeckMeta("alice", deckId, { notes: "打 TS 用", version: "BT-01" });
       digimon.setCardPrice("alice", "BT1-084", 1200);
       digimon.setCardCollectionQuantity("alice", "BT1-084", "", 3);
       const data = exportUserData("alice");
       fs.writeFileSync(${JSON.stringify(file)}, JSON.stringify(data));
       out.deckId = deckId;
       out.decks = data.decks.length;
       out.cards = data.decks[0].cards.map((c: any) => [c.code, c.quantity]);
       out.hasAccount = JSON.stringify(data).includes("password") || JSON.stringify(data).includes("alice@");`,
    );
    expect(made.decks).toBe(1);
    expect(made.cards).toEqual([
      ["BT1-084", 4],
      ["BT1-085", 2],
    ]);
    // The file must not be a way to carry an account around.
    expect(made.hasAccount).toBe(false);

    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as UserExport;
    expect(isUserExport(parsed)).toBe(true);
    expect(describeExport(parsed)).toContain("1 副卡组");

    // Install B: a different person id entirely.
    const landed = await run(
      dirB,
      `const data = JSON.parse(fs.readFileSync(${JSON.stringify(file)}, "utf8"));
       out.report = importUserData("bob", data);
       const decks = digimon.listDecks("bob");
       out.names = decks.map((d: any) => d.name);
       out.owner = decks[0].user_id;
       out.notes = decks[0].notes;
       out.version = decks[0].version;
       out.cards = digimon.getDeckCards(decks[0].id).map((c: any) => [c.code, c.quantity]);
       out.price = digimon.getCardPrice("bob", "BT1-084");`,
    );
    expect(landed.names).toEqual(["红混"]);
    // The point of the whole exercise: owned by the importer, not by "alice".
    expect(landed.owner).toBe("bob");
    expect(landed.notes).toBe("打 TS 用");
    expect(landed.version).toBe("BT-01");
    expect(landed.cards).toEqual([
      ["BT1-084", 4],
      ["BT1-085", 2],
    ]);
    expect(landed.price).toBe(1200);
    expect((landed.report as { decks: { created: number } }).decks.created).toBe(1);

    fs.rmSync(file, { force: true });
  }, 180_000);

  it("reports cards the destination doesn't have instead of dropping them", async () => {
    // A file naming a card this install has never scraped — the everyday case
    // when the source is a set ahead of the destination.
    const file = path.join(os.tmpdir(), `cdb-missing-${Date.now()}.json`);
    fs.writeFileSync(
      file,
      JSON.stringify({
        format: "cdb-user-export",
        version: 1,
        exportedAt: new Date().toISOString(),
        source: { app: "test" },
        decks: [
          {
            id: "deck-missing",
            name: "含未来卡",
            notes: null,
            accent_color: "#fff",
            accent_color2: null,
            cover_card_code: null,
            cover_variant: "",
            sort_order: 0,
            pinned: 0,
            version: null,
            locked: 0,
            created_at: "2026-01-01 00:00:00",
            updated_at: "2026-01-01 00:00:00",
            cards: [
              { code: "BT1-084", quantity: 1, purchased: 0 },
              { code: "BT99-999", quantity: 4, purchased: 0 },
            ],
            adjustments: [],
          },
        ],
        groups: [],
        collection: [],
        prices: [],
      }),
    );

    const out = await run(
      dirB,
      `const data = JSON.parse(fs.readFileSync(${JSON.stringify(file)}, "utf8"));
       out.report = importUserData("bob", data);
       out.cards = digimon.getDeckCards("deck-missing").map((c: any) => c.code);`,
    );
    const report = out.report as { missingCards: string[]; cards: number };
    expect(report.missingCards).toEqual(["BT99-999"]);
    // The rest of the deck still arrived.
    expect(out.cards).toEqual(["BT1-084"]);
    fs.rmSync(file, { force: true });
  }, 120_000);

  it("won't take over a deck id that belongs to somebody else here", async () => {
    const out = await run(
      dirB,
      `const carol = digimon.createDeck({ user_id: "carol", name: "别人的", accent_color: "#000" });
       const data = { format: "cdb-user-export", version: 1, exportedAt: "", source: { app: "t" },
         decks: [{ id: carol, name: "抢过来", notes: null, accent_color: "#fff", accent_color2: null,
                   cover_card_code: null, cover_variant: "", sort_order: 0, pinned: 0, version: null,
                   locked: 0, created_at: "2026-01-01 00:00:00", updated_at: "2026-01-01 00:00:00",
                   cards: [], adjustments: [] }],
         groups: [], collection: [], prices: [] };
       out.report = importUserData("bob", data as any);
       out.stillCarols = digimon.getDeck(carol)!.name;`,
    );
    expect((out.report as { conflicts: string[] }).conflicts).toEqual(["抢过来"]);
    expect(out.stillCarols).toBe("别人的");
  }, 120_000);
});
