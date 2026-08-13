import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * The scheduler, exercised end to end against a stand-in for the pipeline.
 *
 * `refresh-schedule.ts` is unit-tested on its own; what this covers is the part
 * that only exists in the script — deciding to run, exactly once per slot, and
 * refusing to run at all when the config can't be read.
 *
 * That second case is here because it went wrong for real: a config file with a
 * JSON syntax error used to fall through to the defaults, and "I can't read
 * your schedule" became "so I'll run every stage". The stand-in records its
 * arguments, so the assertions are about what would ACTUALLY have been run.
 */
const ROOT = process.cwd();
let dir: string;
const dataDir = () => path.join(dir, "data.nosync");
const calls = () => {
  const f = path.join(dataDir(), "calls.txt");
  return fs.existsSync(f)
    ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean)
    : [];
};

function tick() {
  execFileSync("npx", ["tsx", "scripts/refresh-tick.ts"], {
    cwd: ROOT,
    env: { ...process.env, CDB_DATA_DIR: dataDir(), CDB_PROJECT_DIR: dir },
    stdio: "pipe",
  });
}

function writeSchedule(json: string) {
  fs.writeFileSync(path.join(dataDir(), "refresh-schedule.json"), json);
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cdb-tick-"));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.mkdirSync(dataDir(), { recursive: true });
  // Stands in for refresh-cards.sh: records how it was called, runs nothing.
  fs.writeFileSync(
    path.join(dir, "scripts", "refresh-cards.sh"),
    `#!/bin/bash\necho "$* trigger=\${CDB_REFRESH_TRIGGER:-manual}" >> "$CDB_DATA_DIR/calls.txt"\n`,
    { mode: 0o755 },
  );
});

afterAll(() => {
  // Best effort; these live under the OS temp dir either way.
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe("refresh-tick", () => {
  it("runs a due slot exactly once, however many times it ticks", () => {
    // Midnight has always already passed today, so this slot is due now.
    writeSchedule(
      '{"enabled":true,"frequency":"daily","hour":0,"minute":0,"stages":["restrictions","keywords"]}',
    );
    tick();
    tick();
    tick();
    expect(calls()).toEqual(["restrictions keywords trigger=auto"]);
  });

  it("passes no stages when none are configured, meaning all of them", () => {
    writeSchedule('{"enabled":true,"frequency":"daily","hour":0,"minute":0,"stages":[]}');
    tick();
    expect(calls()).toEqual([" trigger=auto"]);
  });

  it("runs nothing while disabled", () => {
    writeSchedule('{"enabled":false,"frequency":"daily","hour":0,"minute":0}');
    tick();
    expect(calls()).toEqual([]);
  });

  it("refuses to run on an unreadable config rather than falling back", () => {
    // `{"hour":00}` is not valid JSON — the exact shape of the accident.
    writeSchedule('{"enabled":true,"frequency":"daily","hour":00}');
    tick();
    expect(calls()).toEqual([]);
  });

  it("uses the defaults when there is no config at all", () => {
    // No file: a first run, not a broken one. Default is weekly Monday 04:30,
    // which is due (some Monday has passed), so it should fire.
    tick();
    expect(calls()).toHaveLength(1);
  });

  it("publishes the next run time for the admin page", () => {
    writeSchedule('{"enabled":true,"frequency":"weekly","weekday":1,"hour":4,"minute":30}');
    tick();
    const state = JSON.parse(
      fs.readFileSync(path.join(dataDir(), "refresh-schedule-state.json"), "utf8"),
    );
    expect(state.describe).toBe("每周一 04:30");
    expect(new Date(state.nextRunAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("stands aside while another refresh holds the lock", () => {
    writeSchedule('{"enabled":true,"frequency":"daily","hour":0,"minute":0}');
    fs.mkdirSync(path.join(dataDir(), ".refresh.lock"));
    tick();
    expect(calls()).toEqual([]);
    // And the slot stays unclaimed, so the next tick can still pick it up.
    fs.rmdirSync(path.join(dataDir(), ".refresh.lock"));
    tick();
    expect(calls()).toHaveLength(1);
  });
});
