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
/**
 * Where the local replica goes.
 *
 * `/app/backups` is where compose mounts something — a named volume by
 * default, a dataset if the operator set CDB_BACKUP_DIR. `docker run` with
 * neither mounts nothing, and replicating into the image's own filesystem is a
 * backup that disappears with the next `docker compose up -d`. So when nothing
 * is mounted there, the replica moves INSIDE the data volume: same disk as the
 * database, which is the weaker arrangement, but it survives a redeploy and it
 * is a real point-in-time restore. `pickReplicaDir` decides, every tick.
 */
const MOUNTPOINT = process.env.CDB_BACKUP_DIR ?? "/app/backups";
const FALLBACK_DIR = path.join(DATA_DIR, "backups", "litestream");
const USER_DB =
  process.env.CDB_DIGIMON_USER_DB ?? path.join(DATA_DIR, "digimon-user.db");
const CONFIG_FILE = path.join(DATA_DIR, "backup.json");
const YAML_FILE = path.join(DATA_DIR, "litestream.yml");
const STATUS_FILE = path.join(DATA_DIR, "backup-status.json");
const LOG_FILE = path.join(DATA_DIR, "backup.log");
const LITESTREAM = process.env.CDB_LITESTREAM_BIN ?? "litestream";

const TICK_MS = 60_000;
const SNAPSHOT_CHECK_MS = 60 * 60_000;
/** How often the plain `VACUUM INTO` copy is taken. */
const SNAPSHOT_EVERY_MS = 60 * 60_000;
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
  /** Where the replica goes: the bucket, or a directory on this machine. */
  target: string;
  /** Newest LTX file in the replica — how far behind the off-site copy is. */
  replicaLatest: string | null;
  /** Newest plain `VACUUM INTO` copy, and how many are kept. */
  snapshotLatest: string | null;
  snapshotCount: number;
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

/**
 * Litestream's own bookkeeping, next to the database.
 *
 * It records which LTX files the replica already has. Point the config at a
 * DIFFERENT replica and that bookkeeping is about a place that no longer
 * exists: every sync then fails with "open ltx file …: no such file or
 * directory", forever, while the process stays up and looks healthy. Deleting
 * it makes Litestream start the new replica from a fresh snapshot, which for
 * a 400 KB database costs nothing.
 */
function stateDir(): string {
  return path.join(
    path.dirname(USER_DB),
    `.${path.basename(USER_DB)}-litestream`,
  );
}

function resetLitestreamState(why: string): void {
  stopChild();
  fs.rmSync(stateDir(), { recursive: true, force: true });
  lastReset = Date.now();
  log(`reset litestream state — ${why}`);
}

/** Is this path a mount of its own, or just a directory in the image? */
function isMountpoint(dir: string): boolean {
  try {
    const here = fs.statSync(dir);
    const parent = fs.statSync(path.dirname(dir));
    return here.dev !== parent.dev;
  } catch {
    return false;
  }
}

/** Can we write here? Returns why not, in words someone can act on. */
function whyNotWritable(dir: string): string | null {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, ".write-probe");
    fs.writeFileSync(probe, "");
    fs.rmSync(probe, { force: true });
    return null;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    // The uid is asked for rather than assumed: compose starts this container
    // as `${CDB_UID}:${CDB_GID}` (568:568 on TrueNAS, the host's own apps
    // user), so "chown 1001" — the uid baked into the image — is advice that
    // doesn't work on the machine reading it.
    const uid = typeof process.getuid === "function" ? process.getuid() : "?";
    const gid = typeof process.getgid === "function" ? process.getgid() : "?";
    if (code === "EACCES" || code === "EPERM") {
      return `${dir} 不可写(容器里跑的是 ${uid}:${gid});在宿主机上 chown -R ${uid}:${gid}`;
    }
    return `${dir} 用不了 — ${e instanceof Error ? e.message : String(e)}`;
  }
}

