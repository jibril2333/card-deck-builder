/**
 * What an import couldn't place, kept with the deck it happened to.
 *
 * This used to be prose in the deck's `notes` — the owner's field, where it
 * stayed until they deleted it by hand. It's a fact about one event, not a
 * property of the deck, so it lives in its own column and gets dismissed
 * rather than edited.
 *
 * Stored as JSON so the wording can change without rewriting old rows; read
 * back through `parseImportReport`, which tolerates anything (a hand-edited
 * or truncated column must not take the deck page down with it).
 */
export type ImportReport = {
  /** Codes the parser read that no card in the database matches. */
  missing?: { code: string; qty: number }[];
  /** Banned outright, so not imported at all. */
  banned?: { code: string; qty: number }[];
  /** Imported, but trimmed to the cap. */
  capped?: { code: string; from: number; to: number }[];
  /** Dropped because an earlier card in the list can't share a deck with it. */
  pairs?: { code: string; with: string }[];
  /** Lines the parser gave up on, verbatim, first few. */
  unparsed?: string[];
};

export function isEmptyReport(r: ImportReport | null): boolean {
  if (!r) return true;
  return !(
    r.missing?.length ||
    r.banned?.length ||
    r.capped?.length ||
    r.pairs?.length ||
    r.unparsed?.length
  );
}

export function parseImportReport(raw: string | null): ImportReport | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as ImportReport;
    if (!v || typeof v !== "object") return null;
    return isEmptyReport(v) ? null : v;
  } catch {
    return null;
  }
}
