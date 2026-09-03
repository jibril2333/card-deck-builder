/**
 * Where the continuous backup goes, and by what right.
 *
 * Litestream watches the user database's WAL and copies every change to ONE
 * replica — 0.5 refuses to start with more than one ("multiple replicas on a
 * single database are no longer supported"), which is how the first version of
 * this shipped: it wrote a file replica AND an s3 replica, and the moment R2
 * was configured the process died on startup.
 *
 * So the replica is R2 when there is an R2 to write to, and a local directory
 * otherwise — off-site beats same-machine, because same-machine is what the
 * hourly snapshots below already cover.
 *
 * The snapshots are the other half: `backup-daemon.ts` also takes a plain
 * `VACUUM INTO` copy every hour and keeps a month of them. Those need no
 * credentials, no network and no Litestream to restore — `cp` is enough — and
 * they are what stands behind the off-site replica when the off-site replica
 * is the thing that's broken.
 *
 * Written by the settings page into `data.nosync/backup.json`, read by
 * scripts/backup-daemon.ts, which turns it into litestream.yml and supervises
 * the process. Same app-writes-a-file, daemon-reads-it arrangement as the
 * refresh schedule and the ntfy settings.
 */

export type BackupConfig = {
  /** Off-site replica. Off until someone fills in a bucket and a key pair. */
  r2: {
    enabled: boolean;
    /** e.g. `https://<account-id>.r2.cloudflarestorage.com` — no bucket. */
    endpoint: string;
    bucket: string;
    /** Folder inside the bucket. Lets one bucket hold several installs. */
    prefix: string;
    accessKeyId: string;
    /** Never sent back to the browser. See the route. */
    secretAccessKey: string;
  };
};

export const EMPTY_BACKUP: BackupConfig = {
  r2: {
    enabled: false,
    endpoint: "",
    bucket: "",
    prefix: "digimon-user",
    accessKeyId: "",
    secretAccessKey: "",
  },
};

/**
 * The agreed timings.
 *
 * `sync-interval` depends on where the replica is: a local file write may as
 * well be every second; R2 is a billed PUT, so ten seconds — that caps it at
 * ~26k writes a month against a free tier of a million, and still means the
 * off-site copy is never more than ten seconds behind.
 *
 * Snapshot interval and retention are NOT per replica in Litestream 0.5 —
 * `snapshot:` is a global block that applies to every database and every
 * replica of it (0.5.12 lets you write it under a database, but it gets
 * promoted to global anyway). So the two replicas share one policy: a full
 * copy every 12 hours, a month of history. The local copy therefore keeps 30
 * days rather than the 7 it would if it could be set separately — at 360 KB a
 * snapshot, that is about 22 MB, which is not worth a second process to avoid.
 */
const SNAPSHOT_INTERVAL = "12h";
const SNAPSHOT_RETENTION = "720h"; // 30 days
const LOCAL_SYNC_INTERVAL = "1s";
const R2_SYNC_INTERVAL = "10s";
/** Prometheus endpoint, bound to localhost — the daemon's health probe. */
const METRICS_ADDR = "127.0.0.1:9090";

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** True once R2 has everything it needs to connect. */
export function r2Ready(c: BackupConfig): boolean {
  const r = c.r2;
  return (
    r.enabled &&
    r.endpoint !== "" &&
    r.bucket !== "" &&
    r.accessKeyId !== "" &&
    r.secretAccessKey !== ""
  );
}

/**
 * Coerce whatever's in the file (or the request body) into a config.
 *
 * Lenient about the endpoint in the one way that matters: people paste it with
 * the bucket already on the end (`…r2.cloudflarestorage.com/cdb-backup`),
 * which Litestream would then treat as part of the host. The bucket comes off
 * it and fills the bucket field when that's empty — the same courtesy the ntfy
 * panel does for a pasted topic URL.
 */
export function parseBackupConfig(raw: unknown): BackupConfig {
  const o = (raw ?? {}) as Record<string, unknown>;
  const r = (o.r2 ?? {}) as Record<string, unknown>;

  let endpoint = str(r.endpoint);
  let bucket = str(r.bucket).replace(/^\/+|\/+$/g, "");
  if (endpoint !== "") {
    if (!/^https?:\/\//i.test(endpoint)) endpoint = `https://${endpoint}`;
    try {
      const u = new URL(endpoint);
      const path = u.pathname.replace(/^\/+|\/+$/g, "");
      if (path && bucket === "") bucket = path.split("/")[0];
      endpoint = u.origin;
    } catch {
      /* leave it as typed; the daemon's log will say what went wrong */
    }
  }

  const prefix =
    str(r.prefix).replace(/^\/+|\/+$/g, "") || EMPTY_BACKUP.r2.prefix;
  return {
    r2: {
      enabled: r.enabled === undefined ? bucket !== "" : Boolean(r.enabled),
      endpoint,
      bucket,
      prefix,
      accessKeyId: str(r.accessKeyId),
      secretAccessKey: str(r.secretAccessKey),
    },
  };
}

/** What the browser may see of a secret: enough to recognise, never enough to use. */
export function maskSecret(secret: string): string {
  if (secret === "") return "";
  if (secret.length <= 8) return "••••";
  return `${secret.slice(0, 4)}…${secret.slice(-4)}`;
}

/**
 * The litestream.yml for this config.
 *
 * Every value that came from a person is written as a JSON string, which is
 * also a valid YAML double-quoted scalar — a bucket named `a: b #c` can then
 * only ever be a bucket name. The daemon additionally runs litestream with
 * `-no-expand-env` so a `$` in a secret key isn't read as a variable.
 */
export function toLitestreamYaml(
  config: BackupConfig,
  paths: { db: string; localDir: string },
): string {
  const q = (v: string) => JSON.stringify(v);
  const lines = [
    "# Generated by the app from data.nosync/backup.json — edits are overwritten.",
    `addr: ${q(METRICS_ADDR)}`,
    "logging:",
    "  level: info",
    "  type: text",
    "snapshot:",
    `  interval: ${SNAPSHOT_INTERVAL}`,
    `  retention: ${SNAPSHOT_RETENTION}`,
    "dbs:",
    `  - path: ${q(paths.db)}`,
  ];
  if (r2Ready(config)) {
    const r = config.r2;
    lines.push(
      "    replica:",
      "      type: s3",
      `      endpoint: ${q(r.endpoint)}`,
      `      bucket: ${q(r.bucket)}`,
      `      path: ${q(r.prefix)}`,
      // R2 has one region and calls it this; a wrong region here is a 400.
      '      region: "auto"',
      `      access-key-id: ${q(r.accessKeyId)}`,
      `      secret-access-key: ${q(r.secretAccessKey)}`,
      `      sync-interval: ${R2_SYNC_INTERVAL}`,
    );
  } else {
    lines.push(
      "    replica:",
      "      type: file",
      `      path: ${q(paths.localDir)}`,
      `      sync-interval: ${LOCAL_SYNC_INTERVAL}`,
    );
  }
  return lines.join("\n") + "\n";
}
