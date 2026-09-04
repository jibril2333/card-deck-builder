/**
 * 登录失败限速的判定。
 *
 * The login form is the one public endpoint where guessing pays, and bcrypt's
 * cost is a limit on the server's throughput rather than on the attacker's
 * patience. These fix the policy: how many failures, for how long, and what
 * resets it.
 */
import { describe, expect, it } from "vitest";
import {
  MAX_FAILURES,
  WINDOW_MS,
  describeWait,
  fail,
  judge,
  succeed,
  type Attempts,
} from "@/lib/auth/throttle";

const store = (): Attempts => new Map();
const t0 = Date.parse("2026-09-04T12:00:00Z");

describe("judge", () => {
  it("allows a key it has never seen", () => {
    expect(judge(store(), "email:a@b.c", t0)).toEqual({ allowed: true });
  });

  it("allows up to the limit, then locks", () => {
    const s = store();
    for (let i = 0; i < MAX_FAILURES - 1; i++) fail(s, "k", t0);
    expect(judge(s, "k", t0)).toEqual({ allowed: true });
    fail(s, "k", t0);
    expect(judge(s, "k", t0).allowed).toBe(false);
  });

  it("counts the wait from the OLDEST failure, so the lock shortens", () => {
    // A lock that restarted on every attempt would never expire for someone
    // still trying.
    const s = store();
    for (let i = 0; i < MAX_FAILURES; i++) fail(s, "k", t0 + i * 1000);
    const v = judge(s, "k", t0 + 60_000);
    expect(v).toEqual({ allowed: false, retryAfterMs: WINDOW_MS - 60_000 });
    const later = judge(s, "k", t0 + WINDOW_MS - 1);
    expect(later.allowed).toBe(false);
    expect(judge(s, "k", t0 + WINDOW_MS).allowed).toBe(true);
  });

  it("forgets failures that aged out of the window", () => {
    const s = store();
    for (let i = 0; i < MAX_FAILURES; i++) fail(s, "k", t0);
    expect(judge(s, "k", t0 + WINDOW_MS + 1)).toEqual({ allowed: true });
    // …and stops occupying memory once it goes quiet.
    expect(s.has("k")).toBe(false);
  });

  it("slides rather than resetting wholesale", () => {
    const s = store();
    // Four failures at the start of the window, one much later.
    for (let i = 0; i < MAX_FAILURES - 1; i++) fail(s, "k", t0);
    fail(s, "k", t0 + WINDOW_MS - 1000);
    expect(judge(s, "k", t0 + WINDOW_MS - 999).allowed).toBe(false);
    // The first four age out; the fifth alone is not enough to hold the lock.
    expect(judge(s, "k", t0 + WINDOW_MS + 1).allowed).toBe(true);
  });

  it("keeps keys apart", () => {
    const s = store();
    for (let i = 0; i < MAX_FAILURES; i++) fail(s, "email:a@b.c", t0);
    expect(judge(s, "email:a@b.c", t0).allowed).toBe(false);
    expect(judge(s, "addr:1.2.3.4", t0).allowed).toBe(true);
  });
});

describe("succeed", () => {
  it("clears the count, so a right password ends the streak", () => {
    const s = store();
    for (let i = 0; i < MAX_FAILURES - 1; i++) fail(s, "k", t0);
    succeed(s, "k");
    for (let i = 0; i < MAX_FAILURES - 1; i++) fail(s, "k", t0);
    expect(judge(s, "k", t0).allowed).toBe(true);
  });
});

describe("describeWait", () => {
  it("rounds up to whole minutes", () => {
    expect(describeWait(1)).toBe("1 分钟");
    expect(describeWait(60_000)).toBe("1 分钟");
    expect(describeWait(61_000)).toBe("2 分钟");
    expect(describeWait(WINDOW_MS)).toBe("15 分钟");
  });
});
