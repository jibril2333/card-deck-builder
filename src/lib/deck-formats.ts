/**
 * Text-format import/export for Digimon decks.
 *
 * Format used by digimoncard.io, DCGO / Project Drasil, Digital Gate Open and most
 * community tools: one line per stack, "<qty> <code>" or "<qty> <code> <name>".
 *
 * Variants we accept on import:
 *   "3 BT1-084"
 *   "3 BT1-084 Omnimon"
 *   "3x BT1-084"
 *   "3 x BT1-084"
 *   "3 Omnimon BT1-084"      (qty + name + code, name optional middle word)
 *   blank lines and lines starting with "//" or "#" are comments
 *   "===", "---", "Eggs:" etc are treated as section dividers (ignored)
 *
 * On export we produce the canonical "<qty> <code> <name>" form. Egg-deck cards
 * (Digi-Egg type) are grouped under an "// Egg" comment for human readability.
 */

export type ParsedLine = {
  qty: number;
  code: string;
  name?: string;
};

// Match codes case-insensitively — the parse step .toUpperCase()s the captured
// code below, so accepting "bt1-084" as well as "BT1-084" makes that step do
// something useful (e.g. for hand-typed lists or sloppy clipboard paste).
const LINE_PATTERNS = [
  // "3x BT1-084 Omnimon" / "3 x BT1-084 Omnimon" / "3 BT1-084 Omnimon"
  /^(\d+)\s*[x×]?\s+([A-Za-z]+\d*-\d+(?:_[A-Za-z0-9]+)?)\s*(.*)$/,
  // "3 Omnimon BT1-084" (name before code)
  /^(\d+)\s*[x×]?\s+(.+?)\s+([A-Za-z]+\d*-\d+(?:_[A-Za-z0-9]+)?)\s*$/,
];

const COMMENT_OR_SECTION =
  /^\s*(?:\/\/|#|===|---|egg|eggs|main|main deck|side|sideboard|deck name)/i;

export function parseDeckText(text: string): {
  lines: ParsedLine[];
  errors: string[];
} {
  const lines: ParsedLine[] = [];
  const errors: string[] = [];
  const raw = text.split(/\r?\n/);
  for (let i = 0; i < raw.length; i++) {
    const ln = raw[i].trim();
    if (!ln) continue;
    if (COMMENT_OR_SECTION.test(ln)) continue;

    // Try pattern 1: qty first, code immediately after
    let m = ln.match(LINE_PATTERNS[0]);
    if (m) {
      const qty = parseInt(m[1], 10);
      const code = m[2].toUpperCase();
      const name = m[3]?.trim() || undefined;
      lines.push({ qty, code, name });
      continue;
    }
    // Pattern 2: qty + name + code (code at end)
    m = ln.match(LINE_PATTERNS[1]);
    if (m) {
      const qty = parseInt(m[1], 10);
      const name = m[2].trim();
      const code = m[3].toUpperCase();
      lines.push({ qty, code, name });
      continue;
    }
    errors.push(`Line ${i + 1}: 无法解析 "${ln}"`);
  }
  return { lines, errors };
}

export type DeckCardForExport = {
  code: string;
  name: string;
  card_type: string;
  quantity: number;
};

/**
 * Canonical text format: lines `<qty> <code> <name>`, with Digi-Egg cards in
 * their own block at the top under a "// Egg" comment.
 */
export function exportDeckText(
  name: string,
  cards: DeckCardForExport[],
): string {
  const eggs = cards.filter((c) => c.card_type === "Digi-Egg");
  const main = cards.filter((c) => c.card_type !== "Digi-Egg");

  const out: string[] = [];
  out.push(`// ${name}`);
  if (eggs.length) {
    out.push("");
    out.push("// Egg");
    for (const c of eggs.sort((a, b) => a.code.localeCompare(b.code))) {
      out.push(`${c.quantity} ${c.code} ${c.name}`.trim());
    }
  }
  if (main.length) {
    out.push("");
    out.push("// Main");
    for (const c of main.sort((a, b) => a.code.localeCompare(b.code))) {
      out.push(`${c.quantity} ${c.code} ${c.name}`.trim());
    }
  }
  return out.join("\n") + "\n";
}

/**
 * digimoncard.io's URL-shareable format:
 *   /deckbuilder/?deck=4+BT1-010,4+BT1-016,3+BT1-019
 */
export function exportDigimoncardIoUrl(cards: DeckCardForExport[]): string {
  const parts = cards
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((c) => `${c.quantity}+${c.code}`)
    .join(",");
  return `https://digimoncard.io/deckbuilder/?deck=${parts}`;
}
