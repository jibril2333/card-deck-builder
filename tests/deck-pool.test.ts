/**
 * 共享卡池 — the held-count rules, driven at the repository.
 *
 * A pool says several decks are built from ONE physical set of cards, so a
 * card's held count belongs to the pool and not to any deck in it. That makes
 * this the only code in the app that writes across several decks at once, and
 * the rules it enforces are invisible from the outside: what the shared count
 * is, what each deck is allowed to show, and who gets skipped.
 *
 * `tests/e2e/deck-pool.spec.ts` covers the UI around this (pooling a deck from
 * its page, the member picker). It cannot see any of the rules below — by the
 * time a number reaches the screen it has already been levelled.
 *
 * Same harness as `deck-lock.test.ts`: a child process against throwaway
 * databases, no browser and no Server Action in between. In the e2e fixture a
 * card's id IS its code, which is why the calls read `"BT1-084"`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { seedDigimonDb, seedUserDb } from "./e2e/fixtures/seed";

const ROOT = process.cwd();
let dir: string;

/** Run a snippet against temp DBs and hand back its JSON stdout. */
async function repo(body: string): Promise<Record<string, unknown>> {
  const script = path.join(dir, `probe-${Math.random().toString(36).slice(2)}.ts`);
  fs.writeFileSync(
    script,
    `import * as digimon from "${ROOT}/src/lib/db/digimon";
     const out: Record<string, unknown> = {};
     /** [quantity, purchased] for one card in one deck. */
     const held = (deckId: string, code: string) => {
       const c = digimon.getDeckCards(deckId).find((c) => c.code === code);
       return c ? [c.quantity, c.purchased] : null;
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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cdb-pool-"));
  seedDigimonDb(path.join(dir, "digimon.db"));
  seedUserDb(path.join(dir, "digimon-user.db"));
});

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("pooling decks together", () => {
  it("levels held up to the best-stocked deck, capped per deck", async () => {
    const out = await repo(`
      const a = digimon.createDeck({ user_id: "u1", name: "A", accent_color: "#fff" });
      const b = digimon.createDeck({ user_id: "u1", name: "B", accent_color: "#fff" });
      // A runs 4 and owns 3; B runs 2 and owns none.
      digimon.setDeckCardQuantity("u1", a, "BT1-084", 4);
      digimon.setDeckCardPurchased("u1", a, "BT1-084", 3);
      digimon.setDeckCardQuantity("u1", b, "BT1-084", 2);

      out.before = [held(a, "BT1-084"), held(b, "BT1-084")];
      const g = digimon.createGroup("u1", "池");
      digimon.setGroupDecks("u1", g, [a, b]);
      out.after = [held(a, "BT1-084"), held(b, "BT1-084")];
    `);
    expect(out.before).toEqual([[4, 3], [2, 0]]);
    // B inherits the shared 3, but shows only the 2 it actually runs — the
    // third copy exists, it just isn't in that list.
    expect(out.after).toEqual([[4, 3], [2, 2]]);
  }, 120_000);

  it("does nothing to a pool of one", async () => {
    const out = await repo(`
      const a = digimon.createDeck({ user_id: "u1", name: "独", accent_color: "#fff" });
      digimon.setDeckCardQuantity("u1", a, "BT1-084", 2);
      const g = digimon.createGroup("u1", "单deck池");
      digimon.setGroupDecks("u1", g, [a]);
      out.held = held(a, "BT1-084");
      out.peers = digimon.decksSharingPoolWith("u1", a).length;
    `);
    expect(out.held).toEqual([2, 0]);
    // Itself, and no levelling ran — a pool needs two decks to mean anything.
    expect(out.peers).toBe(1);
  }, 120_000);

  it("skips a locked member instead of failing the whole pool", async () => {
    const out = await repo(`
      const a = digimon.createDeck({ user_id: "u1", name: "A", accent_color: "#fff" });
      const b = digimon.createDeck({ user_id: "u1", name: "B", accent_color: "#fff" });
      const c = digimon.createDeck({ user_id: "u1", name: "C", accent_color: "#fff" });
      for (const d of [a, b, c]) digimon.setDeckCardQuantity("u1", d, "BT1-084", 3);
      digimon.setDeckCardPurchased("u1", a, "BT1-084", 3);
      digimon.setDeckLocked("u1", c, true);

      const g = digimon.createGroup("u1", "池");
      digimon.setGroupDecks("u1", g, [a, b, c]);
      out.a = held(a, "BT1-084");
      out.b = held(b, "BT1-084");
      out.c = held(c, "BT1-084");
    `);
    expect(out.a).toEqual([3, 3]);
    expect(out.b).toEqual([3, 3]);
    // The closed deck keeps its own numbers. A deck you closed is a record of
    // what it held when you closed it.
    expect(out.c).toEqual([3, 0]);
  }, 120_000);
});

describe("the shared count itself", () => {
  it("reads a stale over-purchase as what the deck actually runs", async () => {
    const out = await repo(`
      const a = digimon.createDeck({ user_id: "u1", name: "A", accent_color: "#fff" });
      const b = digimon.createDeck({ user_id: "u1", name: "B", accent_color: "#fff" });
      digimon.setDeckCardQuantity("u1", a, "BT1-084", 4);
      digimon.setDeckCardPurchased("u1", a, "BT1-084", 4);
      // Cutting the deck down to one copy leaves purchased at 4 on the row.
      digimon.setDeckCardQuantity("u1", a, "BT1-084", 1);
      digimon.setDeckCardQuantity("u1", b, "BT1-084", 4);
      out.row = held(a, "BT1-084");
      out.pooled = digimon.pooledOwnedForCard([a, b], "BT1-084");
      out.need = digimon.maxNeedForCard([a, b], "BT1-084");
    `);
    // The raw row still says 4 …
    expect(out.row).toEqual([1, 4]);
    // … but the pool counts what that deck runs, so one copy, not four.
    expect(out.pooled).toBe(1);
    // Need is the largest list in the pool.
    expect(out.need).toBe(4);
  }, 120_000);

  it("caps every deck at its own quantity when held is set", async () => {
    const out = await repo(`
      const a = digimon.createDeck({ user_id: "u1", name: "A", accent_color: "#fff" });
      const b = digimon.createDeck({ user_id: "u1", name: "B", accent_color: "#fff" });
      digimon.setDeckCardQuantity("u1", a, "BT1-084", 4);
      digimon.setDeckCardQuantity("u1", b, "BT1-084", 1);
      digimon.reconcilePoolCard([a, b], "BT1-084", 3);
      out.three = [held(a, "BT1-084"), held(b, "BT1-084")];
      // Selling the lot: held drops everywhere, and a negative is a zero.
      digimon.reconcilePoolCard([a, b], "BT1-084", -2);
      out.none = [held(a, "BT1-084"), held(b, "BT1-084")];
    `);
    expect(out.three).toEqual([[4, 3], [1, 1]]);
    expect(out.none).toEqual([[4, 0], [1, 0]]);
  }, 120_000);

  it("leaves decks in other pools alone", async () => {
    const out = await repo(`
      const a = digimon.createDeck({ user_id: "u1", name: "A", accent_color: "#fff" });
      const b = digimon.createDeck({ user_id: "u1", name: "B", accent_color: "#fff" });
      const lone = digimon.createDeck({ user_id: "u1", name: "无池", accent_color: "#fff" });
      for (const d of [a, b, lone]) digimon.setDeckCardQuantity("u1", d, "BT1-084", 2);
      const g = digimon.createGroup("u1", "池");
      digimon.setGroupDecks("u1", g, [a, b]);

      const peers = digimon.decksSharingPoolWith("u1", a);
      digimon.reconcilePoolCard(peers, "BT1-084", 2);
      out.pooled = [held(a, "BT1-084"), held(b, "BT1-084")];
      out.lone = held(lone, "BT1-084");
      // An unpooled deck reports no peers at all, which is how the action
      // layer decides to write only that one deck.
      out.lonePeers = digimon.decksSharingPoolWith("u1", lone);
    `);
    expect(out.pooled).toEqual([[2, 2], [2, 2]]);
    expect(out.lone).toEqual([2, 0]);
    expect(out.lonePeers).toEqual([]);
  }, 120_000);
});

describe("leaving a pool", () => {
  it("stops the two decks tracking each other", async () => {
    const out = await repo(`
      const a = digimon.createDeck({ user_id: "u1", name: "A", accent_color: "#fff" });
      const b = digimon.createDeck({ user_id: "u1", name: "B", accent_color: "#fff" });
      digimon.setDeckCardQuantity("u1", a, "BT1-084", 3);
      digimon.setDeckCardQuantity("u1", b, "BT1-084", 3);
      const g = digimon.createGroup("u1", "池");
      digimon.setGroupDecks("u1", g, [a, b]);

      // B leaves.
      digimon.setDeckGroups("u1", b, []);
      out.peersA = digimon.decksSharingPoolWith("u1", a);
      out.peersB = digimon.decksSharingPoolWith("u1", b);

      // Buying for A now moves only A.
      digimon.reconcilePoolCard(digimon.decksSharingPoolWith("u1", a).concat(a), "BT1-084", 3);
      out.a = held(a, "BT1-084");
      out.b = held(b, "BT1-084");
    `);
    // A is alone in the group, B is in none.
    expect(out.peersA).toEqual([expect.any(String)]);
    expect(out.peersB).toEqual([]);
    expect(out.a).toEqual([3, 3]);
    expect(out.b).toEqual([3, 0]);
  }, 120_000);

  it("only pools decks you own", async () => {
    const out = await repo(`
      const mine = digimon.createDeck({ user_id: "u1", name: "我的", accent_color: "#fff" });
      const theirs = digimon.createDeck({ user_id: "u2", name: "别人的", accent_color: "#fff" });
      const g = digimon.createGroup("u1", "池");
      digimon.setGroupDecks("u1", g, [mine, theirs]);
      out.members = digimon.groupMemberDeckIds(g).length;
      try { digimon.setGroupDecks("u2", g, [theirs]); out.hijack = "ok"; }
      catch (e) { out.hijack = (e as Error).name; }
    `);
    // The other user's deck is silently dropped, not added.
    expect(out.members).toBe(1);
    // And someone else can't rewrite the membership of your pool.
    expect(out.hijack).toBe("OwnershipError");
  }, 120_000);
});
