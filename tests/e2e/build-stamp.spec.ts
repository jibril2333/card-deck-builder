/**
 * The running build, in the sidebar footer.
 *
 * It exists to answer "is this the version I just pushed?" on a host you're
 * looking at through a browser — a question HTTP 200 can't answer, since the
 * container that was already running answers 200 too. So what's asserted is
 * that the sha actually reaches the page: a stamp that says 开发版 in
 * production would be worse than no stamp at all.
 *
 * The webServer runs with CDB_GIT_SHA / CDB_BUILT_AT set — see
 * playwright.config.ts.
 */
import { expect, test } from "@playwright/test";

test("shows the commit it was built from, and links to it", async ({
  page,
}) => {
  await page.goto("/digimon/decks");

  const stamp = page.getByRole("link", { name: /e2e5ha0/ });
  await expect(stamp).toBeVisible();
  // Short sha for reading, full sha for clicking.
  await expect(stamp).toHaveText(/^e2e5ha0/);
  await expect(stamp).toHaveAttribute(
    "href",
    /github\.com\/.+\/commit\/e2e5ha0000000000000000000000000000000000$/,
  );
  // And the build's date, in the user's timezone (JST): 10:00Z is the 22nd.
  await expect(stamp).toContainText("8/22");
});
