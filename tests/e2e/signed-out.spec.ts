/**
 * Pages that need a signed-in reader send everyone else to /login — and back.
 *
 * Two ways in used to end on the error page instead: a deck group opened
 * from a link while signed out (the proxy did not list /groups), and any of
 * these pages with a session cookie whose session had expired (the proxy
 * only checks that a cookie is present). Both threw UNAUTHENTICATED from the
 * page render; 2026-09-14 in the client error log is the second one.
 *
 * And the way back out of /login must not leave the site.
 */
import { expect, test, type Page } from "@playwright/test";

const GROUP = "/digimon/groups/00000000-0000-0000-0000-000000000000";

/**
 * Waits rather than reads once: a redirect() thrown mid-render reaches the
 * browser in the streamed response and is followed there, a moment after
 * goto() has returned.
 */
async function landsOnLogin(page: Page, returnTo: string) {
  await page.waitForURL((u) => u.pathname === "/login");
  expect(new URL(page.url()).searchParams.get("next")).toBe(returnTo);
}

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("a deck group link goes to login, then back", async ({ page }) => {
    await page.goto(GROUP);
    await landsOnLogin(page, GROUP);
  });
});

test.describe("with a cookie for a session that no longer exists", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const path of [GROUP, "/digimon/collection"]) {
    test(`${path} goes to login, not the error page`, async ({ page, context, baseURL }) => {
      await context.addCookies([
        { name: "cdb_session", value: "expired-or-deleted", url: baseURL! },
      ]);
      await page.goto(path);
      await landsOnLogin(page, path);
      await expect(page.getByRole("button", { name: /Passkey/ })).toBeVisible();
    });
  }
});

test.describe("leaving /login once signed in", () => {
  // The default state is signed in, which makes /login redirect straight to
  // `next` — the same checked value the form navigates to after a sign-in.
  test("follows a path on this site", async ({ page }) => {
    await page.goto(`/login?next=${encodeURIComponent("/digimon/collection")}`);
    expect(new URL(page.url()).pathname).toBe("/digimon/collection");
  });

  for (const outside of ["https://example.com/phish", "//example.com/phish"]) {
    test(`does not follow ${outside}`, async ({ page, baseURL }) => {
      await page.goto(`/login?next=${encodeURIComponent(outside)}`);
      const url = new URL(page.url());
      expect(url.origin).toBe(new URL(baseURL!).origin);
      expect(url.pathname).not.toBe("/phish");
    });
  }
});
