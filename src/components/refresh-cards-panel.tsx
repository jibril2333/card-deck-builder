"use client";

import { useEffect, useState } from "react";
import { REFRESH_STAGES, scriptLabel } from "@/lib/refresh-stages";

type Status = {
  state: "idle" | "running" | "ok" | "failed" | "paused";
  message?: string;
  stages?: string;
  startedAt?: string;
  updatedAt?: string;
  running?: boolean;
  /** Every script walking a list right now — the price stage runs two. */
  progress?: {
    script: string;
    done: number;
    total: number;
    note?: string;
  }[];
  /** Per-source yield, worst first — see lib/scrape-health. */
  health?: {
    source: string;
    ok: number;
    baseline: number;
    level: "ok" | "warn" | "dead";
  }[];
};

const STAGE_LABELS = REFRESH_STAGES;

/**
 * Where the run is: which stage of how many, and — for the scrapes that walk
 * every card — how far into that list.
 *
 * The stage count comes from the status file's own fields (`stages` is what
 * was asked for, `message` is the stage running now), so nothing new had to be
 * recorded for it. The inner count is the scrapers reporting themselves; see
 * lib/refresh-progress.
 */
function RunProgress({ status }: { status: Status | null }) {
  if (!status) return null;
  const stages = (status.stages ?? "").split(" ").filter(Boolean);
  const current = stages.indexOf(status.message ?? "");
  const stage = REFRESH_STAGES.find((s) => s.id === status.message);
  const rows = (status.progress ?? []).filter((p) => p.total > 0);
  // Two scrapes running side by side are two thirds of one stage each; the
  // stage is done when both are, so its share is their average.
  const inner =
    rows.length > 0
      ? rows.reduce((s, p) => s + p.done / p.total, 0) / rows.length
      : null;

  // Stage k of n, with the current stage's own share filled in when known.
  const done = current >= 0 ? current : 0;
  const pct =
    stages.length > 0
      ? ((done + (inner ?? 0)) / stages.length) * 100
      : (inner ?? 0) * 100;

  return (
    <div className="space-y-1">
      <div className="h-1.5 rounded-full bg-[var(--color-muted)] overflow-hidden">
        <div
          className="h-full bg-[var(--color-accent)] transition-[width] duration-500"
          style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
        />
      </div>
      <div className="flex items-baseline justify-between gap-2 text-xs text-[var(--color-muted-fg)]">
        <span>
          {stages.length > 0 && current >= 0
            ? `第 ${current + 1} / ${stages.length} 项`
            : "准备中"}
          {stage ? ` · ${stage.label}` : ""}
        </span>
        {/* One line per script: 中/日文 runs three in turn, 价格与读音 runs
            its two at the same time, and a single count could not say which
            you were looking at. */}
        <span className="flex flex-col items-end gap-0.5">
          {rows.map((p) => (
            <span key={p.script} className="tabular-nums">
              {scriptLabel(p.script) ? `${scriptLabel(p.script)} · ` : ""}
              {p.done.toLocaleString()} / {p.total.toLocaleString()}
              {p.note ? ` · ${p.note}` : ""}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

function fmt(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("zh-CN", { hour12: false });
}

/**
 * Admin-only card-data refresh control.
 *
 * Clicking doesn't run anything in this process: it POSTs a request, and
 * whatever is watching the data directory picks it up — a launchd agent on the
 * Mac, the in-container daemon in the published image (the container has no
 * Docker access on purpose, either way). So the UI polls for status rather
 * than awaiting a result.
 */
export function RefreshCardsPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // One effect owns both the initial read and the polling. A run is driven by
  // a host-side agent, so the only way to see progress is to ask: poll quickly
  // while something is in flight, slowly when idle.
  const running = !!status?.running;
  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const r = await fetch("/api/admin/refresh", { cache: "no-store" });
        if (!r.ok || cancelled) return;
        const next = (await r.json()) as Status;
        if (!cancelled) setStatus(next);
      } catch {
        // Transient fetch failure — keep the last known status on screen.
      }
    }
    void tick();
    const t = setInterval(tick, running ? 3000 : 30000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [running]);

  async function start() {
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stages: selected }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? `请求失败（${r.status}）`);
      } else {
        setStatus((s) => ({
          ...(s ?? { state: "running" }),
          state: "running",
          running: true,
        }));
      }
    } catch {
      setError("网络错误");
    } finally {
      setSubmitting(false);
    }
  }

  const toggle = (id: string) =>
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
    );

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">手动更新</h2>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STAGE_LABELS.map((s) => {
          const on = selected.includes(s.id);
          return (
            <button
              key={s.id}
              type="button"
              disabled={running}
              onClick={() => toggle(s.id)}
              title={s.hint}
              className={`text-xs px-2.5 py-1 rounded-md border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                on
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-fg)]"
                  : "border-[var(--color-border)] hover:border-[var(--color-fg)]"
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={start}
          disabled={running || submitting}
          className="text-sm px-3 py-1.5 rounded-md bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
        >
          {running ? "更新中…" : submitting ? "提交中…" : "立即更新"}
        </button>
        {status ? (
          <span className="text-xs text-[var(--color-muted-fg)]">
            <StateBadge state={status.state} />
            {/* The stage id would just repeat what the bar below already says
                in words, so it is only shown when there is no bar. */}
            {status.message && !running ? ` ${status.message}` : ""}
            {status.updatedAt ? ` · ${fmt(status.updatedAt)}` : ""}
          </span>
        ) : null}
      </div>

      {running ? <RunProgress status={status} /> : null}
      <SourceHealth status={status} />
      {running ? (
        <p className="text-xs text-[var(--color-muted-fg)]">
          更新期间站点会短暂重启
        </p>
      ) : null}
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
    </div>
  );
}

/**
 * The sources that came back with less than they used to.
 *
 * Only the bad ones, and nothing at all when every source is healthy: a green
 * list of seven scrapers is the kind of panel people stop reading, and then
 * stop noticing when a row turns red.
 */
function SourceHealth({ status }: { status: Status | null }) {
  const bad = (status?.health ?? []).filter((h) => h.level !== "ok");
  if (bad.length === 0) return null;
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5 space-y-1">
      <div className="text-xs font-medium text-amber-600 dark:text-amber-400">
        抓取来源结果变少
      </div>
      {bad.map((h) => (
        <div
          key={h.source}
          className="flex items-baseline justify-between gap-3 text-xs"
        >
          <span>{h.source}</span>
          <span className="tabular-nums text-[var(--color-muted-fg)]">
            {h.ok} / 过去 {h.baseline}
          </span>
        </div>
      ))}
      <p className="text-[11px] text-[var(--color-muted-fg)]">
        抓取没有报错,是结果变少了 —— 多半是对方页面改版。
      </p>
    </div>
  );
}

function StateBadge({ state }: { state: Status["state"] }) {
  const map: Record<Status["state"], { text: string; cls: string }> = {
    idle: { text: "未运行", cls: "text-[var(--color-muted-fg)]" },
    running: { text: "运行中", cls: "text-[var(--color-accent)]" },
    ok: { text: "成功", cls: "text-emerald-500" },
    failed: { text: "失败", cls: "text-red-500" },
    // Stopped by a container replacement, not by an error. The remaining
    // stages run by themselves when the new container starts.
    paused: { text: "已暂停,重启后继续", cls: "text-amber-500" },
  };
  const s = map[state] ?? map.idle;
  return <span className={`font-medium ${s.cls}`}>{s.text}</span>;
}
