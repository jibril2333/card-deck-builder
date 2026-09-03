/**
 * The quiet failure this guards against: the site still answers 200, the
 * script still exits 0, and the selector it was written against now matches
 * nothing.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildHealthNotification,
  describeHealth,
  healthReport,
  judge,
  recordSourceRun,
  type SourceHealth,
} from "@/lib/scrape-health";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cdb-health-"));
  process.env.CDB_DATA_DIR = dir;
});
afterEach(() => {
  delete process.env.CDB_DATA_DIR;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("judge", () => {
  it("calls a first run fine — there is nothing to compare it to", () => {
    expect(judge(0, 0)).toBe("ok");
    expect(judge(4400, 0)).toBe("ok");
  });

  it("calls an empty run dead once the source has a past", () => {
    expect(judge(0, 4400)).toBe("dead");
  });

  it("warns under 70% of the baseline, not at the first wobble", () => {
    // Exactly 70% is still fine; below it is not.
    expect(judge(3080, 4400)).toBe("ok");
    expect(judge(3079, 4400)).toBe("warn");
    expect(judge(4000, 4400)).toBe("ok");
  });
});

describe("recording runs", () => {
  it("judges against the best recent run, not the last one", () => {
    // A source that decays a little every day would never trip if each run
    // were judged against the one before it.
    for (const n of [4400, 4000, 3600]) recordSourceRun("cardrush", n);
    const h = recordSourceRun("cardrush", 3000);
    expect(h.baseline).toBe(4400);
    expect(h.level).toBe("warn");
  });

  it("remembers what the level was before this run", () => {
    recordSourceRun("pao", 2600);
    const h = recordSourceRun("pao", 0);
    expect([h.was, h.level]).toEqual(["ok", "dead"]);
  });

  it("keeps sources apart", () => {
    recordSourceRun("cardrush", 4400);
    const h = recordSourceRun("rulings", 12);
    // 12 rulings is not a problem just because prices returned 4,400.
    expect(h.level).toBe("ok");
    expect(
      healthReport()
        .map((r) => r.source)
        .sort(),
    ).toEqual(["cardrush", "rulings"]);
  });

  it("puts the worst source first in the report", () => {
    recordSourceRun("a", 100);
    recordSourceRun("b", 100);
    recordSourceRun("c", 100);
    recordSourceRun("a", 100);
    recordSourceRun("b", 0);
    recordSourceRun("c", 50);
    expect(healthReport().map((r) => [r.source, r.level])).toEqual([
      ["b", "dead"],
      ["c", "warn"],
      ["a", "ok"],
    ]);
  });

  it("survives a missing or corrupt file", () => {
    fs.writeFileSync(path.join(dir, "scrape-health.json"), "{ not json");
    expect(() => recordSourceRun("cardrush", 10)).not.toThrow();
    expect(healthReport()).toHaveLength(1);
  });
});

const h = (over: Partial<SourceHealth>): SourceHealth => ({
  source: "cardrush",
  ok: 4400,
  baseline: 4400,
  level: "ok",
  was: "ok",
  ...over,
});

describe("the notification", () => {
  it("says nothing on an ordinary run", () => {
    expect(
      buildHealthNotification([h({}), h({ source: "pao" })], {
        adminUrl: "https://x/admin",
      }),
    ).toBeNull();
  });

  it("says nothing about a source that was already dead yesterday", () => {
    // Once said, not said again — the same rule the refresh notification uses
    // for a week with no changes.
    expect(
      buildHealthNotification([h({ ok: 0, level: "dead", was: "dead" })], {
        adminUrl: "https://x/admin",
      }),
    ).toBeNull();
  });

  it("rings loudest when a source returns nothing at all", () => {
    const note = buildHealthNotification(
      [h({ ok: 0, level: "dead", was: "ok" })],
      { adminUrl: "https://x/admin" },
    )!;
    expect(note.priority).toBe(5);
    expect(note.title).toContain("没有结果");
    expect(note.body).toContain("cardrush 0(过去 4400)");
    // The part the numbers don't say.
    expect(note.body).toContain("抓取没有报错");
  });

  it("is quieter for a drop than for a death", () => {
    const note = buildHealthNotification(
      [h({ ok: 2000, level: "warn", was: "ok" })],
      { adminUrl: "https://x/admin" },
    )!;
    expect(note.priority).toBe(4);
    expect(note.body).toContain("45%");
  });

  it("also says when a source comes back", () => {
    const note = buildHealthNotification([h({ level: "ok", was: "dead" })], {
      adminUrl: "https://x/admin",
    })!;
    expect(note.title).toBe("抓取来源恢复");
    expect(note.body).toContain("恢复了");
    expect(note.priority).toBe(3);
  });

  it("leads with the bad news when a run has both", () => {
    const note = buildHealthNotification(
      [
        h({ source: "pao", level: "ok", was: "warn" }),
        h({ source: "cardrush", ok: 0, level: "dead", was: "ok" }),
      ],
      { adminUrl: "https://x/admin" },
    )!;
    expect(note.body.split("\n")[0]).toContain("cardrush");
  });
});

describe("describeHealth", () => {
  it("writes one line a person can act on", () => {
    expect(describeHealth(h({ ok: 0, level: "dead", was: "ok" }))).toBe(
      "✗ cardrush 0(过去 4400)",
    );
    expect(describeHealth(h({ ok: 2200, level: "warn", was: "ok" }))).toBe(
      "! cardrush 2200(过去 4400,50%)",
    );
  });
});

describe("across processes", () => {
  it("remembers the change for the notifier that runs afterwards", () => {
    // The scripts record; the notifier reads the file later, in its own
    // process, and must still be able to tell that something changed.
    recordSourceRun("Cardrush 价格", 4400);
    recordSourceRun("Cardrush 价格", 0);
    const note = buildHealthNotification(healthReport(), {
      adminUrl: "https://x/admin",
    });
    expect(note?.title).toContain("没有结果");
    // Reading it again does not re-fire: nothing has changed since.
    recordSourceRun("Cardrush 价格", 0);
    expect(
      buildHealthNotification(healthReport(), { adminUrl: "https://x/admin" }),
    ).toBeNull();
  });
});
