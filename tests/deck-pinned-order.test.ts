/**
 * ★ 主力卡组与其他卡组各自的顺序。
 *
 * The list is two grids, but `sort_order` is one number. A deck that changed
 * section used to carry its old position with it — unstar the third starred
 * deck and it landed third among the others, in the middle of a list it had
 * never been in, at a spot decided by every drag it had ever been part of.
 *
 * The rule these pin down: starring appends to 主力卡组, unstarring returns the
 * deck to the FRONT of 其他卡组 — it is the one you just had in hand, and the
 * other list is the long one — and nothing else changes places.
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

/** Run a snippet against throwaway databases and hand back its JSON stdout. */
async function repo(body: string): Promise<Record<string, unknown>> {
  const script = path.join(dir, `probe-${Math.random().toString(36).slice(2)}.ts`);
  fs.writeFileSync(
    script,
    `import * as digimon from "${ROOT}/src/lib/db/digimon";
     const out: Record<string, unknown> = {};
     /** Deck names in the order the list renders them, per section. */
     const sections = (userId: string) => {
       const all = digimon.listDecksWithCover(userId).filter((d) => d.user_id === userId);
       return {
         pinned: all.filter((d) => d.pinned).map((d) => d.name),
         others: all.filter((d) => !d.pinned).map((d) => d.name),
       };
     };
     ${body}
     console.log("<<<" + JSON.stringify(out) + ">>>");`,
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
  return JSON.parse(stdout.match(/<<<([\s\S]*)>>>/)![1]);
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cdb-pin-"));
  seedDigimonDb(path.join(dir, "digimon.db"));
  seedUserDb(path.join(dir, "digimon-user.db"));
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

/**
 * Four decks in a known order, the first two starred.
 *
 * Every case gets its OWN user: the database is shared across the file, and a
 * second set of decks called A–D under the same account would be read as one
 * eight-deck list.
 */
const setup = (u: string) => `
  const U = "${u}";
  const mk = (n: string) =>
    digimon.createDeck({ user_id: U, name: n, accent_color: "#fff" });
  const a = mk("A"), b = mk("B"), c = mk("C"), d = mk("D");
  digimon.setDeckPinned(U, a, true);
  digimon.setDeckPinned(U, b, true);
  digimon.reorderDecks(U, [a, b]);
  digimon.reorderDecks(U, [c, d]);
`;

describe("starring", () => {
  it("puts the deck at the end of 主力卡组, wherever it sat before", async () => {
    const U = "u-star";
    const out = await repo(`
      ${setup(U)}
      out.before = sections(U);
      // C is first among the others — the position that used to travel with it.
      digimon.setDeckPinned(U, c, true);
      out.after = sections(U);
    `);
    expect(out.before).toEqual({ pinned: ["A", "B"], others: ["C", "D"] });
    expect(out.after).toEqual({ pinned: ["A", "B", "C"], others: ["D"] });
  }, 120_000);

  it("leaves the order of everything else alone", async () => {
    const U = "u-star2";
    const out = await repo(`
      ${setup(U)}
      digimon.setDeckPinned(U, d, true);
      out.s = sections(U);
    `);
    expect(out.s).toEqual({ pinned: ["A", "B", "D"], others: ["C"] });
  }, 120_000);
});

describe("unstarring", () => {
  it("puts the deck at the front of 其他卡组", async () => {
    const U = "u-unstar";
    const out = await repo(`
      ${setup(U)}
      digimon.setDeckPinned(U, a, false);
      out.s = sections(U);
    `);
    expect(out.s).toEqual({ pinned: ["B"], others: ["A", "C", "D"] });
  }, 120_000);

  it("lands in the same place every time it is toggled", async () => {
    const U = "u-toggle";
    const out = await repo(`
      ${setup(U)}
      const trip = () => {
        digimon.setDeckPinned(U, c, true);
        const on = sections(U);
        digimon.setDeckPinned(U, c, false);
        return { on, off: sections(U) };
      };
      out.first = trip();
      out.second = trip();
      out.third = trip();
    `);
    // The whole point: repeating the gesture repeats the result.
    expect(out.second).toEqual(out.first);
    expect(out.third).toEqual(out.first);
    expect(out.first).toEqual({
      on: { pinned: ["A", "B", "C"], others: ["D"] },
      off: { pinned: ["A", "B"], others: ["C", "D"] },
    });
  }, 120_000);

  it("empties the section cleanly and refills it from 0", async () => {
    const U = "u-empty";
    const out = await repo(`
      ${setup(U)}
      digimon.setDeckPinned(U, a, false);
      digimon.setDeckPinned(U, b, false);
      out.emptied = sections(U);
      digimon.setDeckPinned(U, d, true);
      out.refilled = sections(U);
    `);
    expect(out.emptied).toEqual({ pinned: [], others: ["B", "A", "C", "D"] });
    expect(out.refilled).toEqual({ pinned: ["D"], others: ["B", "A", "C"] });
  }, 120_000);
});

describe("someone else's deck", () => {
  it("is left alone, without an error", async () => {
    const out = await repo(`
      const mine = digimon.createDeck({ user_id: "pin2", name: "M", accent_color: "#fff" });
      const theirs = digimon.createDeck({ user_id: "other", name: "T", accent_color: "#fff" });
      digimon.setDeckPinned("pin2", theirs, true);
      out.theirs = digimon.getDeck(theirs)!.pinned;
      out.mine = digimon.getDeck(mine)!.pinned;
    `);
    expect(out.theirs).toBe(0);
    expect(out.mine).toBe(0);
  }, 120_000);
});
