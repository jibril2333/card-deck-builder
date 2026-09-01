/**
 * The card-data refresh, running INSIDE the container.
 *
 * The scrapers write the live database directly. That is what makes "download
 * the image and everything works" possible at all: no Docker socket, no host
 * scripts, no stop/start dance.
 *
 * ## What that costs, and what pays for it
 *
 * There is no staging copy to throw away, so a scraper's writes land as they
 * happen. Two things stand in for the discarded-copy safety net:
 *   · every scraper refuses per set — `sanityOk` blocks a write when a set
 *     comes back empty or malformed, which is the failure that actually
 *     happens (see the BT26 entries in refresh.log for six days of it working);
 *   · a full snapshot is taken before each run, kept as `.refresh-before.db`.
 *     It is both the changelog's "before" side and a restore point.
 *
 * ## The precondition is the FILESYSTEM
 *
 * The database has to live on a filesystem whose locks are real. Demonstrated
 * the hard way: two processes inside one container, on a macOS bind mount,
 * produce `SQLITE_CORRUPT: database disk image is malformed` within a minute,
 * because the file is still on the macOS side of Docker Desktop's boundary
 * where locking is emulated. The identical container against a Docker named
 * volume (the Linux VM's own ext4) scraped 4398 cards while serving pages,
 * with zero corruption.
 *
 * So: a Linux host with a local disk is fine — that is the NAS, and it is the
 * deployment. On macOS/Windows Docker Desktop, use a named volume or leave
 * `CDB_REFRESH_IN_CONTAINER` off.
 *
 *   node scripts-dist/refresh-daemon.js          # loop (the entrypoint's job)
 *   node scripts-dist/refresh-daemon.js --once cards sets   # run and exit
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import {
  parseSchedule,
  dueSlot,
  nextRun,
  describeSchedule,
} from "../src/lib/refresh-schedule";
import { REFRESH_STAGES, REFRESH_STAGE_IDS } from "../src/lib/refresh-stages";
import { clearProgress } from "../src/lib/refresh-progress";

const DATA_DIR = process.env.CDB_DATA_DIR ?? "/app/data.nosync";
const LIVE_DB = path.join(DATA_DIR, "digimon.db");
const BEFORE_DB = path.join(DATA_DIR, ".refresh-before.db");
const SCHEDULE_FILE = path.join(DATA_DIR, "refresh-schedule.json");
const STATE_FILE = path.join(DATA_DIR, "refresh-schedule-state.json");
const STATUS_FILE = path.join(DATA_DIR, "refresh-status.json");
const REQUEST_FILE = path.join(DATA_DIR, "refresh-request");
const LOCK_FILE = path.join(DATA_DIR, ".refresh.lock");
const LOG_FILE = path.join(DATA_DIR, "refresh.log");
/**
 * What a run still has left to do.
 *
 * A refresh runs inside this container, and a new image replaces the container
 * — mid-run, whenever one is pushed. Without this the remaining stages simply
 * never happen and the panel reports a failure, when what occurred was an
 * interruption. Written when a run starts, trimmed as each stage finishes,
 * removed when the run ends; read once at startup.
 */
const RESUME_FILE = path.join(DATA_DIR, "refresh-resume.json");
/** Bundled JS next to this file when running in the image; source when not. */
const SCRIPTS_DIR = process.env.CDB_SCRIPTS_DIR ?? __dirname;
const TICK_MS = 60_000;

