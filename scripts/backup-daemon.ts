/**
 * Keeps Litestream running, and says so.
 *
 * Litestream is configured by a YAML file it reads once at startup, but the
 * credentials for the off-site replica are typed into the settings page. This
 * closes that gap: it watches `backup.json`, writes `litestream.yml`, and
 * (re)starts `litestream replicate` whenever the config changes. The container
 * deliberately has no Docker socket, so a sidecar it could not restart would
 * mean editing a file on the NAS by hand every time a key rotates.
 *
 * It also answers the question a backup has to answer to be worth anything:
 * IS IT RUNNING. Every tick it writes `backup-status.json` (the panel reads
 * it), every hour it asks Litestream for the newest snapshot of each replica,
 * and once a week it restores the newest one into a temp file and runs an
 * integrity check — a backup nobody has ever restored is a rumour.
 *
 * Failures go to ntfy at priority 4: a replica that quietly stopped three
 * weeks ago is the exact failure this whole feature exists to prevent.
 *
 *   node scripts-dist/backup-daemon.js          # loop (the entrypoint's job)
 *   node scripts-dist/backup-daemon.js --once   # one supervision pass, exit
 *   node scripts-dist/backup-daemon.js --verify # run the restore drill now
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import Database from "better-sqlite3";
import {
  EMPTY_BACKUP,
  parseBackupConfig,
  r2Ready,
  toLitestreamYaml,
  type BackupConfig,
} from "../src/lib/backup-config";
import { parseNtfyConfig, EMPTY_NTFY } from "../src/lib/ntfy-config";
import { sendNtfy } from "../src/lib/refresh-notify";

const DATA_DIR = process.env.CDB_DATA_DIR ?? "/app/data.nosync";
/** Mapped by compose to a dataset OUTSIDE the one holding the database. */
const BACKUP_DIR = process.env.CDB_BACKUP_DIR ?? "/app/backups";
const USER_DB =
  process.env.CDB_DIGIMON_USER_DB ?? path.join(DATA_DIR, "digimon-user.db");
const CONFIG_FILE = path.join(DATA_DIR, "backup.json");
const YAML_FILE = path.join(DATA_DIR, "litestream.yml");
const STATUS_FILE = path.join(DATA_DIR, "backup-status.json");
const LOG_FILE = path.join(DATA_DIR, "backup.log");
const LITESTREAM = process.env.CDB_LITESTREAM_BIN ?? "litestream";

const TICK_MS = 60_000;
const SNAPSHOT_CHECK_MS = 60 * 60_000;
const DRILL_MS = 7 * 24 * 60 * 60_000;
/** How long a fresh start gets before its first drill. A container that came
 *  up thirty seconds ago has nothing to restore yet, and shouting about that
 *  is how a monitor teaches people to ignore it. */
const FIRST_DRILL_MS = 30 * 60_000;
/** Restarts inside this window before we call it a crash loop and shout. */
const CRASH_WINDOW_MS = 10 * 60_000;
const CRASH_LIMIT = 3;

type Status = {
  state: "off" | "running" | "starting" | "failed" | "missing-binary";
  message: string;
  /** ISO time replication started, when it is up. */
  since: string | null;
  restarts: number;
  r2: "off" | "on";
  /** Newest LTX file in the local replica — the freshness of the backup. */
  localLatest: string | null;
  /** Last ERROR Litestream logged, which is where an unreachable R2 shows up. */
  lastError: { at: string; text: string } | null;
  lastDrill: { at: string; ok: boolean; message: string } | null;
  checkedAt: string;
};

