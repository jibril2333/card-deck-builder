"use client";

import { useEffect, useState } from "react";
import { REFRESH_STAGES } from "@/lib/refresh-stages";
import {
  DEFAULT_SCHEDULE,
  TIMEZONE_CHOICES,
  type RefreshSchedule,
} from "@/lib/refresh-schedule";
import { useI18n } from "@/lib/i18n/client";
import { formatTimestamp } from "@/lib/i18n/format";

type State = {
  describe?: string;
  nextRunAt?: string | null;
  lastSlot?: string;
  lastStartedAt?: string;
  checkedAt?: string;
};

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
  const { m: msg, locale } = useI18n();
  const [schedule, setSchedule] = useState<RefreshSchedule>(DEFAULT_SCHEDULE);
  const [state, setState] = useState<State>({});
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
        setLoaded(true);
      })
      .catch(() => alive && setError(msg.admin.readScheduleFailed));
    return () => {
      alive = false;
    };
    // `msg` is memoised per language by the provider, so this re-reads only
    // when the reader switches language — which is when the error text would
    // be stale anyway.
  }, [msg]);

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
      if (!r.ok || !j.ok) throw new Error(j.error ?? msg.admin.saveFailed);
      setSchedule(j.schedule);
      // The host recomputes the next run on its next tick (within 15 minutes),
      // so don't pretend to know it here — say what actually happens.
      setSaved(msg.admin.scheduleSaved);
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
      aria-label={msg.admin.autoUpdate}
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4 space-y-3"
    >
      <div className="flex items-baseline gap-2 flex-wrap">
        <h2 className="text-sm font-semibold">{msg.admin.autoUpdate}</h2>
      </div>

      {!loaded ? (
        <div className="text-xs text-[var(--color-muted-fg)]">{msg.admin.loading}</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={schedule.enabled}
                onChange={(e) => patch({ enabled: e.target.checked })}
              />
              {msg.admin.enable}
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
              <option value="weekly">{msg.admin.weekly}</option>
              <option value="daily">{msg.admin.daily}</option>
            </select>

            {schedule.frequency === "weekly" ? (
              <select
                className={field}
                value={schedule.weekday}
                onChange={(e) => patch({ weekday: Number(e.target.value) })}
                disabled={!schedule.enabled}
              >
                {msg.admin.weekdays.map((w, i) => (
                  <option key={w} value={i + 1}>
                    {msg.admin.weekdayPrefix(w)}
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
                aria-label={msg.admin.hour}
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
                aria-label={msg.admin.minute}
              >
                {[0, 15, 30, 45].map((m) => (
                  <option key={m} value={m}>
                    {String(m).padStart(2, "0")}
                  </option>
                ))}
              </select>
              {/* The zone the time is written in — it rides along in the
                  schedule, so 04:00 means 04:00 there wherever the daemon
                  runs. A list of places, not of IANA identifiers: nobody
                  schedules a card scrape by picking America/Argentina. */}
              <select
                className={field}
                value={schedule.timezone}
                onChange={(e) => patch({ timezone: e.target.value })}
                disabled={!schedule.enabled}
                aria-label={msg.admin.timezone}
              >
                {TIMEZONE_CHOICES.map((z) => (
                  <option key={z} value={z}>
                    {msg.admin.timezones[z] ?? z}
                  </option>
                ))}
              </select>
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
                    title={msg.admin.stageHint[s.id]}
                    aria-pressed={on}
                    className={`px-2.5 h-7 rounded-md border text-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                      on
                        ? "border-[var(--color-accent)] bg-[var(--color-accent)]/12 text-[var(--color-accent)]"
                        : "border-[var(--color-border)] text-[var(--color-muted-fg)] hover:text-[var(--color-fg)]"
                    }`}
                  >
                    {msg.admin.stageLabel[s.id]}
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
              {saving ? msg.admin.saving : msg.admin.save}
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
            <dt>{msg.admin.nextRun}</dt>
            <dd className="tabular-nums">{formatTimestamp(locale, state.nextRunAt)}</dd>
            <dt>{msg.admin.lastRun}</dt>
            <dd className="tabular-nums">{formatTimestamp(locale, state.lastStartedAt)}</dd>
            <dt>{msg.admin.lastHeartbeat}</dt>
            <dd className="tabular-nums">{formatTimestamp(locale, state.checkedAt)}</dd>
          </dl>
        </>
      )}
    </section>
  );
}
