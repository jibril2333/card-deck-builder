import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  REFRESH_STAGES,
  REFRESH_STAGE_IDS,
  scriptLabel,
} from "@/lib/refresh-stages";

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

  it("gives every script a label for the progress line", () => {
    // A script with no label shows a bar with no idea what is filling it —
    // which is exactly the state 中/日文 was in with three scripts behind one
    // stage name.
    for (const stage of REFRESH_STAGES) {
      for (const script of stage.scripts) {
        expect(scriptLabel(script), `${stage.id} → ${script}`).toBeTruthy();
      }
    }
  });

  it("every script reports its own progress", () => {
    // The panel's inner count comes from the scripts themselves; one that
    // never calls reportProgress leaves the bar stuck on the stage boundary.
    for (const stage of REFRESH_STAGES) {
      for (const script of stage.scripts) {
        const src = fs.readFileSync(
          path.join(process.cwd(), "scripts", script),
          "utf8",
        );
        expect(src, `${stage.id} → ${script}`).toContain("reportProgress(");
      }
    }
  });

  it("only parallelises stages whose scripts hit different sources", () => {
    // Running two scrapes at once is free when they talk to different shops
    // and cost nothing extra to either. It is NOT free when they share a
    // source (same server, double the rate) or feed each other — 中/日文 is
    // three scripts in a deliberate order.
    const parallel = REFRESH_STAGES.filter((s) => s.parallel).map((s) => s.id);
    expect(parallel).toEqual(["prices"]);
  });

  it("has no duplicate ids", () => {
    expect(new Set(REFRESH_STAGE_IDS).size).toBe(REFRESH_STAGE_IDS.length);
  });
});
