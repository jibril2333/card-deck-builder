import { describe, it, expect } from "vitest";
import {
  DEFAULT_SCHEDULE,
  parseSchedule,
  dueSlot,
  nextRun,
  describeSchedule,
  isKnownTimezone,
  DEFAULT_TIMEZONE,
  TIMEZONE_CHOICES,
  type RefreshSchedule,
} from "@/lib/refresh-schedule";

/** Local-time helper so the expectations read as wall clock, like the config. */
const at = (s: string) => new Date(s);

const weekly = (o: Partial<RefreshSchedule> = {}): RefreshSchedule => ({
  ...DEFAULT_SCHEDULE,
  ...o,
});

describe("parseSchedule", () => {
  it("fills in a completely empty config", () => {
    expect(parseSchedule(undefined)).toEqual(DEFAULT_SCHEDULE);
    expect(parseSchedule({})).toEqual(DEFAULT_SCHEDULE);
  });

  it("clamps out-of-range times instead of rejecting them", () => {
    // Total on purpose: a config that threw would stop the automatic refresh
    // altogether, which is worse than running at a sane hour.
    const s = parseSchedule({ hour: 99, minute: -5, weekday: 12 });
    expect(s.hour).toBe(23);
    expect(s.minute).toBe(0);
    expect(s.weekday).toBe(7);
  });

  it("keeps only known stages and drops duplicates", () => {
    const s = parseSchedule(
      { stages: ["cards", "cards", "nonsense", "text"] },
      ["cards", "text", "art"],
    );
    expect(s.stages).toEqual(["cards", "text"]);
  });

  it("treats any frequency but daily as weekly", () => {
    expect(parseSchedule({ frequency: "daily" }).frequency).toBe("daily");
    expect(parseSchedule({ frequency: "hourly" }).frequency).toBe("weekly");
  });
});

describe("dueSlot", () => {
  it("returns nothing while the schedule is off", () => {
    expect(
      dueSlot(weekly({ enabled: false }), at("2026-08-14T12:00")),
    ).toBeNull();
  });

  it("weekly: finds this week's slot once it has passed", () => {
    // 2026-08-10 is a Monday. Monday 04:30, asked at Monday noon.
    const got = dueSlot(weekly(), at("2026-08-10T12:00"));
    expect(got).toEqual(at("2026-08-10T04:30"));
  });

  it("weekly: before the slot, the answer is LAST week's", () => {
    const got = dueSlot(weekly(), at("2026-08-10T04:29"));
    expect(got).toEqual(at("2026-08-03T04:30"));
  });

  it("weekly: mid-week points back at Monday", () => {
    expect(dueSlot(weekly(), at("2026-08-13T23:00"))).toEqual(
      at("2026-08-10T04:30"),
    );
  });

  it("weekly: Sunday is weekday 7, not 0", () => {
    // 2026-08-16 is a Sunday.
    const s = weekly({ weekday: 7 });
    expect(dueSlot(s, at("2026-08-16T09:00"))).toEqual(at("2026-08-16T04:30"));
    expect(dueSlot(s, at("2026-08-16T04:00"))).toEqual(at("2026-08-09T04:30"));
  });

  it("daily: today's slot, or yesterday's before it", () => {
    const s = weekly({ frequency: "daily" });
    expect(dueSlot(s, at("2026-08-14T06:00"))).toEqual(at("2026-08-14T04:30"));
    expect(dueSlot(s, at("2026-08-14T01:00"))).toEqual(at("2026-08-13T04:30"));
  });

  it("is exactly-once across a long sleep", () => {
    // The Mac was off from Sunday to Thursday. The tick that finally runs sees
    // Monday's slot as due; a second tick an hour later sees the SAME slot, so
    // comparing against what already ran keeps it to one refresh.
    const s = weekly();
    const a = dueSlot(s, at("2026-08-13T14:00"));
    const b = dueSlot(s, at("2026-08-13T15:00"));
    expect(a).toEqual(b);
  });
});

