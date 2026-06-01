/**
 * Sanity checks for a freshly-scraped batch of UA cards.
 *
 * Mirrors `sanity.ts` (Digimon) but with UA-specific rules:
 *   - card_type set is {Character, Event, Action Point, フィールド}
 *   - colors include Unknown for Action Point cards (intentional, not a bug)
 *   - rarity can be empty for Action Point cards (~800 in the existing DB)
 *   - bp is meaningful only for Character cards; Event/AP/Field always 0
 *
 * Like Digimon: errors abort the scrape before any UPSERT; warnings only log.
 */

import type { ScrapedUACard } from "./ua";

const EXPECTED_TYPES = new Set([
  "Character",
  "Event",
  "Action Point",
  "フィールド",
]);

const EXPECTED_COLORS = new Set([
  "Red",
  "Blue",
  "Yellow",
  "Green",
  "Purple",
  "Unknown",
]);

// Note: we deliberately don't enumerate rarities — UA has 20+ flavors (PR / SP
// / OBC / Pc-prefixed promo lines, etc.), and the set drifts every product
// release. Worth flagging via a different signal (e.g. "100% blank") if
// rarities ever silently break, but a per-card whitelist creates more warnings
// than it catches real bugs.

export type SanityIssue = {
  severity: "error" | "warn";
  message: string;
};

export type SanityReport = {
  total: number;
  issues: SanityIssue[];
  ok: boolean;
};

export function checkUASanity(cards: ScrapedUACard[]): SanityReport {
  const issues: SanityIssue[] = [];
  const total = cards.length;

  if (total === 0) {
    return {
      total: 0,
      ok: false,
      issues: [{ severity: "error", message: "no cards parsed" }],
    };
  }

  // ---- Errors ----

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

  const seriesCount = cards.filter((c) => c.series.trim() !== "").length;
  if (seriesCount / total < 0.95) {
    issues.push({
      severity: "error",
      message: `only ${seriesCount}/${total} cards have a series; expected ≥95%`,
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
      break;
    }
  }

  const seen = new Set<string>();
  for (const c of cards) {
    if (seen.has(c.code)) {
      issues.push({
        severity: "error",
        message: `duplicate code ${c.code} in batch`,
      });
      break;
    }
    seen.add(c.code);
  }

  // ---- Warnings ----

  const unknownTypes = cards.filter(
    (c) => c.card_type && !EXPECTED_TYPES.has(c.card_type),
  );
  if (unknownTypes.length / total > 0.02) {
    const samples = [
      ...new Set(unknownTypes.map((c) => `${c.code}=${c.card_type}`)),
    ].slice(0, 5);
    issues.push({
      severity: "warn",
      message: `${unknownTypes.length}/${total} cards have unrecognized card_type (samples: ${samples.join(
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

  // Catch the "selectors moved, rarity column nuked" case: if literally every
  // non-AP card has blank rarity, something's broken.
  const nonAp = cards.filter((c) => c.card_type !== "Action Point");
  if (nonAp.length >= 10 && nonAp.every((c) => c.rarity === "")) {
    issues.push({
      severity: "error",
      message: `all ${nonAp.length} non-AP cards have blank rarity; selector regression`,
    });
  }

  // Character cards should have non-zero BP. Exempt Tales / SAO Field-token
  // weirdness by setting the threshold a few rows up.
  const charsWithoutBp = cards.filter(
    (c) => c.card_type === "Character" && c.bp === 0,
  );
  if (charsWithoutBp.length > 3) {
    issues.push({
      severity: "warn",
      message: `${charsWithoutBp.length} Character cards have BP=0 (samples: ${charsWithoutBp
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
        message: `all ${total} cards share identical name "${cards[0].name}"`,
      });
    }
  }

  const ok = !issues.some((i) => i.severity === "error");
  return { total, issues, ok };
}

export function formatUASanityReport(r: SanityReport): string {
  if (r.issues.length === 0) return `sanity ok (${r.total} cards)`;
  const lines = [
    `sanity ${r.ok ? "ok-with-warnings" : "FAILED"} (${r.total} cards)`,
  ];
  for (const i of r.issues) {
    lines.push(`  [${i.severity}] ${i.message}`);
  }
  return lines.join("\n");
}
