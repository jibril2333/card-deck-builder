/**
 * 登录失败限速。
 *
 * The login form is on the public internet behind the tunnel, and a password
 * check is the one endpoint where guessing pays. bcrypt at cost 12 already
 * makes each attempt expensive (~200ms of CPU), which is a rate limit of
 * sorts — but it is a limit on the SERVER's throughput, not on the attacker's
 * patience, and it costs the NAS one core per guess.
 *
 * Two keys, both of which must pass, because they answer different questions:
 *
 *   · by email — someone working on ONE account, which is the realistic shape
 *     here: the repo is public, the deploy is named, and the account is the
 *     only one that exists.
 *   · by client address — someone spraying many addresses from one place.
 *     Read from the tunnel's forwarded header; absent that, everything shares
 *     one bucket, which is the safe direction to fail.
 *
 * State lives in this module, not in SQLite. A counter that survives a restart
 * would be worth having, but every failed guess would then be a write to the
 * user database — the file Litestream replicates and the deck pages read —
 * and a restart only happens when a deploy lands. The trade is deliberate: an
 * attacker who can time their guessing to the container's restarts gets a
 * fresh window, and that is a far smaller opening than the writes would be.
 */

/** Failures allowed inside the window before the key is locked. */
export const MAX_FAILURES = 5;
/** How long failures are remembered, and how long a lock lasts. */
export const WINDOW_MS = 15 * 60 * 1000;

export type Verdict =
  | { allowed: true }
  | { allowed: false; retryAfterMs: number };

/** Timestamps of recent failures, newest last, per key. */
export type Attempts = Map<string, number[]>;

/**
 * Would this key be allowed to try right now?
 *
 * Pure: takes the store and the clock. `attempts` is trimmed of anything that
 * has aged out, so a key that goes quiet stops occupying memory the next time
 * it is touched.
 */
export function judge(attempts: Attempts, key: string, now: number): Verdict {
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length === 0) attempts.delete(key);
  else attempts.set(key, recent);
  if (recent.length < MAX_FAILURES) return { allowed: true };
  // Locked until the oldest failure in the window ages out, so the lock
  // shortens as the failures do rather than resetting on every new attempt.
  return { allowed: false, retryAfterMs: WINDOW_MS - (now - recent[0]) };
}

/** Record one failure. */
export function fail(attempts: Attempts, key: string, now: number): void {
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  attempts.set(key, recent);
}

/** Forget a key — called when the credentials were right after all. */
export function succeed(attempts: Attempts, key: string): void {
  attempts.delete(key);
}

/** How long to wait, in the words the form shows. */
export function describeWait(retryAfterMs: number): string {
  const minutes = Math.ceil(retryAfterMs / 60_000);
  return minutes <= 1 ? "1 分钟" : `${minutes} 分钟`;
}

// ---------- The process-wide store ----------

const attempts: Attempts = new Map();

export type LoginKeys = { email: string; address: string };

/** Both keys must pass; the longer wait is the one reported. */
export function checkLogin(keys: LoginKeys, now = Date.now()): Verdict {
  const verdicts = [
    judge(attempts, `email:${keys.email.toLowerCase().trim()}`, now),
    judge(attempts, `addr:${keys.address}`, now),
  ];
  const blocked = verdicts.filter((v) => !v.allowed) as Extract<
    Verdict,
    { allowed: false }
  >[];
  if (blocked.length === 0) return { allowed: true };
  return {
    allowed: false,
    retryAfterMs: Math.max(...blocked.map((v) => v.retryAfterMs)),
  };
}

export function recordFailure(keys: LoginKeys, now = Date.now()): void {
  fail(attempts, `email:${keys.email.toLowerCase().trim()}`, now);
  fail(attempts, `addr:${keys.address}`, now);
}

export function recordSuccess(keys: LoginKeys): void {
  succeed(attempts, `email:${keys.email.toLowerCase().trim()}`);
  succeed(attempts, `addr:${keys.address}`);
}
