/**
 * Is each scrape source still returning what it used to?
 *
 * A scraper fails loudly when the site is down and the daemon says so. The
 * case this file exists for is the quiet one: the page still returns 200, the
 * script still exits 0, and the selector it was written against now matches
 * nothing. The run "succeeds" with 12 rows instead of 4,400 and the only
 * evidence is a number in a log nobody reads.
 *
 * So every source records how much it got, each run, and is judged against
 * what it got recently:
 *
 *   dead — nothing at all, when it used to return something
 *   warn — under 70% of its own recent best
 *   ok   — everything else
 *
 * The baseline is the BEST of the last few runs, not the last one: judging
 * against the previous run lets a source decay a little every day and never
 * trip, and a single bad run would move the goalposts for the next.
 *
 * Notifications fire on a CHANGE of level, not on every bad run — including
 * the recovery. A source that is dead for a week should say so once, the way
 * the refresh notification stays quiet on a week with no changes.
 */

import fs from "node:fs";
import path from "node:path";

export type Level = "ok" | "warn" | "dead";

export type SourceState = {
  /** Row counts from the last few runs, newest last. */
  history: number[];
  level: Level;
  /** The level before the most recent run — what makes a change detectable
   *  from another process. The scripts record; the notifier reads. */
  prev: Level | null;
  /** ISO timestamp of the most recent run. */
  at: string;
};

export type SourceHealth = {
  source: string;
  /** What this run got. */
  ok: number;
  /** The best of the runs before it — what "normal" looks like. */
  baseline: number;
  level: Level;
  /** The level before this run, when there was one. */
  was: Level | null;
};

/** How many runs of history to keep per source. */
const HISTORY = 5;

/** Under this share of the baseline, a source is suspect. */
export const DROP_RATIO = 0.7;

const FILE = "scrape-health.json";

function dataDir(): string {
  return process.env.CDB_DATA_DIR ?? path.join(process.cwd(), "data.nosync");
}

function file(): string {
  return path.join(dataDir(), FILE);
}

export function judge(ok: number, baseline: number): Level {
  // A source with no history yet is fine by definition — there is nothing to
  // compare it against, and calling a first run "dead" would train the alarm
  // to be ignored.
  if (baseline <= 0) return "ok";
  if (ok <= 0) return "dead";
  return ok < baseline * DROP_RATIO ? "warn" : "ok";
}

export function readStates(): Record<string, SourceState> {
  try {
    const raw = JSON.parse(fs.readFileSync(file(), "utf8")) as unknown;
    if (!raw || typeof raw !== "object") return {};
    return raw as Record<string, SourceState>;
  } catch {
    return {};
  }
}

function writeStates(states: Record<string, SourceState>): void {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(states, null, 2));
}

/**
 * Record one source's result and return how it looks.
 *
 * Called at the end of a scrape script with the number that matters for that
 * source — cards written, cards priced, rulings found. Which number it is
 * doesn't matter as long as the same one is passed every run: this compares a
 * source against itself, never against another source.
 */
export function recordSourceRun(source: string, ok: number): SourceHealth {
  const states = readStates();
  const prev = states[source];
  const history = prev?.history ?? [];
  const baseline = history.length ? Math.max(...history) : 0;
  const level = judge(ok, baseline);
  states[source] = {
    history: [...history, ok].slice(-HISTORY),
    level,
    prev: prev?.level ?? null,
    at: new Date().toISOString(),
  };
  writeStates(states);
  return { source, ok, baseline, level, was: prev?.level ?? null };
}

/**
 * Every source's current standing, worst first.
 *
 * Read by the admin panel and by the notifier — which runs in its own process
 * after every script has finished, and gets `was` from the stored `prev`
 * rather than from the record call it never saw.
 */
export function healthReport(): SourceHealth[] {
  const order: Record<Level, number> = { dead: 0, warn: 1, ok: 2 };
  return Object.entries(readStates())
    .map(([source, s]) => {
      const before = s.history.slice(0, -1);
      return {
        source,
        ok: s.history[s.history.length - 1] ?? 0,
        baseline: before.length ? Math.max(...before) : 0,
        level: s.level,
        was: s.prev ?? null,
      };
    })
    .sort(
      (a, b) =>
        order[a.level] - order[b.level] || a.source.localeCompare(b.source),
    );
}

/**
 * The line for one source in a notification: what it got, against what it
 * used to get.
 */
export function describeHealth(h: SourceHealth): string {
  const mark = h.level === "dead" ? "✗" : h.level === "warn" ? "!" : "✓";
  if (h.level === "ok" && h.was !== null && h.was !== "ok") {
    return `${mark} ${h.source} ${h.ok} — 恢复了`;
  }
  if (h.level === "dead") return `${mark} ${h.source} 0(过去 ${h.baseline})`;
  if (h.level === "warn") {
    const pct = Math.round((h.ok / h.baseline) * 100);
    return `${mark} ${h.source} ${h.ok}(过去 ${h.baseline},${pct}%)`;
  }
  return `${mark} ${h.source} ${h.ok}`;
}

/**
 * What to push, given this run's results. Null when no source changed level —
 * which is every ordinary run.
 */
export function buildHealthNotification(
  results: SourceHealth[],
  opts: { adminUrl: string },
): {
  title: string;
  body: string;
  priority: number;
  tags: string[];
  click: string;
} | null {
  const changed = results.filter((h) => h.was !== null && h.level !== h.was);
  if (changed.length === 0) return null;

  const bad = changed.filter((h) => h.level !== "ok");
  const recovered = changed.filter((h) => h.level === "ok");
  const lines = [...bad, ...recovered].map(describeHealth);
  if (bad.length > 0) {
    // The point that isn't obvious from the numbers: nothing crashed, so
    // nothing else is going to tell you.
    lines.push("抓取没有报错,是结果变少了 —— 多半是对方页面改版。");
  }

  const dead = bad.filter((h) => h.level === "dead").length;
  return {
    title:
      bad.length === 0
        ? "抓取来源恢复"
        : dead > 0
          ? `抓取来源没有结果 · ${bad.length}`
          : `抓取来源结果变少 · ${bad.length}`,
    body: lines.join("\n"),
    priority: bad.length === 0 ? 3 : dead > 0 ? 5 : 4,
    tags: bad.length === 0 ? ["card_index"] : ["warning"],
    click: opts.adminUrl,
  };
}
