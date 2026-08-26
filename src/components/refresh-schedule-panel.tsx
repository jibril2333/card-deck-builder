"use client";

import { useEffect, useState } from "react";
import { REFRESH_STAGES } from "@/lib/refresh-stages";
import { DEFAULT_SCHEDULE, type RefreshSchedule } from "@/lib/refresh-schedule";

type State = {
  describe?: string;
  nextRunAt?: string | null;
  lastSlot?: string;
  lastStartedAt?: string;
  checkedAt?: string;
};

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

function fmt(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("zh-CN", { hour12: false });
}

/**
 * Settings for the AUTOMATIC refresh, kept apart from the manual button above
 * it on purpose. The two do the same pipeline for different reasons: the button
 * is "refresh this, now", the schedule is "keep it fresh without me". Most
 * usefully they can pick different stages — `prices` alone is ~67 minutes, so
 * it belongs in a weekly run rather than a nightly one, or in neither.
 *
 * Everything here is host local time. The container runs on UTC, so the panel
 * never computes a next-run time itself: it shows what the host's tick wrote.
 */
export function RefreshSchedulePanel() {
  const [schedule, setSchedule] = useState<RefreshSchedule>(DEFAULT_SCHEDULE);
  const [state, setState] = useState<State>({});
  /** The zone the daemon evaluates "04:30" in — see the schedule route. */
  const [timezone, setTimezone] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/schedule")
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
      )
      .then((j) => {
        if (!alive) return;
        setSchedule(j.schedule);
        setState(j.state ?? {});
        setTimezone(typeof j.timezone === "string" ? j.timezone : "");
        setLoaded(true);
      })
      .catch(() => alive && setError("读取排程失败"));
    return () => {
      alive = false;
    };
  }, []);

  function patch(p: Partial<RefreshSchedule>) {
    setSchedule((s) => ({ ...s, ...p }));
    setSaved(null);
  }

  function toggleStage(id: string) {
    setSchedule((s) => ({
      ...s,
      stages: s.stages.includes(id)
        ? s.stages.filter((x) => x !== id)
        : [...s.stages, id],
    }));
    setSaved(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/schedule", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(schedule),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? "保存失败");
      setSchedule(j.schedule);
      // The host recomputes the next run on its next tick (within 15 minutes),
      // so don't pretend to know it here — say what actually happens.
      setSaved("已保存,下次 tick(15 分钟内)生效");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const field =
    "h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-sm";

  return (
    <section
      aria-label="自动更新"
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4 space-y-3"
    >
      <div className="flex items-baseline gap-2 flex-wrap">
        <h2 className="text-sm font-semibold">自动更新</h2>
      </div>

      {!loaded ? (
        <div className="text-xs text-[var(--color-muted-fg)]">读取中…</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={schedule.enabled}
                onChange={(e) => patch({ enabled: e.target.checked })}
              />
              启用
            </label>

            <select
              className={field}
              value={schedule.frequency}
              onChange={(e) =>
                patch({
                  frequency: e.target.value === "daily" ? "daily" : "weekly",
                })
              }
              disabled={!schedule.enabled}
            >
              <option value="weekly">每周</option>
              <option value="daily">每天</option>
            </select>

            {schedule.frequency === "weekly" ? (
              <select
                className={field}
                value={schedule.weekday}
                onChange={(e) => patch({ weekday: Number(e.target.value) })}
                disabled={!schedule.enabled}
              >
                {WEEKDAYS.map((w, i) => (
                  <option key={w} value={i + 1}>
                    周{w}
                  </option>
                ))}
              </select>
            ) : null}

            <span className="flex items-center gap-1">
              <select
                className={field}
                value={schedule.hour}
                onChange={(e) => patch({ hour: Number(e.target.value) })}
                disabled={!schedule.enabled}
                aria-label="小时"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}
                  </option>
                ))}
              </select>
              <span className="text-sm text-[var(--color-muted-fg)]">:</span>
              <select
                className={field}
                value={schedule.minute}
                onChange={(e) => patch({ minute: Number(e.target.value) })}
                disabled={!schedule.enabled}
                aria-label="分钟"
              >
                {[0, 15, 30, 45].map((m) => (
                  <option key={m} value={m}>
                    {String(m).padStart(2, "0")}
                  </option>
                ))}
              </select>
              {/* The time is evaluated in the DAEMON's zone, which is a
                  container's — UTC unless TZ says otherwise. Printing it is
                  the difference between a schedule and a guess. */}
              {timezone ? (
                <span className="text-xs text-[var(--color-muted-fg)]">
                  {timezone}
                </span>
              ) : null}
            </span>
          </div>

          <div>
            <div className="flex flex-wrap gap-1.5">
              {REFRESH_STAGES.map((s) => {
                const on = schedule.stages.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleStage(s.id)}
                    disabled={!schedule.enabled}
                    title={s.hint}
                    aria-pressed={on}
                    className={`px-2.5 h-7 rounded-md border text-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                      on
                        ? "border-[var(--color-accent)] bg-[var(--color-accent)]/12 text-[var(--color-accent)]"
                        : "border-[var(--color-border)] text-[var(--color-muted-fg)] hover:text-[var(--color-fg)]"
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="h-8 px-3 rounded-md bg-[var(--color-accent)] text-[var(--color-accent-fg)] text-sm font-medium cursor-pointer disabled:opacity-60"
            >
              {saving ? "保存中…" : "保存"}
            </button>
            {saved ? (
              <span className="text-xs text-[var(--color-accent)]">
                {saved}
              </span>
            ) : null}
            {error ? (
              <span className="text-xs text-red-500">{error}</span>
            ) : null}
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-[var(--color-muted-fg)] pt-1 border-t border-[var(--color-border)]">
            <dt>下次自动运行</dt>
            <dd className="tabular-nums">{fmt(state.nextRunAt)}</dd>
            <dt>上次自动运行</dt>
            <dd className="tabular-nums">{fmt(state.lastStartedAt)}</dd>
            <dt>调度器最后心跳</dt>
            <dd className="tabular-nums">{fmt(state.checkedAt)}</dd>
          </dl>
        </>
      )}
    </section>
  );
}
