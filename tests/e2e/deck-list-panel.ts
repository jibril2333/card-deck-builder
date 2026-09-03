/**
 * 加入卡组 panel helpers.
 *
 * The panel collapses once the account has a few decks, and whether the
 * toggle reads 展开 or 收起 depends on a mount effect that restores the
 * remembered state from localStorage. A spec that checks `count()` and then
 * clicks can therefore be looking at the state before the effect and clicking
 * after it, waiting for a button that no longer exists — which is exactly what
 * `deck-lock.spec.ts` did on a CI runner, for thirty seconds, having passed
 * on every local run. These retry the check-and-act pair instead of deciding
 * once.
 */
import { expect, type Page } from "@playwright/test";

/** Leave the deck list expanded, whichever state it starts in. */
export async function expandDeckList(page: Page): Promise<void> {
  await expect(async () => {
    const collapsed = page.getByRole("button", { name: /展开/ });
    if (await collapsed.count()) await collapsed.click({ timeout: 2000 });
    await expect(collapsed).toHaveCount(0, { timeout: 2000 });
  }).toPass({ timeout: 20_000 });
}

/** Leave one deck's row on screen, expanding the list if it is hidden. */
export async function revealDeckRow(page: Page, name: string): Promise<void> {
  await expandDeckList(page);
  await expect(page.getByRole("group", { name })).toBeVisible();
}
