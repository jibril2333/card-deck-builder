import { describe, expect, it } from "vitest";
import { isStaleBuildError } from "@/lib/stale-build";

/**
 * The strings Next.js actually throws — verbatim, because this is a message
 * match and a reworded one silently stops matching.
 */
describe("isStaleBuildError", () => {
  it("recognises a deploy that moved under an open tab", () => {
    for (const m of [
      'Server Action "40387346ee9284d2ad5fb34b22f8dd723d4a057dba" was not found on the server. Read more: https://nextjs.org/docs/messages/failed-to-find-server-action',
      "Failed to find Server Action \"abc123\". This request might be from an older or newer deployment.",
      "Server Reference ID did not match the expected format",
    ]) {
      expect(isStaleBuildError({ message: m }), m).toBe(true);
    }
  });

  it("leaves every other failure to the error panel", () => {
    for (const m of [
      "数据库文件不存在",
      "SQLITE_CANTOPEN: unable to open database file",
      "The module 'better_sqlite3.node' was compiled against a different Node.js version",
      "Failed to fetch",
      "",
    ]) {
      expect(isStaleBuildError({ message: m }), m).toBe(false);
    }
    expect(isStaleBuildError(null)).toBe(false);
  });
});
