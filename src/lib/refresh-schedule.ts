/**
 * When the automatic refresh runs.
 *
 * Split from the manual button on purpose: the button is "refresh this, now",
 * and the schedule is "keep this fresh without me". They want different stage
 * sets — `prices` alone takes ~67 minutes, so a nightly run that includes it is
 * a nightly hour of scraping nobody asked for — and they want different
 * failure handling, so they no longer share one hardcoded plist.
 *
 * All of the arithmetic here is LOCAL time — `setHours` on a Date — so "04:30"
 * means 04:30 wherever this code is evaluated. That is the HOST on the macOS
 * deployment — the CONTAINER, in scripts/refresh-daemon.ts. A container's
 * local time is UTC unless
 * something sets TZ. Both compose files therefore set `TZ` (default
 * Asia/Tokyo), and the settings panel prints the zone it is scheduling in
 * next to the time — a schedule that silently means something else is worse
 * than one that says so.
 */

type RefreshFrequency = "daily" | "weekly";

export type RefreshSchedule = {
  enabled: boolean;
  frequency: RefreshFrequency;
  /** ISO weekday, 1 = Monday … 7 = Sunday. Ignored when frequency is daily. */
  weekday: number;
  hour: number;
  minute: number;
  /** IANA zone the hour/minute are in. Never empty — see DEFAULT_TIMEZONE. */
  timezone: string;
  /** Stages the automatic run passes to the daemon; empty = all of them. */
  stages: string[];
};

/**
 * Where the person reading the schedule lives. A schedule with no zone would
 * mean "wherever the daemon happens to run", which is UTC in a container and
 * is exactly the surprise this field exists to remove.
 */
export const DEFAULT_TIMEZONE = "Asia/Tokyo";

/** The zones the panel offers, in the order it offers them. */
export const TIMEZONE_CHOICES: { id: string; label: string }[] = [
  { id: "Asia/Tokyo", label: "日本" },
  { id: "Asia/Shanghai", label: "中国" },
  { id: "Asia/Taipei", label: "台北" },
  { id: "Asia/Seoul", label: "首尔" },
  { id: "Asia/Singapore", label: "新加坡" },
  { id: "Europe/London", label: "伦敦" },
  { id: "Europe/Paris", label: "巴黎" },
  { id: "America/New_York", label: "纽约" },
  { id: "America/Los_Angeles", label: "洛杉矶" },
  { id: "UTC", label: "UTC" },
];

/** What the pipeline did before it was configurable: Mondays at 04:30, everything. */
export const DEFAULT_SCHEDULE: RefreshSchedule = {
  enabled: true,
  frequency: "weekly",
  weekday: 1,
  hour: 4,
  minute: 30,
  timezone: DEFAULT_TIMEZONE,
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
export function parseSchedule(
  raw: unknown,
  allowedStages?: string[],
): RefreshSchedule {
  const o = (raw ?? {}) as Partial<Record<keyof RefreshSchedule, unknown>>;
  const freq: RefreshFrequency = o.frequency === "daily" ? "daily" : "weekly";
  const stages = Array.isArray(o.stages)
    ? o.stages.filter(
        (s): s is string =>
          typeof s === "string" &&
          (!allowedStages || allowedStages.includes(s)),
      )
    : DEFAULT_SCHEDULE.stages;
  return {
    enabled:
      typeof o.enabled === "boolean" ? o.enabled : DEFAULT_SCHEDULE.enabled,
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
    // An unknown zone would throw on every tick deep inside Intl. A schedule
    // written before this field existed gets the default rather than the
    // container's idea of local time, which was the bug.
    timezone:
      typeof o.timezone === "string" && isKnownTimezone(o.timezone)
        ? o.timezone
        : DEFAULT_TIMEZONE,
    stages: [...new Set(stages)],
  };
}

/** True if `tz` is a zone this runtime knows. Anything else is refused. */
export function isKnownTimezone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The zone a schedule is written in. */
function zoneOf(s: RefreshSchedule): string {
  return s.timezone || DEFAULT_TIMEZONE;
}

type Wall = { y: number; mo: number; d: number; weekday: number };

const partsOf = (date: Date, tz: string) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;

const ISO_WEEKDAY: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

/** What day it is in `tz` at this instant. */
function wallDate(date: Date, tz: string): Wall {
  const p = partsOf(date, tz);
  return {
    y: Number(p.year),
    mo: Number(p.month),
    d: Number(p.day),
    weekday: ISO_WEEKDAY[p.weekday] ?? 1,
  };
}

/** How far `tz` is from UTC at this instant, in ms. */
function offsetMs(date: Date, tz: string): number {
  const p = partsOf(date, tz);
  // `hour` is 00–23 here, except that some runtimes render midnight as 24.
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) % 24,
    Number(p.minute),
    Number(p.second),
  );
  return asUtc - date.getTime();
}

/**
 * The instant when `tz`'s clocks read this wall time.
 *
 * Two passes: guess by treating the wall time as UTC and subtracting the
 * offset, then re-read the offset AT that instant — which is what makes the
 * hour after a DST change land on the right side of it.
 */
function instantOf(
  w: { y: number; mo: number; d: number },
  hour: number,
  minute: number,
  tz: string,
): Date {
  const guess = Date.UTC(w.y, w.mo - 1, w.d, hour, minute, 0, 0);
  const first = guess - offsetMs(new Date(guess), tz);
  const second = guess - offsetMs(new Date(first), tz);
  return new Date(second);
}

/** Calendar arithmetic on the wall date, never on the instant. */
function shiftDays(w: Wall, days: number): Wall {
  const t = new Date(Date.UTC(w.y, w.mo - 1, w.d) + days * 86_400_000);
  return {
    y: t.getUTCFullYear(),
    mo: t.getUTCMonth() + 1,
    d: t.getUTCDate(),
    weekday: ((t.getUTCDay() + 6) % 7) + 1,
  };
}

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
  const tz = zoneOf(s);
  const at = (w: Wall) => instantOf(w, s.hour, s.minute, tz);
  const today = wallDate(now, tz);

  if (s.frequency === "daily") {
    const t = at(today);
    return t <= now ? t : at(shiftDays(today, -1));
  }
  const back = (today.weekday - s.weekday + 7) % 7;
  const candidate = shiftDays(today, -back);
  const t = at(candidate);
  return t <= now ? t : at(shiftDays(candidate, -7));
}

/** The next scheduled instant strictly after `from`, or null when disabled. */
export function nextRun(s: RefreshSchedule, from: Date): Date | null {
  const due = dueSlot(s, from);
  if (!due) return null;
  const tz = zoneOf(s);
  // A day later on the CALENDAR, not 86,400,000 ms later: across a DST change
  // those differ by an hour, and the schedule means the wall clock.
  return instantOf(
    shiftDays(wallDate(due, tz), s.frequency === "daily" ? 1 : 7),
    s.hour,
    s.minute,
    tz,
  );
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
