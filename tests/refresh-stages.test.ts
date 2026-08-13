import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { REFRESH_STAGES, REFRESH_STAGE_IDS } from "@/lib/refresh-stages";

/**
 * The shell script is the authority: it's what the weekly agent and the admin
 * button actually run. The UI's copy of the stage list drifted from it once
 * already — `keywords` existed in the pipeline for months while the panel had
 * no checkbox for it and the API silently dropped it from any request — so
 * this shells out rather than trusting a second hand-written list.
 */
function stagesFromScript(): string[] {
  const script = path.join(process.cwd(), "scripts", "refresh-cards.sh");
  return execFileSync("/bin/bash", [script, "--list"], { encoding: "utf8" })
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

describe("refresh stages", () => {
  it("match refresh-cards.sh --list exactly, including order", () => {
    // Order matters: it's the order the script runs them in, and the panel
    // renders the checkboxes in the same sequence.
    expect(REFRESH_STAGE_IDS).toEqual(stagesFromScript());
  });

  it("includes keywords — the one that went missing", () => {
    expect(REFRESH_STAGE_IDS).toContain("keywords");
  });

  it("gives every stage a label and a hint", () => {
    for (const s of REFRESH_STAGES) {
      expect(s.label.length, s.id).toBeGreaterThan(0);
      expect(s.hint.length, s.id).toBeGreaterThan(0);
    }
  });

  it("has no duplicate ids", () => {
    expect(new Set(REFRESH_STAGE_IDS).size).toBe(REFRESH_STAGE_IDS.length);
  });
});
