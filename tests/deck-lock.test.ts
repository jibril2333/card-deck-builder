import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { seedDigimonDb, seedUserDb } from "./e2e/fixtures/seed";

/**
 * A locked deck refuses writes at the REPOSITORY, not just in the UI.
 *
 * That distinction is the whole feature: the deck page can hide its ＋/− and
 * the card page can grey out a row, but 加入卡组 is two taps from any card in
 * the game and there are two dozen other write paths. So this drives
 * `db/digimon.ts` directly, in a child process against throwaway databases,
 * with no browser and no Server Action in between — if the gate were only in
 * the components, every expectation here would fail.
 */
const ROOT = process.cwd();
let dir: string;

/** Run a snippet against temp DBs and hand back its JSON stdout. */
async function repo(body: string): Promise<Record<string, unknown>> {
  const script = path.join(dir, "probe.ts");
  fs.writeFileSync(
    script,
    `import * as digimon from "${ROOT}/src/lib/db/digimon";
     import { DeckLockedError } from "${ROOT}/src/lib/db/deck-shared";
     const out: Record<string, unknown> = {};
     const attempt = (name: string, fn: () => void) => {
       try { fn(); out[name] = "ok"; }
       catch (e) { out[name] = e instanceof DeckLockedError ? "locked" : \`other:\${(e as Error).message}\`; }
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
      CDB_DIGIMON_USER_DB: path.join(dir, "digimon-user.db"),
    },
  });
  return JSON.parse(stdout.trim().split("\n").pop()!);
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cdb-lock-"));
  // The e2e fixture's seeders, reused: they produce a cards DB stamped at the
  // schema version where the catch-up migrations stop applying, which is the
  // only way a from-scratch database gets past migration 1.
  seedDigimonDb(path.join(dir, "digimon.db"));
  seedUserDb(path.join(dir, "digimon-user.db"));
});

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("a locked deck", () => {
  it("refuses every kind of write, and lets you unlock it again", async () => {
    const out = await repo(`
      const deckId = digimon.createDeck({ user_id: "u1", name: "锁", accent_color: "#fff" });
      digimon.setDeckCardQuantity("u1", deckId, "BT1-084", 3);
      digimon.setDeckLocked("u1", deckId, true);

      attempt("addCard",   () => digimon.setDeckCardQuantity("u1", deckId, "BT1-085", 1));
      attempt("adjust",    () => digimon.adjustDeckCard("u1", deckId, "BT1-084", 1));
      attempt("purchased", () => digimon.setDeckCardPurchased("u1", deckId, "BT1-084", 1));
      attempt("rename",    () => digimon.updateDeckMeta("u1", deckId, { name: "改名" }));
      attempt("version",   () => digimon.updateDeckMeta("u1", deckId, { version: "BT-26" }));
      attempt("cover",     () => digimon.setDeckCover("u1", deckId, "BT1-084"));
      attempt("coverArt",  () => digimon.setDeckCoverVariant("u1", deckId, "_P1"));
      attempt("note",      () => digimon.addDeckAdjustment("u1", deckId, "BT1-085", "add"));
      attempt("delete",    () => digimon.deleteDeck("u1", deckId));

      // Nothing above may have landed.
      out.cards = digimon.getDeckCards(deckId).map((c) => [c.code, c.quantity]);
      out.name = digimon.getDeck(deckId)!.name;

      // Pinning is about the LIST, not the deck — deliberately still allowed.
      attempt("pin", () => digimon.setDeckPinned("u1", deckId, true));

      digimon.setDeckLocked("u1", deckId, false);
      attempt("afterUnlock", () => digimon.setDeckCardQuantity("u1", deckId, "BT1-085", 2));
      out.cardsAfter = digimon.getDeckCards(deckId).map((c) => [c.code, c.quantity]);
    `);

    for (const k of [
      "addCard",
      "adjust",
      "purchased",
      "rename",
      "version",
      "cover",
      "coverArt",
      "note",
      "delete",
    ]) {
      expect(out[k], `${k} should have been refused`).toBe("locked");
    }
    // The deck is exactly as it was.
    expect(out.cards).toEqual([["BT1-084", 3]]);
    expect(out.name).toBe("锁");
    expect(out.pin).toBe("ok");
    // And the lock is a door, not a wall.
    expect(out.afterUnlock).toBe("ok");
    expect(out.cardsAfter).toEqual([
      ["BT1-084", 3],
      ["BT1-085", 2],
    ]);
  }, 120_000);
});