function log(msg: string) {
  const line = `[${new Date().toLocaleString("sv")}] [daemon] ${msg}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch {
    /* the log is a convenience, never a reason to stop */
  }
  console.log(line.trimEnd());
}

function readJson<T>(file: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function writeJsonAtomic(file: string, value: unknown) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

/** Same shape the shell writes — the admin page reads one file either way. */
function writeStatus(
  state: "running" | "ok" | "failed",
  message: string,
  stages: string[],
  startedAt: string,
  trigger: string,
) {
  writeJsonAtomic(STATUS_FILE, {
    state,
    message,
    stages: stages.join(" "),
    trigger,
    startedAt,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Why there is no SIGTERM handler here.
 *
 * The scrapes run through `spawnSync`, which blocks this process for the
 * length of the scrape — a handler would not run until the child was already
 * finished. And the daemon is not PID 1: the entrypoint backgrounds it and
 * execs the server, so on `docker stop` the signal goes to the server and this
 * process is killed with the container.
 *
 * So an interrupted run is not detected by being told. It is detected
 * afterwards, by the resume file the next start finds — see RESUME_FILE.
 */

/** Run one bundled script as a child process, inheriting the data dir. */
function runScript(name: string, args: string[] = []): boolean {
  const js = path.join(SCRIPTS_DIR, name.replace(/\.ts$/, ".js"));
  const useSource = !fs.existsSync(js);
  const r = useSource
    ? spawnSync("npx", ["tsx", path.join("scripts", name), ...args], {
        stdio: ["ignore", "inherit", "inherit"],
        env: { ...process.env, CDB_DATA_DIR: DATA_DIR },
      })
    : spawnSync(process.execPath, [js, ...args], {
        stdio: ["ignore", "inherit", "inherit"],
        env: { ...process.env, CDB_DATA_DIR: DATA_DIR },
      });
  return r.status === 0;
}

/** A consistent copy of the live DB, taken while the app keeps serving. */
function snapshot(): boolean {
  try {
    fs.rmSync(BEFORE_DB, { force: true });
    const db = new Database(LIVE_DB, { readonly: true });
    // better-sqlite3's backup is async; the daemon is a loop, so drive it to
    // completion synchronously here rather than making every caller async.
    db.exec(`VACUUM INTO '${BEFORE_DB.replace(/'/g, "''")}'`);
    db.close();
    return true;
  } catch (e) {
    log(`snapshot failed: ${(e as Error).message}`);
    return false;
  }
}

/**
 * Identifies THIS daemon process. Written into the lock file so a lock left
 * behind by a previous container can be told from one a live sibling holds:
 * the lock lives in the mounted data directory and therefore outlives the
 * container, while PIDs restart from 1 in every new one — a stale lock saying
 * "pid 14" is indistinguishable from a running "pid 14" without this.
 */
