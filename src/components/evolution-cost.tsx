import { colorHex } from "@/lib/games";

/**
 * The digivolve cost line, split back into one row per colour.
 *
 * The scraper flattens a card with several digivolve conditions into a single
 * string with the colours run together — "RedBlackBlue 5 from Lv.5" (887 cards
 * look like this). That reads as a typo and loses the fact that these are
 * ALTERNATIVES: any one of those colours at that level pays the cost. Split
 * them apart and give each its colour, the way the printed card and community
 * viewers show them.
 */

const COLORS = [
  "Red",
  "Blue",
  "Yellow",
  "Green",
  "Black",
  "Purple",
  "White",
] as const;

/**
 * "RedBlack 4 from Lv.5" → { colors: ["Red","Black"], rest: "4 from Lv.5" }.
 * Returns null when the string doesn't start with a run of known colours, so
 * anything unexpected falls through to being printed verbatim.
 */
export function parseEvolutionCost(
  raw: string,
): { colors: string[]; rest: string } | null {
  const trimmed = raw.trim();
  const spaceAt = trimmed.indexOf(" ");
  const head = spaceAt === -1 ? trimmed : trimmed.slice(0, spaceAt);
  const rest = spaceAt === -1 ? "" : trimmed.slice(spaceAt + 1).trim();

  const colors: string[] = [];
  let i = 0;
  while (i < head.length) {
    const next = COLORS.find((c) => head.startsWith(c, i));
    if (!next) return null; // unknown token — don't pretend to understand it
    colors.push(next);
    i += next.length;
  }
  return colors.length ? { colors, rest } : null;
}

export function EvolutionCost({ value }: { value: string }) {
  // A card can print TWO alternative digivolve lines ("Red 2 from Lv.3" and
  // "Red 2 from a Tamer"); the scraper newline-joins them. Render one row each
  // — merging them would read as a single, wrong requirement.
  const lines = value.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1) {
    return (
      <div className="flex flex-col gap-1.5">
        {lines.map((l, i) => (
          <EvolutionCost key={i} value={l} />
        ))}
      </div>
    );
  }
  const parsed = parseEvolutionCost(lines[0] ?? value);
  if (!parsed) return <span className="text-sm font-medium">{value}</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {parsed.colors.map((c) => (
        <span
          key={c}
          className="inline-flex items-center gap-1.5 pl-1.5 pr-2 h-6 rounded-md text-xs font-medium border border-[var(--color-border)]"
        >
          <span
            aria-hidden
            className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: colorHex(c) }}
          />
          {c}
          {parsed.rest ? (
            <span className="text-[var(--color-muted-fg)]">{parsed.rest}</span>
          ) : null}
        </span>
      ))}
    </div>
  );
}
