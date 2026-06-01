/**
 * Playwright global setup — runs once before all specs, AFTER the webServer
 * has been launched (Playwright's actual sequence — see playwright.config.ts
 * for the full timing notes).
 *
 * Fixture DBs are created in playwright.config.ts at config-load time so the
 * webServer child can find them on its first request. This file only handles
 * the auth bootstrap: insert a pre-authenticated test user + session into the
 * already-seeded digimon user.db, then write a `storageState.json` so every
 * browser context starts with that cookie set.
 *
 * Putting fixture-DB creation here too (an earlier mistake) generated a
 * second tmp directory: the webServer ran against the config-time DBs, but
 * `createE2ESession()` wrote the test session into the second DB → all
 * authenticated requests failed with UNAUTHENTICATED because the session
 * lookup hit the wrong file.
 */

import fs from "node:fs";
import path from "node:path";
import { createE2ESession } from "./fixtures/seed";

export default async function globalSetup() {
  const digimonUserDb = process.env.CDB_DIGIMON_USER_DB;
  if (!digimonUserDb) {
    throw new Error(
      "globalSetup: CDB_DIGIMON_USER_DB is not set — playwright.config.ts " +
        "should populate it at config-load time. Did the config change?",
    );
  }

  // Auth lives in the digimon user.db (see auth/repo.ts → authDb()). Seed a
  // pre-authenticated session there.
  const { sessionToken, expiresAt } = createE2ESession(digimonUserDb);

  // Persist a Playwright storageState file pointing at that session. Fixed
  // path under the project so playwright.config.ts can reference it
  // statically. Gitignored. globalSetup runs before any browser context is
  // created, so the file exists by the time tests open pages.
  const storageStatePath = path.resolve(
    process.cwd(),
    "tests/e2e/.storageState.json",
  );
  const storageState = {
    cookies: [
      {
        name: "cdb_session",
        value: sessionToken,
        // Match the host Playwright tests use (127.0.0.1, see baseURL).
        domain: "127.0.0.1",
        path: "/",
        expires: Math.floor(expiresAt.getTime() / 1000),
        httpOnly: true,
        secure: false,
        sameSite: "Lax" as const,
      },
    ],
    origins: [],
  };
  fs.writeFileSync(storageStatePath, JSON.stringify(storageState));

  console.log(`[e2e] injected test session into ${digimonUserDb}`);
  console.log(`[e2e] storageState at ${storageStatePath}`);
}
