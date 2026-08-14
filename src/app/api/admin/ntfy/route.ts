import fs from "node:fs";
import path from "node:path";
import { isAdmin } from "@/lib/auth/admin";
import {
  EMPTY_NTFY,
  maskToken,
  ntfyReady,
  parseNtfyConfig,
  type NtfyConfig,
} from "@/lib/ntfy-config";

/**
 * Push-notification settings.
 *
 * The app only writes `data.nosync/ntfy.json`; the host's
 * `scripts/notify-refresh.ts` reads it at the end of a refresh. Same shape as
 * the schedule endpoint next door, and for the same reason — this container is
 * internet-facing and doesn't get to run things on the machine.
 *
 * The token is write-only across this boundary: GET returns whether one is set
 * and a few characters of it, never the value. A saved token that the browser
 * can read back is one XSS away from being someone else's.
 */
export const dynamic = "force-dynamic";

const DATA_DIR =
  process.env.CDB_DATA_DIR ?? path.join(process.cwd(), "data.nosync");
const FILE = path.join(DATA_DIR, "ntfy.json");

export function readNtfyConfig(): NtfyConfig {
  try {
    return parseNtfyConfig(JSON.parse(fs.readFileSync(FILE, "utf8")));
  } catch {
    return EMPTY_NTFY;
  }
}

function publicView(c: NtfyConfig) {
  return {
    enabled: c.enabled,
    url: c.url,
    topic: c.topic,
    tokenSet: c.token !== "",
    tokenHint: maskToken(c.token),
    ready: ntfyReady(c),
  };
}

export async function GET() {
  if (!(await isAdmin())) return new Response("forbidden", { status: 403 });
  return Response.json({ config: publicView(readNtfyConfig()) });
}

export async function PUT(req: Request) {
  if (!(await isAdmin())) return new Response("forbidden", { status: 403 });

  let incoming: NtfyConfig;
  try {
    incoming = parseNtfyConfig(await req.json());
  } catch {
    return Response.json({ ok: false, error: "请求格式不对" }, { status: 400 });
  }

  // An empty token field means "leave the saved one alone" — the form can't
  // show it, so it can't send it back, and treating blank as "erase it" would
  // wipe the token every time someone fixed a typo in the topic.
  const current = readNtfyConfig();
  const next: NtfyConfig = {
    ...incoming,
    token: incoming.token || current.token,
  };

  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${FILE}.tmp`;
    // 0600 from the moment it exists: this file holds a credential, and it
    // lives in the same directory the databases are backed up out of.
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, FILE);
    fs.chmodSync(FILE, 0o600);
  } catch (err) {
    console.error("[admin/ntfy] write failed:", err);
    return Response.json({ ok: false, error: "无法写入配置文件" }, { status: 500 });
  }

  return Response.json({ ok: true, config: publicView(next) });
}
