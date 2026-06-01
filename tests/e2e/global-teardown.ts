/**
 * Cleanup after all specs finish.
 *
 * Removes the per-run fixture DB directory created by global-setup.ts. The
 * Playwright `test-results/` directory is cleaned in the npm script via
 * `&&`-chained `rm` so the cleanup only fires on a green run — we can't do
 * that here because Playwright invokes globalTeardown BEFORE the reporter
 * writes `.last-run.json`, so this hook can't see the final status.
 *
 * Everything is best-effort: if a path is already gone or unreadable, we just
 * shrug — this runs at exit and shouldn't fail the run for cleanup reasons.
 */

import fs from "node:fs";
import path from "node:path";

export default async function globalTeardown() {
  const dir = process.env.CDB_E2E_DIR;
  if (dir) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(`[e2e] cleaned fixture dir ${dir}`);
    } catch {
      // ignore
    }
  }

  // Also remove the session storageState file globalSetup wrote.
  try {
    fs.rmSync(path.resolve(process.cwd(), "tests/e2e/.storageState.json"), {
      force: true,
    });
  } catch {
    // ignore
  }
}
