import { describe, expect, it } from "vitest";
import {
  EMPTY_BACKUP,
  maskSecret,
  parseBackupConfig,
  r2Ready,
  toLitestreamYaml,
} from "@/lib/backup-config";

/**
 * The R2 half of this config is a credential typed into a web page that ends
 * up in a YAML file a subprocess reads. So: what survives parsing, what the
 * browser is allowed to see, and whether a hostile bucket name can climb out
 * of its quotes.
 */
const full = parseBackupConfig({
  r2: {
    enabled: true,
    endpoint: "https://abc123.r2.cloudflarestorage.com",
    bucket: "cdb-backup",
    accessKeyId: "AKIAEXAMPLE",
    secretAccessKey: "s3cr3t",
  },
});

describe("parseBackupConfig", () => {
  it("takes the bucket off a pasted endpoint", () => {
    const c = parseBackupConfig({
      r2: { endpoint: "abc123.r2.cloudflarestorage.com/cdb-backup" },
    });
    expect(c.r2.endpoint).toBe("https://abc123.r2.cloudflarestorage.com");
    expect(c.r2.bucket).toBe("cdb-backup");
    // A bucket already typed in wins — the URL is the guess, not the answer.
    const c2 = parseBackupConfig({
      r2: { endpoint: "https://x.example.com/from-url", bucket: "typed" },
    });
    expect(c2.r2.bucket).toBe("typed");
  });

  it("defaults the prefix rather than writing to the bucket root", () => {
    expect(parseBackupConfig({}).r2.prefix).toBe(EMPTY_BACKUP.r2.prefix);
    expect(parseBackupConfig({ r2: { prefix: "/nas/" } }).r2.prefix).toBe("nas");
  });

  it("isn't ready until every field it needs is there", () => {
    expect(r2Ready(EMPTY_BACKUP)).toBe(false);
    expect(r2Ready(full)).toBe(true);
    expect(r2Ready({ r2: { ...full.r2, secretAccessKey: "" } })).toBe(false);
    expect(r2Ready({ r2: { ...full.r2, enabled: false } })).toBe(false);
  });
});

describe("maskSecret", () => {
  it("shows enough to recognise and not enough to use", () => {
    expect(maskSecret("")).toBe("");
    expect(maskSecret("short")).toBe("••••");
    expect(maskSecret("abcdefghijklmnop")).toBe("abcd…mnop");
  });
});

describe("toLitestreamYaml", () => {
  const paths = { db: "/app/data.nosync/digimon-user.db", localDir: "/app/backups/user" };

  it("always writes the local replica, R2 only when it can connect", () => {
    const local = toLitestreamYaml(EMPTY_BACKUP, paths);
    expect(local).toContain("type: file");
    expect(local).not.toContain("type: s3");

    const both = toLitestreamYaml(full, paths);
    expect(both).toContain("type: s3");
    expect(both).toContain('bucket: "cdb-backup"');
    // The two agreed sync intervals, one per replica.
    expect(both).toContain("sync-interval: 1s");
    expect(both).toContain("sync-interval: 10s");
    // Snapshot policy is global in Litestream 0.5 — one block, both replicas.
    expect(both).toContain("snapshot:\n  interval: 12h\n  retention: 720h");
  });

  it("keeps a hostile value inside its quotes", () => {
    const nasty = parseBackupConfig({
      r2: {
        enabled: true,
        endpoint: "https://x.example.com",
        bucket: 'a"\nlevels:\n  - interval: 1s',
        accessKeyId: "k",
        secretAccessKey: "$NOT_A_VARIABLE",
      },
    });
    const yaml = toLitestreamYaml(nasty, paths);
    // The injected newline is escaped INSIDE the quotes rather than printed,
    // so it never becomes a key of its own.
    const lines = yaml.split("\n");
    expect(lines.filter((l) => /^\s*levels:/.test(l))).toHaveLength(0);
    expect(lines.filter((l) => /^\s*bucket:/.test(l))).toHaveLength(1);
    expect(yaml).toContain('secret-access-key: "$NOT_A_VARIABLE"');
  });
});

/**
 * The daemon pipes Litestream's stdout into `backup.log`. Litestream logs a
 * line per sync interval — one a second — so the filter that keeps those out
 * of the file is the difference between a log and 180 MB a month. The regex
 * lives in scripts/backup-daemon.ts; this pins its behaviour on real lines.
 */
describe("the litestream log filter", () => {
  const noise = (l: string) => /msg="(replica sync|sync)"/.test(l);

  it("drops the per-second heartbeat", () => {
    expect(
      noise(
        'time=2026-08-26T17:01:05.148Z level=INFO msg="replica sync" system=store db=digimon-user.db replica=file txid.replica=000000000000000a txid.db=000000000000000a',
      ),
    ).toBe(true);
  });

  it("keeps everything that says something", () => {
    for (const line of [
      'time=… level=INFO msg="snapshot complete" system=store db=digimon-user.db txid=1 size=70867',
      'time=… level=INFO msg="compaction complete" system=store level=1',
      'time=… level=ERROR msg="monitor error" error="write ltx file: mkdir /app/backups: permission denied"',
      'time=… level=WARN msg="cannot connect to replica"',
    ]) {
      expect(noise(line), line).toBe(false);
    }
  });
});
