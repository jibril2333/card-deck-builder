/**
 * When the automatic refresh runs.
 *
 * Split from the manual button on purpose: the button is "refresh this, now",
 * and the schedule is "keep this fresh without me". They want different stage
 * sets — `prices` alone takes ~67 minutes, so a nightly run that includes it is
 * a nightly hour of scraping nobody asked for — and they want different
 * failure handling, so they no longer share one hardcoded plist.
 *
 * All of the arithmetic here is LOCAL time, and it is only ever evaluated on
 * the HOST. The container runs in UTC while the machine is on JST, so a "04:30"
 * computed inside the app would be six and a half hours off. `scripts/
 * refresh-tick.ts` runs this on the host and writes the resulting timestamps
 * out for the UI to display; the UI never computes them.
 */

export type RefreshFrequency = "daily" | "weekly";

export type RefreshSchedule = {
  enabled: boolean;
  frequency: RefreshFrequency;
  /** ISO weekday, 1 = Monday … 7 = Sunday. Ignored when frequency is daily. */
  weekday: number;
  hour: number;
  minute: number;
  /** Stages the automatic run passes to refresh-cards.sh; empty = all of them. */
  stages: string[];
};

/** What the pipeline did before it was configurable: Mondays at 04:30, everything. */
export const DEFAULT_SCHEDULE: RefreshSchedule = {
  enabled: true,
  frequency: "weekly",
  weekday: 1,
  hour: 4,
  minute: 30,
  stages: [],
};

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Math.trunc(n)));

/**
 * Read a stored schedule, filling in anything missing or nonsensical.
 *
 * Total rather than throwing: this file is on disk between two processes and
 * one of them is a shell script. A schedule that half-parsed and then threw
 * would stop the automatic refresh entirely, which is a worse failure than
 * running at the default time.
 */
export function parseSchedule(raw: unknown, allowedStages?: string[]): RefreshSchedule {
  const o = (raw ?? {}) as Partial<Record<keyof RefreshSchedule, unknown>>;
  const freq: RefreshFrequency = o.frequency === "daily" ? "daily" : "weekly";
  const stages = Array.isArray(o.stages)
    ? o.stages.filter(
        (s): s is string =>
          typeof s === "string" && (!allowedStages || allowedStages.includes(s)),
      )
    : DEFAULT_SCHEDULE.stages;
  return {
    enabled: typeof o.enabled === "boolean" ? o.enabled : DEFAULT_SCHEDULE.enabled,
    frequency: freq,
    weekday: Number.isFinite(o.weekday as number)
      ? clamp(o.weekday as number, 1, 7)
      : DEFAULT_SCHEDULE.weekday,
    hour: Number.isFinite(o.hour as number)
      ? clamp(o.hour as number, 0, 23)
      : DEFAULT_SCHEDULE.hour,
    minute: Number.isFinite(o.minute as number)
      ? clamp(o.minute as number, 0, 59)
      : DEFAULT_SCHEDULE.minute,
    stages: [...new Set(stages)],
  };
}

/** `Date` at today's date with the schedule's wall-clock time. */
function atTime(d: Date, s: RefreshSchedule): Date {
  const x = new Date(d);
  x.setHours(s.hour, s.minute, 0, 0);
  return x;
}

/** JS `getDay()` (0 = Sunday) for an ISO weekday (7 = Sunday). */
const jsDay = (isoWeekday: number) => isoWeekday % 7;

/**
 * The most recent scheduled instant at or before `now`, or null when disabled.
 *
 * This — not "is it 04:30 right now" — is what decides whether to run. The tick
 * fires every 15 minutes and the Mac is asleep for most of them; comparing the
 * due slot against the last one that actually ran means a laptop woken at noon
 * still performs the morning's refresh, exactly once.
 */
export function dueSlot(s: RefreshSchedule, now: Date): Date | null {
  if (!s.enabled) return null;
  const today = atTime(now, s);
  if (s.frequency === "daily") {
    if (today <= now) return today;
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday;
  }
  const back = (today.getDay() - jsDay(s.weekday) + 7) % 7;
  const candidate = new Date(today);
  candidate.setDate(candidate.getDate() - back);
  if (candidate <= now) return candidate;
  candidate.setDate(candidate.getDate() - 7);
  return candidate;
}

/** The next scheduled instant strictly after `from`, or null when disabled. */
export function nextRun(s: RefreshSchedule, from: Date): Date | null {
  const due = dueSlot(s, from);
  if (!due) return null;
  const next = new Date(due);
  next.setDate(next.getDate() + (s.frequency === "daily" ? 1 : 7));
  return next;
}

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

/** Human summary for the admin panel, e.g. "每周一 04:30". */
export function describeSchedule(s: RefreshSchedule): string {
  if (!s.enabled) return "已关闭";
  const time = `${String(s.hour).padStart(2, "0")}:${String(s.minute).padStart(2, "0")}`;
  return s.frequency === "daily"
    ? `每天 ${time}`
    : `每周${WEEKDAY_LABELS[s.weekday - 1]} ${time}`;
}
