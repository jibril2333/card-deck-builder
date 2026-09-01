import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The progress file is written by a scraper and read by the admin route, in
 * two different processes — so what matters is the contract between them:
 * throttling doesn't lose the last word, and a stale file reads as nothing.
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
  vi.useRealTimers();
});

async function load() {
  return await import("@/lib/refresh-progress");
}

describe("refresh progress", () => {
  it("round-trips a count", async () => {
    const { reportProgress, readProgress } = await load();
    reportProgress({ script: "scrape-pao-prices", done: 3, total: 10, note: "BT1-084" }, true);
    const got = readProgress();
    expect(got?.done).toBe(3);
    expect(got?.total).toBe(10);
    expect(got?.note).toBe("BT1-084");
  });

  it("throttles, but a forced write always lands", async () => {
    const { reportProgress, readProgress } = await load();
    reportProgress({ script: "s", done: 1, total: 10 }, true);
    reportProgress({ script: "s", done: 2, total: 10 }); // swallowed
    expect(readProgress()?.done).toBe(1);
    reportProgress({ script: "s", done: 9, total: 10 }, true);
    expect(readProgress()?.done).toBe(9);
  });

  it("treats a count that stopped moving as no count", async () => {
    const { readProgress } = await load();
    // What a killed scrape leaves behind: a real file, an old timestamp.
    fs.writeFileSync(
      path.join(dir, "refresh-progress.json"),
      JSON.stringify({
        script: "scrape-pao-prices",
        done: 5,
        total: 10,
        updatedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
      }),
    );
    expect(readProgress()).toBeNull();
    // Still readable if you ask for a window that covers it.
    expect(readProgress(60 * 60_000)?.done).toBe(5);
  });

  it("clears, and reads nothing when there is nothing", async () => {
    const { reportProgress, readProgress, clearProgress } = await load();
    expect(readProgress()).toBeNull();
    reportProgress({ script: "s", done: 1, total: 2 }, true);
    clearProgress();
    expect(readProgress()).toBeNull();
  });
});