function log(msg: string) {
  const line = `[${new Date().toLocaleString("sv")}] [backup] ${msg}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch {
    /* the log is a convenience, never a reason to stop */
  }
  console.log(line.trimEnd());
}

function writeJsonAtomic(file: string, value: unknown) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

function readConfig(): BackupConfig {
  try {
    return parseBackupConfig(JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")));
  } catch {
    return EMPTY_BACKUP;
  }
}

function haveBinary(): boolean {
  const r = spawnSync(LITESTREAM, ["version"], { stdio: "ignore" });
  return r.status === 0;
}

async function notify(title: string, body: string) {
  try {
    const cfg = parseNtfyConfig(
      JSON.parse(fs.readFileSync(path.join(DATA_DIR, "ntfy.json"), "utf8")),
    );
    await sendNtfy(cfg, {
      title,
      body,
      priority: 4,
      tags: ["floppy_disk"],
      click: process.env.CDB_PUBLIC_URL ?? "",
    });
  } catch {
    /* not configured, or unreachable — never a reason to stop replicating */
    void EMPTY_NTFY;
  }
}

// ────────────────────────────────────────────────────────────────────────
// The supervised process
// ────────────────────────────────────────────────────────────────────────

let child: ChildProcess | null = null;
let childYaml = "";
let startedAt: string | null = null;
let restarts = 0;
let recentCrashes: number[] = [];
let crashNotified = false;
let lastSnapshotCheck = 0;
let lastDrillAt = 0;
const startedRunning = Date.now();
let status: Status = {
  state: "off",
  message: "还没开始",
  since: null,
  restarts: 0,
  r2: "off",
  localLatest: null,
  lastError: null,
  lastDrill: null,
  checkedAt: new Date().toISOString(),
};

function stopChild() {
  if (!child) return;
  child.kill("SIGTERM");
  child = null;
  startedAt = null;
}

function startChild(yaml: string) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  // 0600: the file holds the R2 secret.
  fs.writeFileSync(YAML_FILE, yaml, { mode: 0o600 });
  fs.chmodSync(YAML_FILE, 0o600);

  // -no-expand-env: a secret key containing `$` is a secret key, not a
  // reference to an environment variable that doesn't exist.
  const proc = spawn(
    LITESTREAM,
    ["replicate", "-config", YAML_FILE, "-no-expand-env"],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    },
  );
  child = proc;
  childYaml = yaml;
  startedAt = new Date().toISOString();

  const pipe = (buf: Buffer) => {
    const text = buf.toString().trimEnd();
    if (!text) return;
    log(`litestream: ${text}`);
    // An off-site replica that can't be reached says so here and nowhere else
    // — the process keeps running and the local replica keeps working, which
    // is exactly the failure that would otherwise go unnoticed.
    const bad = text
      .split("\n")
      .filter((l) => l.includes("level=ERROR") || l.includes("level=WARN"))
      .pop();
    if (bad)
      status.lastError = {
        at: new Date().toISOString(),
        text: bad.slice(0, 300),
      };
  };
  proc.stdout?.on("data", pipe);
  proc.stderr?.on("data", pipe);

  proc.on("exit", (code, signal) => {
    if (child !== proc) return; // replaced on purpose
    child = null;
    startedAt = null;
    restarts += 1;
    const now = Date.now();
    recentCrashes = [...recentCrashes, now].filter(
      (t) => now - t < CRASH_WINDOW_MS,
    );
    log(`litestream exited (code ${code ?? "-"}, signal ${signal ?? "-"})`);
    if (recentCrashes.length >= CRASH_LIMIT && !crashNotified) {
      crashNotified = true;
      void notify(
        "备份停了",
        `Litestream 在 10 分钟内退出了 ${recentCrashes.length} 次,备份已经停止。` +
          `最近一次退出码 ${code ?? "-"}。`,
      );
    }
  });
  log(`litestream started (pid ${proc.pid})`);
}

/**
 * How fresh the local replica is, straight from Litestream.
 *
 * `litestream ltx` lists the files that make up a replica, and the `created`
 * column is the only end-to-end evidence that bytes actually left this
 * process. Asked by REPLICA URL rather than by database path, because that
 * form reads the replica itself — and note it refuses `-config` when given a
 * URL ("cannot specify a replica URL and the -config flag").
 *
 * (0.5 dropped the old `snapshots` command; asking for it returns "unknown
 * command", which is how this first shipped reporting nothing at all.)
 */
function readLocalLatest(): string | null {
  const localDir = path.join(BACKUP_DIR, path.basename(USER_DB, ".db"));
  const r = spawnSync(
    LITESTREAM,
    ["ltx", "-level", "all", `file://${localDir}`],
    { encoding: "utf8" },
  );
  if (r.status !== 0) return null;
  const times = r.stdout
    .trim()
    .split("\n")
    .slice(1) // header
    .map((l) => l.trim().split(/\s+/).pop() ?? "")
    .filter((t) => /^\d{4}-\d{2}-\d{2}T/.test(t))
    .sort();
  return times.length ? times[times.length - 1] : null;
}

