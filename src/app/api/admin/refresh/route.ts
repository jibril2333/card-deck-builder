import fs from "node:fs";
import path from "node:path";
import { isAdmin } from "@/lib/auth/admin";
import { REFRESH_STAGE_IDS } from "@/lib/refresh-stages";

/**
 * Admin endpoint behind the "更新卡牌数据" button.
 *
 * GET  → current refresh status (for polling)
 * POST → request a refresh
 *
 * The container deliberately has NO access to the Docker socket: it is
 * internet-facing through the tunnel, and a refresh has to stop/start the
 * container itself, so app-level RCE would otherwise mean host compromise.
 * POST therefore only drops a request file into the shared data volume. What
 * picks it up depends on where this is deployed, and the app deliberately
 * doesn't know which:
 *   · on the Mac, a launchd WatchPaths agent (com.rei.cdb-refresh-watch →
 *     the daemon), because a swap would need to stop the
 *     container and only the host can do that;
 *   · in the image, scripts/refresh-daemon.ts inside this very container,
 *     which is what makes a pulled image self-sufficient.
 * Either way this route writes a file and returns. See AGENTS.md.
 */
export const dynamic = "force-dynamic";

const DATA_DIR =
  process.env.CDB_DATA_DIR ?? path.join(process.cwd(), "data.nosync");
const STATUS_FILE = path.join(DATA_DIR, "refresh-status.json");
const REQUEST_FILE = path.join(DATA_DIR, "refresh-request");
const LOCK_DIR = path.join(DATA_DIR, ".refresh.lock");

/** Single source shared with the admin panel; kept in step with the shell
 *  script by tests/refresh-stages.test.ts. */
const STAGES = REFRESH_STAGE_IDS;

type Status = {
  state: "idle" | "running" | "ok" | "failed";
  message?: string;
  stages?: string;
  startedAt?: string;
  updatedAt?: string;
};

function readStatus(): Status {
  try {
    const raw = fs.readFileSync(STATUS_FILE, "utf8");
    return JSON.parse(raw) as Status;
  } catch {
    return { state: "idle" };
  }
}

export async function GET() {
  if (!(await isAdmin())) return new Response("forbidden", { status: 403 });
  const status = readStatus();
  // The status file records how the LAST run ended; the lock is what says a
  // run is happening right now. Without this a crashed run would leave the
  // button greyed out as "running" forever.
  const running = fs.existsSync(LOCK_DIR) || fs.existsSync(REQUEST_FILE);
  return Response.json({
    ...status,
    state: running ? "running" : status.state === "running" ? "failed" : status.state,
    running,
  });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return new Response("forbidden", { status: 403 });

  if (fs.existsSync(LOCK_DIR) || fs.existsSync(REQUEST_FILE)) {
    return Response.json(
      { ok: false, error: "刷新已在进行中" },
      { status: 409 },
    );
  }

  let stages: string[] = [];
  try {
    const body = (await req.json()) as { stages?: unknown };
    if (Array.isArray(body.stages)) {
      stages = body.stages.filter(
        (s): s is string => typeof s === "string" && STAGES.includes(s),
      );
    }
  } catch {
    // No body = full refresh.
  }

  try {
    // The host script re-validates every stage name; this is defence in depth,
    // not the only check.
    fs.writeFileSync(REQUEST_FILE, stages.join(" "), "utf8");
  } catch (err) {
    console.error("[admin/refresh] could not write request file:", err);
    return Response.json({ ok: false, error: "无法写入请求文件" }, { status: 500 });
  }

  return Response.json({ ok: true, stages: stages.length ? stages : STAGES });
}
