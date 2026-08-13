/**
 * The automatic refresh's clock, run on the HOST by launchd every 15 minutes.
 *
 * launchd used to hold the schedule itself (`StartCalendarInterval`, Mondays
 * 04:30). Making that configurable from the admin page would have meant the
 * app rewriting a plist and calling `launchctl` — and the app is the one thing
 * on this machine that must never drive the host: it is internet-facing through
 * the tunnel, and it deliberately has no Docker socket for the same reason.
 *
 * So launchd only ticks. The schedule lives in a JSON file the app can write,
 * this script decides whether a run is due, and nothing has to be reloaded when
 * the time changes.
 *
 * Due-ness is "has the most recent scheduled slot already run", not "is it
 * 04:30 right now". A Mac that was asleep at 04:30 still gets its refresh when
 * it wakes, and the slot marker keeps the next tick from starting a second one.
 *
 * Exits 0 in every ordinary case, including "not due" — a non-zero exit here
 * would show up in launchd's logs as a failure every quarter hour.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  parseSchedule,
  dueSlot,
  nextRun,
  describeSchedule,
} from "../src/lib/refresh-schedule";
import { REFRESH_STAGE_IDS } from "../src/lib/refresh-stages";

const PROJECT_DIR = process.env.CDB_PROJECT_DIR ?? path.join(process.env.HOME ?? "", "card-deck-builder");
const DATA_DIR = process.env.CDB_DATA_DIR ?? path.join(PROJECT_DIR, "data.nosync");
const SCHEDULE_FILE = path.join(DATA_DIR, "refresh-schedule.json");
const STATE_FILE = path.join(DATA_DIR, "refresh-schedule-state.json");
const LOCK_DIR = path.join(DATA_DIR, ".refresh.lock");
const LOG_FILE = path.join(DATA_DIR, "refresh.log");

const now = new Date();
const log = (msg: string) => {
  const line = `[${now.toLocaleString("sv")}] [tick] ${msg}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch {
    /* the log is a convenience; never let it stop a refresh */
  }
  console.log(line.trimEnd());
};

type Read =
  | { kind: "absent" }
  | { kind: "bad"; err: string }
  | { kind: "ok"; value: unknown };

function readJson(file: string): Read {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return { kind: "absent" };
  }
  try {
    return { kind: "ok", value: JSON.parse(text) };
  } catch (e) {
    return { kind: "bad", err: (e as Error).message };
  }
}

const rawSchedule = readJson(SCHEDULE_FILE);

// An unreadable config is NOT the same as no config, and this distinction was
// learned the hard way: a file with a syntax error used to fall through to the
// defaults, which meant "I can't read your schedule" turned into "so I'll run
// every stage at some hour you didn't pick". Absent → defaults, because that's
// a first run. Present but broken → do nothing and say so loudly.
if (rawSchedule.kind === "bad") {
  log(`refusing to run: ${SCHEDULE_FILE} is not valid JSON — ${rawSchedule.err}`);
  process.exit(0);
}

const schedule = parseSchedule(
  rawSchedule.kind === "ok" ? rawSchedule.value : undefined,
  REFRESH_STAGE_IDS,
);
const stateRead = readJson(STATE_FILE);
const state = (stateRead.kind === "ok" ? stateRead.value : {}) as { lastSlot?: string };

const due = dueSlot(schedule, now);
const next = nextRun(schedule, now);

/**
 * Written every tick, not only when a run happens: the admin page shows the
 * next run time, and the host is the only place that can compute it — the
 * container is on UTC while this machine is on JST.
 */
function writeState(patch: Record<string, unknown>) {
  const merged = {
    ...state,
    describe: describeSchedule(schedule),
    nextRunAt: next ? next.toISOString() : null,
    checkedAt: now.toISOString(),
    ...patch,
  };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(merged, null, 2));
  fs.renameSync(tmp, STATE_FILE);
}

if (!due) {
  writeState({});
  process.exit(0);
}

if (state.lastSlot && new Date(state.lastSlot) >= due) {
  // Already ran for this slot. The common case, fired ~96 times a day.
  writeState({});
  process.exit(0);
}

// A manual refresh in progress owns the pipeline. Don't queue behind it and
// don't record the slot — the next tick will find it still due and try again.
if (fs.existsSync(LOCK_DIR)) {
  log(`slot ${due.toLocaleString("sv")} is due but a refresh is already running`);
  writeState({});
  process.exit(0);
}

// Recorded BEFORE the run, not after: a refresh that crashes half way must not
// leave the slot unclaimed, or the next tick starts it again 15 minutes later
// and keeps doing so until the slot rolls over.
writeState({ lastSlot: due.toISOString(), lastStartedAt: now.toISOString() });

const stages = schedule.stages.length ? schedule.stages : [];
log(`slot ${due.toLocaleString("sv")} due — running ${stages.join(" ") || "<所有阶段>"}`);

const r = spawnSync("/bin/bash", [path.join(PROJECT_DIR, "scripts", "refresh-cards.sh"), ...stages], {
  cwd: PROJECT_DIR,
  stdio: "inherit",
  env: { ...process.env, CDB_REFRESH_TRIGGER: "auto" },
});

log(`refresh exited ${r.status ?? "signal " + r.signal}`);
process.exit(0);