/**
 * Restore the newest copy into a temp file and check it.
 *
 * This is the only step that proves the chain end to end: config → replica →
 * a file SQLite will open. Everything else proves that a process is running.
 */
function runDrill(): { ok: boolean; message: string } {
  const out = path.join(os.tmpdir(), `cdb-drill-${Date.now()}.db`);
  try {
    const r = spawnSync(
      LITESTREAM,
      ["restore", "-config", YAML_FILE, "-no-expand-env", "-o", out, USER_DB],
      { encoding: "utf8" },
    );
    if (r.status !== 0) {
      return {
        ok: false,
        message: (r.stderr || r.stdout || "").trim().slice(0, 200),
      };
    }
    // Opened with the same driver the app uses, then asked the one question
    // that reads every page.
    const db = new Database(out, { readonly: true });
    try {
      const check = db.pragma("integrity_check", { simple: true }) as string;
      const decks = (
        db.prepare("SELECT COUNT(*) AS n FROM decks").get() as { n: number }
      ).n;
      if (check !== "ok")
        return { ok: false, message: `integrity_check: ${check}` };
      return { ok: true, message: `恢复成功,${decks} 副卡组` };
    } finally {
      db.close();
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  } finally {
    fs.rmSync(out, { force: true });
  }
}

function tick() {
  const now = Date.now();
  const config = readConfig();
  const wantYaml = toLitestreamYaml(config, {
    db: USER_DB,
    localDir: path.join(BACKUP_DIR, path.basename(USER_DB, ".db")),
  });

  if (!haveBinary()) {
    status = {
      ...status,
      state: "missing-binary",
      message: "容器里没有 litestream",
      since: null,
      checkedAt: new Date().toISOString(),
    };
    writeJsonAtomic(STATUS_FILE, status);
    return;
  }

  if (!fs.existsSync(USER_DB)) {
    status = {
      ...status,
      state: "off",
      message: "还没有用户数据库",
      checkedAt: new Date().toISOString(),
    };
    writeJsonAtomic(STATUS_FILE, status);
    return;
  }

  // Config changed (or nothing is running): restart onto the new one.
  if (!child || wantYaml !== childYaml) {
    if (child) log("config changed — restarting replication");
    stopChild();
    crashNotified = false;
    startChild(wantYaml);
  }

  // Hourly once it is answering, but every tick until it does: the first
  // check runs before Litestream has written anything, and waiting an hour to
  // ask again leaves the panel saying "还没有备份" for an hour after a restart.
  if (!status.localLatest || now - lastSnapshotCheck > SNAPSHOT_CHECK_MS) {
    lastSnapshotCheck = now;
    status.localLatest = readLocalLatest();
  }
  // Only drill against a replica that has something in it, and never in the
  // first half hour of a run.
  const drillDue =
    lastDrillAt === 0
      ? now - startedRunning > FIRST_DRILL_MS
      : now - lastDrillAt > DRILL_MS;
  if (drillDue && status.localLatest) {
    lastDrillAt = now;
    const drill = runDrill();
    status.lastDrill = { at: new Date().toISOString(), ...drill };
    log(`restore drill: ${drill.ok ? "ok" : "FAILED"} — ${drill.message}`);
    if (!drill.ok) {
      void notify("备份恢复演练失败", drill.message);
    }
  }

  status = {
    ...status,
    state: child ? "running" : "failed",
    message: child ? "正在复制" : "litestream 没在跑",
    since: startedAt,
    restarts,
    r2: r2Ready(config) ? "on" : "off",
    checkedAt: new Date().toISOString(),
  };
  writeJsonAtomic(STATUS_FILE, status);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--verify")) {
    const r = runDrill();
    console.log(r.ok ? `ok — ${r.message}` : `failed — ${r.message}`);
    process.exit(r.ok ? 0 : 1);
  }
  if (args.includes("--once")) {
    tick();
    stopChild();
    process.exit(0);
  }
  log(`watching ${CONFIG_FILE} — replicating ${USER_DB} to ${BACKUP_DIR}`);
  tick();
  setInterval(tick, TICK_MS);
  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.on(sig, () => {
      stopChild();
      process.exit(0);
    });
  }
}

main();
