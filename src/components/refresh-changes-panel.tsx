"use client";

import { useEffect, useState } from "react";

type Change = {
  kind: string;
  code: string | null;
  lang: string | null;
  field: string | null;
  before: string | null;
  after: string | null;
};
type Run = {
  run_at: string;
  total: number;
  counts: Record<string, number>;
  sample: Change[];
};

const KIND_LABEL: Record<string, string> = {
  card_added: "新卡",
  card_removed: "卡片消失",
  field_changed: "字段改动",
  translation_added: "新译文",
  translation_changed: "译文改动",
  restriction_added: "新增禁限",
  restriction_changed: "禁限变更",
  restriction_removed: "解除禁限",
  pair_added: "新增禁卡组合",
  pair_removed: "解除禁卡组合",
};

/** A banlist move can invalidate a deck you already built; the rest can't. */
const isBanlist = (k: string) => k.startsWith("restriction") || k.startsWith("pair");

function fmt(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("zh-CN", { hour12: false });
}

function short(s: string | null) {
  if (!s) return "—";
  return s.length > 60 ? `${s.slice(0, 60)}…` : s;
}

/**
 * What the last few refreshes changed.
 *
 * The refresh used to report "4370 → 4397 cards" and nothing more: you could
 * see that something happened, never what. This reads the changelog the
 * pipeline now writes at swap time — including, most importantly, banlist
 * moves, which are the only changes here that can invalidate a deck.
 */
export function RefreshChangesPanel() {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/changes?runs=5")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => alive && setRuns(j.runs))
      .catch(() => alive && setError("读取变更记录失败"));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section
      aria-label="更新变更"
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4 space-y-3"
    >
      <div className="flex items-baseline gap-2 flex-wrap">
        <h2 className="text-sm font-semibold">更新变更</h2>
      </div>

      {error ? <div className="text-xs text-red-500">{error}</div> : null}
      {!runs ? (
        <div className="text-xs text-[var(--color-muted-fg)]">读取中…</div>
      ) : runs.length === 0 ? (
        <div className="text-xs text-[var(--color-muted-fg)]">
          还没有记录 —— 下一次刷新开始留。
        </div>
      ) : (
        <ul className="space-y-2">
          {runs.map((r) => {
            const banlist = Object.entries(r.counts).filter(([k]) => isBanlist(k));
            const banlistTotal = banlist.reduce((s, [, n]) => s + n, 0);
            const expanded = open === r.run_at;
            return (
              <li
                key={r.run_at}
                className="rounded-md border border-[var(--color-border)]"
              >
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : r.run_at)}
                  aria-expanded={expanded}
                  className="w-full px-3 py-2 text-left cursor-pointer hover:bg-[var(--color-muted)]/50"
                >
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm tabular-nums">{fmt(r.run_at)}</span>
                    <span className="text-xs text-[var(--color-muted-fg)]">
                      共 {r.total} 处
                    </span>
                    {banlistTotal > 0 ? (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">
                        禁限变动 {banlistTotal}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--color-muted-fg)]">
                    {Object.entries(r.counts).map(([k, n]) => (
                      <span key={k}>
                        {KIND_LABEL[k] ?? k} {n}
                      </span>
                    ))}
                  </div>
                </button>

                {expanded ? (
                  <div className="border-t border-[var(--color-border)] divide-y divide-[var(--color-border)]/60">
                    {r.sample.map((c, i) => (
                      <div key={i} className="px-3 py-1.5 text-xs">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span
                            className={
                              isBanlist(c.kind)
                                ? "text-red-400"
                                : "text-[var(--color-muted-fg)]"
                            }
                          >
                            {KIND_LABEL[c.kind] ?? c.kind}
                          </span>
                          <span className="font-mono">{c.code}</span>
                          {c.lang ? (
                            <span className="text-[var(--color-muted-fg)]">{c.lang}</span>
                          ) : null}
                          {c.field ? (
                            <span className="text-[var(--color-muted-fg)]">{c.field}</span>
                          ) : null}
                        </div>
                        {c.before || c.after ? (
                          <div className="mt-0.5 text-[var(--color-muted-fg)] break-words">
                            <span className="line-through opacity-70">{short(c.before)}</span>
                            <span className="mx-1">→</span>
                            <span className="text-[var(--color-fg)]">{short(c.after)}</span>
                          </div>
                        ) : null}
                      </div>
                    ))}
                    {r.total > r.sample.length ? (
                      <div className="px-3 py-1.5 text-xs text-[var(--color-muted-fg)]">
                        还有 {r.total - r.sample.length} 处未列出 —— 全部在
                        refresh_changes 表里。
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
