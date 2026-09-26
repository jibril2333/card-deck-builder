/**
 * What a server error leaves in the data directory.
 *
 * The shapes below are what Next passes to onRequestError: the error (with a
 * digest), the request (path, method, headers) and where it happened.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readServerErrors,
  recordServerError,
  toServerError,
} from "@/lib/server-errors";

const REQUEST = {
  path: "/digimon/groups/abc?x=1",
  method: "GET",
  headers: { cookie: "cdb_session=SECRET", "user-agent": "Safari" },
};
const CONTEXT = { routeType: "render", routePath: "/[game]/groups/[id]" };

function busy(digest = "2297508878") {
  const e = new Error("database is locked") as Error & { code: string; digest: string };
  e.name = "SqliteError";
  e.code = "SQLITE_BUSY";
  e.digest = digest;
  return e;
}

let dir: string;
const prev = process.env.CDB_DATA_DIR;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "server-errors-"));
  process.env.CDB_DATA_DIR = dir;
});
afterEach(() => {
  process.env.CDB_DATA_DIR = prev;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("toServerError", () => {
  it("keeps the cause, the digest and where it happened", () => {
    expect(toServerError(busy(), REQUEST, CONTEXT)).toMatchObject({
      digest: "2297508878",
      code: "SQLITE_BUSY",
      message: "database is locked",
      name: "SqliteError",
      routeType: "render",
      routePath: "/[game]/groups/[id]",
      method: "GET",
      path: "/digimon/groups/abc?x=1",
    });
  });

  it("never stores the request headers", () => {
    const stored = JSON.stringify(toServerError(busy(), REQUEST, CONTEXT));
    expect(stored).not.toContain("SECRET");
    expect(stored).not.toContain("Safari");
  });

  it("skips redirect() and notFound(), which are not failures", () => {
    for (const digest of [
      "NEXT_REDIRECT;replace;/login?next=%2Fdigimon%2Fcollection;307;",
      "NEXT_HTTP_ERROR_FALLBACK;404",
    ]) {
      expect(toServerError(busy(digest), REQUEST, CONTEXT), digest).toBeNull();
    }
  });
});

describe("recordServerError", () => {
  it("writes to the data directory, and a repeat of the newest only once", () => {
    const e = toServerError(busy(), REQUEST, CONTEXT)!;
    recordServerError(e);
    recordServerError(e); // the RSC payload's render of the same request
    recordServerError(toServerError(busy("111"), REQUEST, CONTEXT)!);
    expect(readServerErrors().map((x) => x.digest)).toEqual(["2297508878", "111"]);
    expect(fs.existsSync(path.join(dir, "server-errors.log"))).toBe(true);
  });
});