describe("nextRun", () => {
  it("weekly advances by seven days", () => {
    expect(nextRun(weekly(), at("2026-08-10T12:00"))).toEqual(
      at("2026-08-17T04:30"),
    );
  });

  it("daily advances by one", () => {
    const s = weekly({ frequency: "daily" });
    expect(nextRun(s, at("2026-08-14T06:00"))).toEqual(at("2026-08-15T04:30"));
  });

  it("is null while off", () => {
    expect(
      nextRun(weekly({ enabled: false }), at("2026-08-14T06:00")),
    ).toBeNull();
  });

  it("is always in the future", () => {
    const s = weekly();
    for (const t of [
      "2026-08-10T04:29",
      "2026-08-10T04:30",
      "2026-08-10T04:31",
    ]) {
      expect(nextRun(s, at(t))!.getTime()).toBeGreaterThan(at(t).getTime());
    }
  });
});

describe("describeSchedule", () => {
  it("says what it does", () => {
    expect(describeSchedule(weekly())).toBe("每周一 04:30");
    expect(describeSchedule(weekly({ weekday: 7, hour: 9, minute: 5 }))).toBe(
      "每周日 09:05",
    );
    expect(describeSchedule(weekly({ frequency: "daily" }))).toBe("每天 04:30");
    expect(describeSchedule(weekly({ enabled: false }))).toBe("已关闭");
  });
});

/**
 * The zone the schedule is written in.
 *
 * The daemon runs in a container, and a container is on UTC unless TZ says
 * otherwise — a schedule typed as 04:00 fired at 13:30 JST. Carrying the zone
 * in the schedule makes it mean what it says on any machine, and lets someone
 * schedule in a zone that isn't the server's at all.
 */
describe("timezones", () => {
  const daily = (tz: string, hour = 4): RefreshSchedule => ({
    ...DEFAULT_SCHEDULE,
    frequency: "daily",
    hour,
    minute: 0,
    timezone: tz,
  });

  it("fires at the wall-clock time OF ITS ZONE", () => {
    // 04:00 in Tokyo is 19:00 UTC the day before.
    const next = nextRun(
      daily("Asia/Tokyo"),
      new Date("2026-08-27T06:00:00Z"),
    )!;
    expect(next.toISOString()).toBe("2026-08-27T19:00:00.000Z");
    // The same schedule written in UTC is a different instant.
    const utc = nextRun(daily("UTC"), new Date("2026-08-27T06:00:00Z"))!;
    expect(utc.toISOString()).toBe("2026-08-28T04:00:00.000Z");
  });

  it("keeps the wall time across a DST change", () => {
    // US DST ends 2026-11-01. A 04:00 schedule stays 04:00 local on both
    // sides of it — 08:00Z before, 09:00Z after — rather than drifting.
    const tz = "America/New_York";
    const before = nextRun(daily(tz), new Date("2026-10-30T12:00:00Z"))!;
    expect(before.toISOString()).toBe("2026-10-31T08:00:00.000Z");
    const after = nextRun(daily(tz), new Date("2026-11-02T12:00:00Z"))!;
    expect(after.toISOString()).toBe("2026-11-03T09:00:00.000Z");
  });

  it("picks the right weekday in the schedule's zone, not the machine's", () => {
    // 2026-08-27T15:00Z is still Thursday in UTC but already Friday in Tokyo.
    const friday: RefreshSchedule = {
      ...DEFAULT_SCHEDULE,
      frequency: "weekly",
      weekday: 5,
      hour: 9,
      minute: 0,
      timezone: "Asia/Tokyo",
    };
    const due = dueSlot(friday, new Date("2026-08-28T01:00:00Z"))!;
    // Friday 09:00 JST = Friday 00:00Z.
    expect(due.toISOString()).toBe("2026-08-28T00:00:00.000Z");
  });

  it("falls back to the default zone rather than to the machine's", () => {
    // A schedule from before this field existed, or with nonsense in it, is
    // read as Japan — not as "whatever the container thinks local time is",
    // which is UTC and was the bug.
    for (const raw of [{}, { timezone: "Mars/Olympus" }, { timezone: 42 }]) {
      expect(parseSchedule(raw).timezone).toBe(DEFAULT_TIMEZONE);
    }
    expect(parseSchedule({ timezone: "UTC" }).timezone).toBe("UTC");
  });

  it("every zone the panel offers is one Intl accepts", () => {
    for (const z of TIMEZONE_CHOICES) {
      expect(isKnownTimezone(z.id), z.id).toBe(true);
      expect(z.label.length, z.id).toBeGreaterThan(0);
    }
  });
});