/**
 * The directory to replicate into, and what to say about it.
 *
 * Three cases, in the order they actually happen to people:
 *   · a mount that works                 → use it, say nothing
 *   · a mount that is root-owned         → fall back, and say how to fix it,
 *     because a stranger who never opens the settings page should still end up
 *     with a backup rather than with a log line
 *   · nothing mounted (`docker run` with only a data volume) → fall back, and
 *     say that the copy shares a disk with the database
 */
function pickReplicaDir(): { dir: string; note: string | null } {
  const mounted = isMountpoint(MOUNTPOINT) || process.env.CDB_BACKUP_DIR;
  if (mounted) {
    const problem = whyNotWritable(MOUNTPOINT);
    if (!problem) return { dir: MOUNTPOINT, note: null };
    const fallback = whyNotWritable(FALLBACK_DIR);
    if (fallback) return { dir: MOUNTPOINT, note: problem };
    return { dir: FALLBACK_DIR, note: `${problem};暂时先备到数据目录里` };
  }
  const problem = whyNotWritable(FALLBACK_DIR);
  if (problem) return { dir: FALLBACK_DIR, note: problem };
  return {
    dir: FALLBACK_DIR,
    note: "副本和数据库在同一个卷 —— 挂一个 CDB_BACKUP_DIR 到别处更稳",
  };
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
let lastSnapshotTaken = 0;
/** The replica the last run was writing to, read back from the status file. */
let lastTarget: string = (() => {
  try {
    return (
      (JSON.parse(fs.readFileSync(STATUS_FILE, "utf8")) as Status).target ?? ""
    );
  } catch {
    return "";
  }
})();
let lastReset = 0;
const startedRunning = Date.now();
let status: Status = {
  state: "off",
  message: "还没开始",
  since: null,
  restarts: 0,
  r2: "off",
  target: "",
  replicaLatest: null,
  snapshotLatest: null,
  snapshotCount: 0,
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
    // Litestream logs a "replica sync" line every sync interval — one a
    // second, forever, whether or not anything changed. Piping those into a
    // file grew backup.log by 27k lines in two hours (~180 MB a month) and
    // told nobody anything: the panel already reports freshness from the
    // replica itself. Keep the lifecycle lines and everything unusual.
    const keep = text
      .split("\n")
      .filter((l) => !/msg="(replica sync|sync)"/.test(l));
    if (keep.length) log(`litestream: ${keep.join("\n")}`);
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
    // Self-heal the one error that never clears on its own. Rate-limited, so
    // a genuinely broken replica doesn't turn into a reset loop.
    if (
      text.includes("LTX file is missing") &&
      Date.now() - lastReset > 10 * 60_000
    ) {
      resetLitestreamState("replica state pointed at files that are gone");
    }
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
 * How fresh the replica is, straight from Litestream.
 *
 * `litestream ltx` lists the files that make up a replica, and the `created`
 * column is the only end-to-end evidence that bytes actually left this
 * process. Asked by DATABASE path with `-config`, which reads whichever
 * replica is configured — R2 or a directory — rather than by replica URL,
 * which refuses `-config` and so has no credentials for a bucket.
 *
 * (0.5 dropped the old `snapshots` command; asking for it returns "unknown
 * command", which is how this first shipped reporting nothing at all.)
 */
function readReplicaLatest(): string | null {
  const r = spawnSync(
    LITESTREAM,
    ["ltx", "-config", YAML_FILE, "-no-expand-env", "-level", "all", USER_DB],
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
 * A plain copy of the database, kept next to the machine.
 *
 * Litestream can only have ONE replica per database, and when that replica is
 * R2 the local copy it used to write is gone. This is what stands in: a
 * `VACUUM INTO` every hour, which needs no credentials, no network and no
 * Litestream to restore — `cp` is enough — and is therefore the thing that
 * still works when the off-site replica is what's broken.
 *
 * Kept: every hour for two days, then one a day for a month. At ~400 KB a
 * copy that is about 30 MB.
 */
function takeSnapshot(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  const now = new Date();
  const stamp = now.toISOString().slice(0, 13).replace(/[:T]/g, "-"); // YYYY-MM-DD-HH
  const dest = path.join(dir, `${stamp}.db`);
  if (fs.existsSync(dest)) return;
  const db = new Database(USER_DB, { readonly: true });
  try {
    db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
  } finally {
    db.close();
  }
  pruneSnapshots(dir, now);
}

function pruneSnapshots(dir: string, now: Date): void {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".db"))
    .sort();
  const keepDaily = new Set<string>();
  for (const f of files) keepDaily.add(f.slice(0, 10)); // first of each day wins
  const firstOfDay = new Set<string>();
  for (const f of files) {
    const day = f.slice(0, 10);
    if (!firstOfDay.has(day)) firstOfDay.add(day + "|" + f);
  }
  const keep = new Set([...firstOfDay].map((k) => k.split("|")[1]));
  for (const f of files) {
    const age =
      now.getTime() -
      Date.parse(f.slice(0, 13).replace(/-(\d\d)$/, "T$1") + ":00:00Z");
    const isDaily = keep.has(f);
    const tooOld = isDaily ? age > 30 * 86_400_000 : age > 2 * 86_400_000;
    if (tooOld) fs.rmSync(path.join(dir, f), { force: true });
  }
  void keepDaily;
}

function snapshotState(dir: string): { latest: string | null; count: number } {
  try {
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".db"))
      .sort();
    if (!files.length) return { latest: null, count: 0 };
    const newest = files[files.length - 1];
    return {
      latest: fs.statSync(path.join(dir, newest)).mtime.toISOString(),
      count: files.length,
    };
  } catch {
    return { latest: null, count: 0 };
  }
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

  const picked = pickReplicaDir();
  const localDir = path.join(picked.dir, path.basename(USER_DB, ".db"));
  const wantYaml = toLitestreamYaml(config, { db: USER_DB, localDir });
  const blocked = whyNotWritable(localDir);
  if (blocked) {
    // Don't start a process whose every sync will fail; say what's wrong once,
    // and pick it up again as soon as the host side is fixed.
    stopChild();
    if (status.message !== blocked) {
      log(blocked);
      void notify("备份没在跑", blocked);
    }
    status = {
      ...status,
      state: "failed",
      message: blocked,
      since: null,
      replicaLatest: null,
      checkedAt: new Date().toISOString(),
    };
    writeJsonAtomic(STATUS_FILE, status);
    return;
  }

  const target = r2Ready(config)
    ? `R2 ${config.r2.bucket}/${config.r2.prefix}`
    : localDir;
  if (lastTarget && lastTarget !== target) {
    resetLitestreamState(`replica moved: ${lastTarget} → ${target}`);
  }
  lastTarget = target;

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
  if (!status.replicaLatest || now - lastSnapshotCheck > SNAPSHOT_CHECK_MS) {
    lastSnapshotCheck = now;
    status.replicaLatest = readReplicaLatest();
  }

  // The plain copy, hourly. Independent of Litestream on purpose — it is what
  // is left when the replica, the credentials or the network is the problem.
  const snapDir = path.join(picked.dir, "snapshots");
  if (now - lastSnapshotTaken > SNAPSHOT_EVERY_MS) {
    lastSnapshotTaken = now;
    try {
      takeSnapshot(snapDir);
    } catch (e) {
      log(`snapshot failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const snaps = snapshotState(snapDir);
  // Only drill against a replica that has something in it, and never in the
  // first half hour of a run.
  const drillDue =
    lastDrillAt === 0
      ? now - startedRunning > FIRST_DRILL_MS
      : now - lastDrillAt > DRILL_MS;
  if (drillDue && status.replicaLatest) {
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
    message: child
      ? r2Ready(config) || !picked.note
        ? "正在复制"
        : `正在复制 —— ${picked.note}`
      : "litestream 没在跑",
    since: startedAt,
    restarts,
    r2: r2Ready(config) ? "on" : "off",
    target,
    snapshotLatest: snaps.latest,
    snapshotCount: snaps.count,
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
  log(
    `watching ${CONFIG_FILE} — replicating ${USER_DB} to ${pickReplicaDir().dir}`,
  );
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