const INSTANCE = `${process.pid}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

function refresh(stages: string[], trigger: string): boolean {
  if (fs.existsSync(LOCK_FILE)) {
    const held = fs.readFileSync(LOCK_FILE, "utf8").trim();
    log(`another refresh holds the lock (${held}) — skipping`);
    log(`if nothing is actually running, clear it: rm ${LOCK_FILE}`);
    return false;
  }
  fs.writeFileSync(LOCK_FILE, `instance ${INSTANCE} since ${new Date().toISOString()}\n`);

  const startedAt = new Date().toISOString();
  const chosen = stages.length ? stages : REFRESH_STAGE_IDS;
  log(`=== refresh start (${trigger}): ${chosen.join(" ")} ===`);
  writeStatus("running", `starting: ${chosen.join(" ")}`, chosen, startedAt, trigger);

  let ok = true;
  let failedStage = "";
  try {
    const before = snapshot();

    for (const [i, id] of chosen.entries()) {
      const stage = REFRESH_STAGES.find((s) => s.id === id);
      if (!stage) continue;
      // What would be left if this container went away right now.
      writeJsonAtomic(RESUME_FILE, {
        stages: chosen.slice(i),
        trigger,
        startedAt,
        updatedAt: new Date().toISOString(),
      });
      for (const script of stage.scripts) {
        log(`--- ${id}: ${script} ---`);
        writeStatus("running", id, chosen, startedAt, trigger);
        if (!runScript(script)) {
          failedStage = id;
          ok = false;
          break;
        }
      }
      if (!ok) break;
    }

    if (ok && before) {
      // Never fatal: a refresh that scraped fine must not be reported as a
      // failure because the bookkeeping did not.
      log("--- changelog ---");
      runScript("diff-refresh.ts", [BEFORE_DB, LIVE_DB, `--run-at=${startedAt}`]);
    }
  } finally {
    fs.rmSync(LOCK_FILE, { force: true });
    // The scripts report their own progress; the run owns clearing it, so a
    // finished count never lingers into the next thing the panel shows.
    clearProgress();
  }

  // The run reached its own end — a success or a failed script, either way
  // not something to resume.
  fs.rmSync(RESUME_FILE, { force: true });

  if (ok) {
    const n = (() => {
      try {
        const db = new Database(LIVE_DB, { readonly: true });
        const r = db.prepare("SELECT COUNT(*) n FROM cards").get() as { n: number };
        db.close();
        return r.n;
      } catch {
        return -1;
      }
    })();
    writeStatus("ok", `${n} cards`, chosen, startedAt, trigger);
    log(`=== refresh done (${n} cards) ===`);
  } else {
    writeStatus(
      "failed",
      `${failedStage} failed; 数据库保持在这次刷新写入的状态,回滚点见 .refresh-before.db`,
      chosen,
      startedAt,
      trigger,
    );
    log(`FAILED at ${failedStage}`);
  }
  runScript("notify-refresh.ts", ok ? ["ok", "{}"] : ["failed", failedStage || "refresh", "1"]);
  return ok;
}

/** The admin button drops a file; that's the only signal the app can send. */
function takeRequest(): string[] | null {
  if (!fs.existsSync(REQUEST_FILE)) return null;
  let stages: string[] = [];
  try {
    const body = fs.readFileSync(REQUEST_FILE, "utf8").trim();
    if (body) {
      stages = body
        .split(/[\s,]+/)
        .filter((s) => REFRESH_STAGE_IDS.includes(s));
    }
  } catch {
    /* an unreadable request still means "refresh" */
  }
  fs.rmSync(REQUEST_FILE, { force: true });
  return stages;
}

function tick() {
  const requested = takeRequest();
  if (requested) {
    refresh(requested, "manual");
    return;
  }

  const schedule = parseSchedule(readJson(SCHEDULE_FILE), REFRESH_STAGE_IDS);
  const state = readJson<{ lastSlot?: string }>(STATE_FILE) ?? {};
  const due = dueSlot(schedule, new Date());
  const next = nextRun(schedule, new Date());
  writeJsonAtomic(STATE_FILE, {
    ...state,
    describe: describeSchedule(schedule),
    nextRunAt: next ? next.toISOString() : null,
    checkedAt: new Date().toISOString(),
  });
  if (!due) return;
  if (state.lastSlot && new Date(state.lastSlot) >= due) return;

  // Claim the slot BEFORE running: a refresh that dies half way must not be
  // retried every minute for the rest of the day.
  writeJsonAtomic(STATE_FILE, {
    ...state,
    lastSlot: due.toISOString(),
    lastStartedAt: new Date().toISOString(),
    describe: describeSchedule(schedule),
    nextRunAt: next ? next.toISOString() : null,
    checkedAt: new Date().toISOString(),
  });
  refresh(schedule.stages, "auto");
}

function main() {
  const args = process.argv.slice(2);
  const onceAt = args.indexOf("--once");
  if (onceAt >= 0) {
    const stages = args.slice(onceAt + 1).filter((s) => REFRESH_STAGE_IDS.includes(s));
    process.exit(refresh(stages, "manual") ? 0 : 1);
  }
  // Clear a lock nobody holds. In container mode this daemon is the only
  // thing that ever takes it, so at startup — before its first tick — any
  // lock on disk is by definition from a container that no longer exists.
  // Killed mid-refresh (a redeploy, a NAS reboot) it would otherwise block
  // every future run, silently, forever: the symptom is a site whose card
  // data simply stops moving.
  if (fs.existsSync(LOCK_FILE)) {
    const held = fs.readFileSync(LOCK_FILE, "utf8").trim();
    fs.rmSync(LOCK_FILE, { force: true });
    log(`cleared a lock left behind by a previous run (${held})`);
  }

  // A run that was cut short — almost always by this container being replaced
  // with a new image — left the stages it had not reached. Finish them before
  // going back to watching. The scrapes are upserts and the price ones skip
  // what they already have, so re-entering a half-done stage is cheap.
  const resume = readJson<{ stages?: string[] }>(RESUME_FILE);
  if (resume?.stages?.length) {
    const stages = resume.stages.filter((id) => REFRESH_STAGE_IDS.includes(id));
    fs.rmSync(RESUME_FILE, { force: true });
    if (stages.length) {
      log(`resuming an interrupted run: ${stages.join(" ")}`);
      refresh(stages, "resume");
    }
  }

  log(`watching ${DATA_DIR} — schedule + ${path.basename(REQUEST_FILE)}`);
  tick();
  setInterval(tick, TICK_MS);
}

main();
