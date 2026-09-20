/**
 * A timestamp in an admin panel.
 *
 * Always 24-hour, whatever the language. These are log lines — a run that
 * started, a backup that synced, the last time the scheduler looked — read
 * down a column and compared against each other. The language decides the
 * order of the parts and the separators; it does not get to make the English
 * column a different width by putting AM/PM on the end of it.
 */

import { INTL_LOCALE, type Locale } from "./locale";

export function formatTimestamp(
  locale: Locale,
  iso: string | null | undefined,
  /** Shown for a missing or unparseable value. */
  fallback = "—",
): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleString(INTL_LOCALE[locale], { hour12: false });
}
