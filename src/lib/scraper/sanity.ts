/**
 * Sanity checks for a freshly-scraped batch of Digimon cards.
 *
 * Motivation:
 *   The official site occasionally changes selectors, casing, or structure.
 *   When that happens we don't want to silently UPSERT thousands of rows with
 *   `name = ""` / `card_type = "Unknown"` — that quietly corrupts data the user
 *   relies on. Run this against the parsed batch before any DB writes; if any
 *   threshold is breached the scraper should abort with a clear message.
 *
 * The thresholds are deliberately loose — they're meant to catch silent total
 * breakage (e.g. selector changed and 100% of names are now empty), not nag
 * about a single irregular promo card.
 */

import type { ScrapedCard } from "./digimon";

const EXPECTED_TYPES = new Set([
  "Digimon",
  "Digi-Egg",
  "Tamer",
  "Option",
  "Dual",
]);

const EXPECTED_COLORS = new Set([
  "Red",
  "Blue",
  "Yellow",
  "Green",
  "Black",
  "Purple",
  "White",
]);

export type SanityIssue = {
  severity: "error" | "warn";
  message: string;
};

export type SanityReport = {
  total: number;
  issues: SanityIssue[];
  /** True if no `severity: "error"` issues were emitted. */
  ok: boolean;
};

/**
 * Inspect a parsed batch. Returns a structured report so the caller can decide
 * what to print and whether to abort.
 *
 * Rules (errors → abort):
 *   - Zero cards parsed at all → page structure totally broken.
 *   - <95% of cards have a non-empty `name` → site likely changed selectors.
 *   - <99% of cards have a `card_type` value at all → ditto.
 *   - Any `image_url` is not absolute https → image rewriting regressed.
 *   - Any `code` matches another `code` (after dedupe parseAll did) — should
 *     never happen but guards against accidental shape changes upstream.
 *
 * Rules (warnings only):
 *   - >5% of cards have an unknown `card_type` (typo or new type introduced)
 *   - Any color outside the known palette appears
 *   - Any Digimon-type card has level === null (level is required for play)
 *   - All cards have identical `name` (suggests fixture / single-card edge)
 */
export function checkScrapeSanity(cards: ScrapedCard[]): SanityReport {
  const issues: SanityIssue[] = [];
  const total = cards.length;

  if (total === 0) {
    return {
      total: 0,
      ok: false,
      issues: [{ severity: "error", message: "no cards parsed" }],
    };
  }

  const namedCount = cards.filter((c) => c.name.trim() !== "").length;
  const nameRatio = namedCount / total;
  if (nameRatio < 0.95) {
    issues.push({
      severity: "error",
      message: `only ${namedCount}/${total} (${(nameRatio * 100).toFixed(
        1,
      )}%) cards have a non-empty name; expected ≥95%`,
    });
  }

  const typedCount = cards.filter((c) => c.card_type.trim() !== "").length;
  const typedRatio = typedCount / total;
  if (typedRatio < 0.99) {
    issues.push({
      severity: "error",
      message: `only ${typedCount}/${total} (${(typedRatio * 100).toFixed(
        1,
      )}%) cards have a card_type; expected ≥99%`,
    });
  }

  for (const c of cards) {
    if (!c.image_url.startsWith("https://")) {
      issues.push({
        severity: "error",
        message: `${c.code}: image_url is not absolute https (${
          c.image_url || "<empty>"
        })`,
      });
      break; // one example is enough — don't drown the log
    }
  }

  const seen = new Set<string>();
  for (const c of cards) {
    if (seen.has(c.code)) {
      issues.push({
        severity: "error",
        message: `duplicate code ${c.code} in batch (parseAll should have deduped)`,
      });
      break;
    }
    seen.add(c.code);
  }

  // Warnings
  const unknownTypeCount = cards.filter(
    (c) => c.card_type && !EXPECTED_TYPES.has(c.card_type),
  ).length;
  if (unknownTypeCount / total > 0.05) {
    const samples = [
      ...new Set(
        cards
          .filter((c) => c.card_type && !EXPECTED_TYPES.has(c.card_type))
          .map((c) => `${c.code}=${c.card_type}`),
      ),
    ].slice(0, 5);
    issues.push({
      severity: "warn",
      message: `${unknownTypeCount}/${total} cards have unrecognized card_type (samples: ${samples.join(
        ", ",
      )})`,
    });
  }

  for (const c of cards) {
    if (c.color && !EXPECTED_COLORS.has(c.color)) {
      issues.push({
        severity: "warn",
        message: `${c.code}: unknown color "${c.color}"`,
      });
      break;
    }
  }

  const digimonMissingLevel = cards.filter(
    (c) => c.card_type === "Digimon" && c.level == null,
  );
  if (digimonMissingLevel.length > 0) {
    issues.push({
      severity: "warn",
      message: `${digimonMissingLevel.length} Digimon-type cards have null level (samples: ${digimonMissingLevel
        .slice(0, 3)
        .map((c) => c.code)
        .join(", ")})`,
    });
  }

  if (total >= 2) {
    const distinctNames = new Set(cards.map((c) => c.name));
    if (distinctNames.size === 1) {
      issues.push({
        severity: "warn",
        message: `all ${total} cards share identical name "${cards[0].name}" — likely a parsing regression`,
      });
    }
  }

  const ok = !issues.some((i) => i.severity === "error");
  return { total, issues, ok };
}

/** Format a report for human-readable console output. */
export function formatSanityReport(r: SanityReport): string {
  if (r.issues.length === 0) return `sanity ok (${r.total} cards)`;
  const lines = [
    `sanity ${r.ok ? "ok-with-warnings" : "FAILED"} (${r.total} cards)`,
  ];
  for (const i of r.issues) {
    lines.push(`  [${i.severity}] ${i.message}`);
  }
  return lines.join("\n");
}
