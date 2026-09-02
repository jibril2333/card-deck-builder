import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The progress files are written by the scrapers and read by the admin route,
 * in different processes — so what matters is the contract between them:
 * two scripts running at once don't overwrite each other, throttling doesn't
 * lose the last word, and a stale file reads as nothing.
 */
let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cdb-progress-"));
  process.env.CDB_DATA_DIR = dir;
  vi.resetModules();
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.CDB_DATA_DIR;
});

async function load() {
  return await import("@/lib/refresh-progress");
}

describe("refresh progress", () => {
  it("round-trips a count", async () => {
    const { reportProgress, readProgress } = await load();
    reportProgress(
      { script: "scrape-pao-prices", done: 3, total: 10, note: "BT1-084" },
      true,
    );
    const [got] = readProgress();
    expect(got.done).toBe(3);
    expect(got.total).toBe(10);
    expect(got.note).toBe("BT1-084");
  });

  it("keeps the two price scrapes apart", async () => {
    // They run at the same time — one file each, or they clobber each other.
    const { reportProgress, readProgress } = await load();
    reportProgress({ script: "scrape-cardrush-prices", done: 100, total: 4400 }, true);
    reportProgress({ script: "scrape-pao-prices", done: 7, total: 4400 }, true);
    const rows = readProgress();
    expect(rows.map((r) => [r.script, r.done])).toEqual([
      ["scrape-cardrush-prices", 100],
      ["scrape-pao-prices", 7],
    ]);
  });

  it("throttles per script, and a forced write always lands", async () => {
    const { reportProgress, readProgress } = await load();
    reportProgress({ script: "s", done: 1, total: 10 }, true);
    reportProgress({ script: "s", done: 2, total: 10 }); // swallowed
    expect(readProgress()[0].done).toBe(1);
    // A different script is not throttled by the first one's write.
    reportProgress({ script: "t", done: 5, total: 10 });
    expect(readProgress().find((r) => r.script === "t")?.done).toBe(5);
    reportProgress({ script: "s", done: 9, total: 10 }, true);
    expect(readProgress().find((r) => r.script === "s")?.done).toBe(9);
  });

  it("treats a count that stopped moving as no count", async () => {
    const { readProgress } = await load();
    // What a killed scrape leaves behind: a real file, an old timestamp.
    fs.writeFileSync(
      path.join(dir, "refresh-progress-scrape-pao-prices.json"),
      JSON.stringify({
        script: "scrape-pao-prices",
        done: 5,
        total: 10,
        updatedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
      }),
    );
    expect(readProgress()).toEqual([]);
    expect(readProgress(60 * 60_000)[0].done).toBe(5);
  });

  it("clears every script's file", async () => {
    const { reportProgress, readProgress, clearProgress } = await load();
    expect(readProgress()).toEqual([]);
    reportProgress({ script: "a", done: 1, total: 2 }, true);
    reportProgress({ script: "b", done: 1, total: 2 }, true);
    clearProgress();
    expect(readProgress()).toEqual([]);
  });
});
