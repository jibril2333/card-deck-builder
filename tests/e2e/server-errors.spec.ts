/**
 * A server error leaves its cause in the data directory, not only on stdout.
 *
 * The failure is a real one rather than a route built to throw: this test
 * holds the user database's write lock past the connection's 5s timeout —
 * what Litestream did for a moment on 2026-09-24 — and creates a deck. The
 * Server Action gets SQLITE_BUSY, Next hands it to onRequestError, and the
 * entry must name the cause and carry the digest the error page shows.
 */
import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DIR = fs.readFileSync("tests/e2e/.datadir", "utf8").trim();
const LOG = path.join(DIR, "server-errors.log");

type Entry = { digest?: string; code?: string; routeType?: string; path?: string; message?: string };
const entries = (): Entry[] =>
  fs.existsSync(LOG)
    ? fs.readFileSync(LOG, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
    : [];

test.beforeEach(() => fs.rmSync(LOG, { force: true }));
test.afterAll(() => fs.rmSync(LOG, { force: true }));

test("a write that cannot get the lock is kept with its cause", async ({ page }) => {
  test.setTimeout(40_000);
  await page.goto("/digimon/decks");

  const db = new Database(path.join(DIR, "digimon-user.db"));
  try {
    db.exec("BEGIN IMMEDIATE");
    await page.getByPlaceholder("卡组名").fill("LOCKED " + Date.now());
    await page.getByRole("button", { name: /创建/ }).click();
    await expect
      .poll(() => entries().find((e) => e.code === "SQLITE_BUSY"), { timeout: 20_000 })
      .toBeTruthy();
  } finally {
    db.exec("ROLLBACK");
    db.close();
  }

  const e = entries().find((x) => x.code === "SQLITE_BUSY")!;
  expect(e.routeType).toBe("action");
  expect(e.message).toBe("database is locked");
  expect(e.digest).toMatch(/^\d+$/);
});

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("a redirect to /login is not recorded as an error", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "cdb_session", value: "expired", url: baseURL! }]);
    await page.goto("/digimon/collection");
    await page.waitForURL((u) => u.pathname === "/login");
    expect(entries()).toEqual([]);
  });
});
