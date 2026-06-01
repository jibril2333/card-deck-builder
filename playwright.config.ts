import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  seedDigimonDb,
  seedUADb,
  seedUserDb,
} from "./tests/e2e/fixtures/seed";

// Use a non-default port so an already-running local `npm run dev` on 3000
// doesn't collide with the e2e webServer.
const PORT = Number(process.env.CDB_E2E_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;

// ────────────────────────────────────────────────────────────────────────
// Fixture DB paths — computed HERE at config-load time, not inside
// globalSetup. Why: Playwright starts the webServer BEFORE running
// globalSetup, so any `process.env` mutated by globalSetup is invisible to
// the Next.js child process. Setting them on `process.env` during config
// evaluation guarantees both the webServer child AND globalSetup see them.
//
// Without this, a previous version of this config was silently writing
// e2e test data into the user's REAL `~/Desktop/workspace/digimon-deck-
// builder/data/user.db`, since Next.js fell back to default paths.
// ────────────────────────────────────────────────────────────────────────

const E2E_DIR = path.join(
  os.tmpdir(),
  `cdb-e2e-${Date.now()}-${process.pid}`,
);
const FIXTURE_PATHS = {
  CDB_DIGIMON_DB: path.join(E2E_DIR, "digimon.db"),
  CDB_DIGIMON_USER_DB: path.join(E2E_DIR, "digimon-user.db"),
  CDB_UA_DB: path.join(E2E_DIR, "ua.db"),
  CDB_UA_USER_DB: path.join(E2E_DIR, "ua-user.db"),
  CDB_E2E_DIR: E2E_DIR, // teardown reads this to clean up
} as const;

for (const [k, v] of Object.entries(FIXTURE_PATHS)) {
  process.env[k] = v;
}

// Seed the fixture DBs at config-load time, BEFORE the webServer launches.
// Playwright's webServer is allowed to start serving requests as soon as the
// configured `url` returns 200, which happens before globalSetup runs — so
// seeding inside globalSetup is too late and we get "数据库文件不存在" errors
// from the first prerender request. Doing it here is the only point where
// we can guarantee the DB exists before any HTTP traffic.
fs.mkdirSync(E2E_DIR, { recursive: true });
seedDigimonDb(FIXTURE_PATHS.CDB_DIGIMON_DB);
seedUADb(FIXTURE_PATHS.CDB_UA_DB);
seedUserDb(FIXTURE_PATHS.CDB_DIGIMON_USER_DB);
seedUserDb(FIXTURE_PATHS.CDB_UA_USER_DB);

export default defineConfig({
  testDir: "./tests/e2e",
  // Vitest specs live under tests/ too — ignore them so Playwright doesn't try
  // to pick them up as test files.
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false, // shared fixture DB; keep specs serial
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? "list" : "list",

  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // The session cookie is written here by global-setup.ts so every test
    // starts logged in (middleware would otherwise bounce to /login).
    storageState: "tests/e2e/.storageState.json",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    // Use production build+start. We can't use `next dev` because Next 16
    // enforces a per-project single-dev-server lockfile — if the user has a
    // local `npm run dev` on port 3000 already, the e2e webServer can't even
    // start a sibling dev on port 3100. Production also uses its own distDir
    // (`.next/prod` via next.config.ts), so the prod build doesn't trample
    // the user's dev `.next/dev/` either.
    command: `npm run build && npm start -- -p ${PORT}`,
    url: BASE_URL,
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: "ignore",
    // Pipe stderr to the test runner so server-side errors surface during e2e.
    stderr: process.env.CI ? "pipe" : "pipe",
    // Pass the fixture paths to the webServer child explicitly. (`process.env`
    // would be inherited anyway, but this makes the intent obvious to anyone
    // reading the config.)
    //
    // CDB_E2E=1 makes next.config.ts switch distDir to .next/e2e-prod, so the
    // user's long-running prod server on 3001 (using .next/prod) doesn't
    // collide with the build Playwright runs here.
    env: { ...FIXTURE_PATHS, CDB_E2E: "1" } satisfies Record<string, string>,
  },
});
