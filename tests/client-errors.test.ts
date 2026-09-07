/**
 * 浏览器错误的落盘。
 *
 * The store behind `/api/client-error`. It exists because an error boundary
 * that fires in the browser leaves nothing on the server, so "the site showed
 * an error page a few times today" cannot be investigated. Being diagnostic
 * exhaust, its rules are about not becoming a problem itself: bounded fields,
 * bounded file, and never throwing.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  MAX_ENTRIES,
  readClientErrors,
  recordClientError,
  sanitize,
} from "@/lib/client-errors";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cdb-cerr-"));
  process.env.CDB_DATA_DIR = dir;
});
afterEach(() => {
  delete process.env.CDB_DATA_DIR;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("sanitize", () => {
  it("keeps the fields the panel sends, and stamps the time", () => {
    const at = new Date("2026-09-07T05:00:00Z");
    expect(
      sanitize(
        {
          url: "https://x/digimon/decks",
          name: "Error",
          message: "boom",
          digest: "123",
          stack: "at foo",
          stale: true,
        },
        at,
      ),
    ).toEqual({
      at: "2026-09-07T05:00:00.000Z",
      url: "https://x/digimon/decks",
      name: "Error",
      message: "boom",
      digest: "123",
      stack: "at foo",
      stale: true,
    });
  });

  it("drops anything else the request happens to carry", () => {
    // The endpoint is public; whatever arrives is not a reason to store it.
    const e = sanitize({ message: "m", evil: "x".repeat(10), stale: "yes" });
    expect(Object.keys(e).sort()).toEqual([
      "at",
      "digest",
      "message",
      "name",
      "stack",
      "stale",
      "url",
    ]);
    expect((e as Record<string, unknown>).evil).toBeUndefined();
    // Only a real boolean marks a self-healed stale build.
    expect(e.stale).toBeUndefined();
  });

  it("clips a long stack instead of storing it whole", () => {
    const e = sanitize({ stack: "x".repeat(9999) });
    expect(e.stack!.length).toBe(2000);
  });

  it("survives junk", () => {
    expect(sanitize(null).message).toBeUndefined();
    expect(sanitize("string").message).toBeUndefined();
  });
});

describe("the file", () => {
  it("keeps entries in order, newest last", () => {
    recordClientError(sanitize({ message: "first" }));
    recordClientError(sanitize({ message: "second" }));
    expect(readClientErrors().map((e) => e.message)).toEqual([
      "first",
      "second",
    ]);
  });

  it("stops growing: the oldest fall off", () => {
    for (let i = 0; i < MAX_ENTRIES + 20; i++) {
      recordClientError(sanitize({ message: `e${i}` }));
    }
    const all = readClientErrors();
    expect(all).toHaveLength(MAX_ENTRIES);
    expect(all[0].message).toBe(`e${20}`);
    expect(all[all.length - 1].message).toBe(`e${MAX_ENTRIES + 19}`);
  });

  it("reads an absent file as empty", () => {
    expect(readClientErrors()).toEqual([]);
  });

  it("never throws, whatever the file contains", () => {
    fs.writeFileSync(path.join(dir, "client-errors.log"), "{ not json\n");
    expect(readClientErrors()).toEqual([]);
    expect(() => recordClientError(sanitize({ message: "m" }))).not.toThrow();
    expect(readClientErrors().map((e) => e.message)).toEqual(["m"]);
  });
});
