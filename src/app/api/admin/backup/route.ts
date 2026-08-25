import { isAdmin } from "@/lib/auth/admin";
import {
  maskSecret,
  parseBackupConfig,
  r2Ready,
  type BackupConfig,
} from "@/lib/backup-config";
import {
  readBackupConfig,
  readBackupStatus,
  writeBackupConfig,
} from "@/lib/backup-store";

/**
 * Backup settings: the off-site replica's bucket and key pair.
 *
 * The app only writes `data.nosync/backup.json`; scripts/backup-daemon.ts
 * notices, regenerates litestream.yml and restarts replication. Same shape as
 * the ntfy endpoint next door — and the same rule about the secret: PUT takes
 * one, GET never returns it. A key the browser can read back is one XSS away
 * from being someone else's backup bucket.
 *
 * GET also reports what the daemon last wrote about itself, so the panel can
 * show whether replication is actually running rather than only what was
 * typed into it.
 */
export const dynamic = "force-dynamic";

function publicView(c: BackupConfig) {
  return {
    r2: {
      enabled: c.r2.enabled,
      endpoint: c.r2.endpoint,
      bucket: c.r2.bucket,
      prefix: c.r2.prefix,
      accessKeyId: c.r2.accessKeyId,
      secretSet: c.r2.secretAccessKey !== "",
      secretHint: maskSecret(c.r2.secretAccessKey),
      ready: r2Ready(c),
    },
  };
}

export async function GET() {
  if (!(await isAdmin())) return new Response("forbidden", { status: 403 });
  return Response.json({
    config: publicView(readBackupConfig()),
    status: readBackupStatus(),
  });
}

export async function PUT(req: Request) {
  if (!(await isAdmin())) return new Response("forbidden", { status: 403 });

  let incoming: BackupConfig;
  try {
    incoming = parseBackupConfig(await req.json());
  } catch {
    return Response.json({ ok: false, error: "请求格式不对" }, { status: 400 });
  }

  // An empty secret field means "leave the saved one alone": the form can't
  // show it, so it can't send it back, and treating blank as "erase" would
  // wipe the key every time someone fixed a typo in the bucket name.
  const current = readBackupConfig();
  const next: BackupConfig = {
    r2: {
      ...incoming.r2,
      secretAccessKey:
        incoming.r2.secretAccessKey || current.r2.secretAccessKey,
    },
  };

  try {
    writeBackupConfig(next);
  } catch (err) {
    console.error("[admin/backup] write failed:", err);
    return Response.json(
      { ok: false, error: "无法写入配置文件" },
      { status: 500 },
    );
  }

  return Response.json({ ok: true, config: publicView(next) });
}
