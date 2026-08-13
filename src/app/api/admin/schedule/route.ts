import fs from "node:fs";
import path from "node:path";
import { isAdmin } from "@/lib/auth/admin";
import { parseSchedule, type RefreshSchedule } from "@/lib/refresh-schedule";
import { REFRESH_STAGE_IDS } from "@/lib/refresh-stages";

/**
 * The automatic refresh's schedule.
 *
 * The app only writes a JSON file into the shared data volume; the host's
 * `scripts/refresh-tick.ts` reads it. Same reason the manual button drops a
 * request file instead of running anything: this container is internet-facing
 * through the tunnel and has no business editing a launchd plist or calling
 * `launchctl`.
 *
 * GET also returns the host's computed state (next run, last run). Those can't
 * be worked out here — the container is on UTC and the machine is on JST, so a
 * "04:30" evaluated in this process is six and a half hours out.
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
  return Response.json({ schedule, state });
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
    return Response.json({ ok: false, error: "无法写入排程文件" }, { status: 500 });
  }

  return Response.json({ ok: true, schedule });
}
