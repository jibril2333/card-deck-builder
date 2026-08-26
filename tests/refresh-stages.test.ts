import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { REFRESH_STAGES, REFRESH_STAGE_IDS } from "@/lib/refresh-stages";

/**
 * `REFRESH_STAGES` is now the only authority: the daemon runs
 * `stage.scripts`, the panel renders `stage.label`, and the API validates
 * against `stage.id`. (It used to be a shell script, checked here by shelling
 * out to it; that pipeline was macOS-only and is gone.)
 *
 * What still has to hold is that the list names scripts that EXIST — the whole
 * failure this file was written for was a stage that silently did nothing.
 */
describe("refresh stages", () => {
  it("names scripts that are actually in the repo", () => {
    for (const stage of REFRESH_STAGES) {
      expect(stage.scripts.length, stage.id).toBeGreaterThan(0);
      for (const script of stage.scripts) {
        const file = path.join(process.cwd(), "scripts", script);
        expect(fs.existsSync(file), `${stage.id} → ${script}`).toBe(true);
      }
    }
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
