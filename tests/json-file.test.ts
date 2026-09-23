/**
 * A settings file that is missing is "not configured"; one that is broken
 * must say so. The difference is the whole point of readJsonFile — the
 * backup daemon used to read an unreadable backup.json as "no R2", and move
 * the replica without a word.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readJsonFile } from "@/lib/json-file";

let dir: string;
let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "json-file-"));
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  errors.mockRestore();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("readJsonFile", () => {
  it("returns the parsed file", () => {
    const f = path.join(dir, "ok.json");
    fs.writeFileSync(f, '{"enabled":true}');
    expect(readJsonFile(f)).toEqual({ enabled: true });
    expect(errors).not.toHaveBeenCalled();
  });

  it("reads a missing file as nothing, quietly", () => {
    expect(readJsonFile(path.join(dir, "absent.json"))).toBeUndefined();
    expect(errors).not.toHaveBeenCalled();
  });

  it("says so when the file is not JSON, once", () => {
    const f = path.join(dir, "broken.json");
    fs.writeFileSync(f, '{"enabled": tr');
    expect(readJsonFile(f)).toBeUndefined();
    expect(readJsonFile(f)).toBeUndefined();
    expect(errors).toHaveBeenCalledTimes(1);
    expect(String(errors.mock.calls[0][0])).toContain("not valid JSON");
    expect(String(errors.mock.calls[0][0])).toContain(f);
  });

  it.skipIf(process.getuid?.() === 0)("says so when the file cannot be read", () => {
    const f = path.join(dir, "locked.json");
    fs.writeFileSync(f, "{}");
    fs.chmodSync(f, 0o000);
    expect(readJsonFile(f)).toBeUndefined();
    expect(String(errors.mock.calls[0]?.[0])).toContain("EACCES");
  });
});
