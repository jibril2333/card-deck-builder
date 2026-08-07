"use client";

/**
 * How many client-side navigations have happened in this tab since the page
 * was loaded — i.e. how many history entries behind us are ours.
 *
 * Module scope is the whole point: it survives client-side navigation, because
 * the JS context does, and it resets to 0 on a full load, because that context
 * is new. That is exactly the question `BackLink` needs answered, and the
 * things that look like they answer it don't:
 *
 *   - `history.length` counts entries from before the tab reached us. A tab
 *     opened straight onto a shared card link already reports 2 (about:blank
 *     and the page), so "greater than 1" reads as "safe to go back" and back
 *     lands on about:blank.
 *   - `document.referrer` is empty for a typed or restored URL AND for
 *     same-tab client navigation, so it can't tell those apart.
 *   - sessionStorage is copied into a tab opened with target=_blank, so a
 *     counter kept there arrives pre-loaded in a tab with no history at all.
 */
let depth = 0;

export function noteNavigation(): void {
  depth += 1;
}

/** True when at least one entry behind us was pushed by this app. */
export function hasInAppHistory(): boolean {
  return depth > 0;
}
