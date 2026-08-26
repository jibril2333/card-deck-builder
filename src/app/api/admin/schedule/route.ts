import fs from "node:fs";
import path from "node:path";
import { isAdmin } from "@/lib/auth/admin";
import { parseSchedule, type RefreshSchedule } from "@/lib/refresh-schedule";
import { REFRESH_STAGE_IDS } from "@/lib/refresh-stages";

/**
 * The automatic refresh's schedule.
 *
 * The app only writes a JSON file into the shared data volume; the clock that
 * reads it is `scripts/refresh-daemon.ts`, running beside the server in this
 * same container. Same reason the manual button drops a request file instead
 * of running anything itself: a route handler is not a scheduler, and the
 * refresh takes an hour.
 *
 * GET also returns the state the CLOCK computed (next run, last run) rather
 * than working it out here: whichever process owns the schedule is the one
 * whose local time "04:30" means, and it isn't necessarily this one.
 *
 * It also returns that process's time zone, because the panel is asking someone
 * to type a time and the answer is meaningless without it. In the container
 * that zone is whatever `TZ` says (compose sets it; unset would mean UTC).
 */
export const dynamic = "force-dynamic";

const DATA_DIR =
  process.env.CDB_DATA_DIR ?? path.join(process.cwd(), "data.nosync");
const SCHEDULE_FILE = path.join(DATA_DIR, "refresh-schedule.json");
const STATE_FILE = path.join(DATA_DIR, "refresh-schedule-state.json");

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

export async function GET() {
  if (!(await isAdmin())) return new Response("forbidden", { status: 403 });
  const schedule = parseSchedule(readJson(SCHEDULE_FILE), REFRESH_STAGE_IDS);
  const state = (readJson(STATE_FILE) ?? {}) as {
    describe?: string;
    nextRunAt?: string | null;
    lastSlot?: string;
    lastStartedAt?: string;
    checkedAt?: string;
  };
  return Response.json({
    schedule,
    state,
    // Both daemons run in this container, so this process's zone IS the
    // schedule's zone. On the Mac deployment the host clock owns it, and the
    // two are the same machine anyway.
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
}

export async function PUT(req: Request) {
  if (!(await isAdmin())) return new Response("forbidden", { status: 403 });

  let schedule: RefreshSchedule;
  try {
    // Parsed through the same validator the host uses, so what gets written is
    // already clamped — the tick should never be the first thing to discover
    // that hour 99 doesn't exist.
    schedule = parseSchedule(await req.json(), REFRESH_STAGE_IDS);
  } catch {
    return Response.json({ ok: false, error: "请求格式不对" }, { status: 400 });
  }

  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    // Atomic: the host reads this file every 15 minutes, and a half-written one
    // is exactly the "present but unparseable" case that stops it running.
    const tmp = `${SCHEDULE_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(schedule, null, 2));
    fs.renameSync(tmp, SCHEDULE_FILE);
  } catch (err) {
    console.error("[admin/schedule] write failed:", err);
    return Response.json(
      { ok: false, error: "无法写入排程文件" },
      { status: 500 },
    );
  }

  return Response.json({ ok: true, schedule });
}
