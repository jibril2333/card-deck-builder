"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { formatTimestamp } from "@/lib/i18n/format";

type Change = {
  kind: string;
  code: string | null;
  lang: string | null;
  field: string | null;
  before: string | null;
  after: string | null;
  name?: string | null;
};
type Run = {
  run_at: string;
  total: number;
  counts: Record<string, number>;
  sample: Change[];
};


/** A banlist move can invalidate a deck you already built; the rest can't. */
const isBanlist = (k: string) => k.startsWith("restriction") || k.startsWith("pair");

/** Long enough for a whole effect line; the full text is in the tooltip. */
function short(s: string | null) {
  if (!s) return "—";
  return s.length > 220 ? `${s.slice(0, 220)}…` : s;
}

/**
 * One run's rows, grouped by what kind of change they are.
 *
 * Grouping is the difference between "here are 300 lines" and "these 4 cards
 * changed a field, these 2 are new, this one moved on the banlist" — and the
 * banlist group comes first, since it is the only one that can invalidate a
 * deck someone already built.
 */
function ChangeList({
  rows,
  fallback,
}: {
  rows: Change[] | "loading" | undefined;
  fallback: Change[];
}) {
  const { m } = useI18n();
  if (rows === "loading") {
    return (
      <div className="px-3 py-2 text-xs text-[var(--color-muted-fg)]">
        {m.admin.loading}
      </div>
    );
  }
  const list = rows ?? fallback;
  const groups = new Map<string, Change[]>();
  for (const c of list) {
    const g = groups.get(c.kind) ?? [];
    g.push(c);
    groups.set(c.kind, g);
  }
  return (
    <div className="divide-y divide-[var(--color-border)]/60">
      {[...groups.entries()].map(([kind, items]) => (
        <div key={kind} className="px-3 py-2">
          <div
            className={`text-xs font-medium mb-1 ${
              isBanlist(kind) ? "text-red-400" : "text-[var(--color-muted-fg)]"
            }`}
          >
            {m.admin.kindLabel[kind] ?? kind} · {items.length}
          </div>
          <ul className="space-y-1">
            {items.map((c, i) => (
              <li key={`${c.code}-${c.field}-${i}`} className="text-xs">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-mono text-[var(--color-muted-fg)]">
                    {c.code}
                  </span>
                  {c.name ? <span className="font-medium">{c.name}</span> : null}
                  {c.field ? (
                    <span className="px-1 rounded bg-[var(--color-muted)] text-[10px] text-[var(--color-muted-fg)]">
                      {m.admin.fieldLabel[c.field] ?? c.field}
                    </span>
                  ) : null}
                  {c.lang ? (
                    <span className="text-[10px] text-[var(--color-muted-fg)]">
                      {m.admin.langLabel[c.lang] ?? c.lang}
                    </span>
                  ) : null}
                </div>
                {c.before || c.after ? (
                  <div
                    className="mt-0.5 text-[var(--color-muted-fg)] break-words leading-relaxed"
                    title={`${c.before ?? "—"}\n→\n${c.after ?? "—"}`}
                  >
                    <span className="line-through opacity-70">
                      {short(c.before)}
                    </span>
                    <span className="mx-1">→</span>
                    <span className="text-[var(--color-fg)]">
                      {short(c.after)}
                    </span>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {list.length === 0 ? (
        <div className="px-3 py-2 text-xs text-[var(--color-muted-fg)]">
          {m.admin.noDetail}
        </div>
      ) : null}
    </div>
  );
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
  const { m, locale } = useI18n();
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  // Full rows per run, fetched when one is opened. The summaries carry a short
  // sample only — a big refresh is thousands of rows and none of them are
  // worth downloading until someone asks for that run.
  const [detail, setDetail] = useState<Record<string, Change[] | "loading">>({});

  async function toggle(runAt: string) {
    if (open === runAt) {
      setOpen(null);
      return;
    }
    setOpen(runAt);
    if (detail[runAt]) return;
    setDetail((d) => ({ ...d, [runAt]: "loading" }));
    try {
      const r = await fetch(
        `/api/admin/changes?run=${encodeURIComponent(runAt)}`,
        { cache: "no-store" },
      );
      const j = (await r.json()) as { changes: Change[] };
      setDetail((d) => ({ ...d, [runAt]: j.changes ?? [] }));
    } catch {
      setDetail((d) => {
        const next = { ...d };
        delete next[runAt];
        return next;
      });
    }
  }

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/changes?runs=5")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => alive && setRuns(j.runs))
      .catch(() => alive && setError(m.admin.readChangesFailed));
    return () => {
      alive = false;
    };
    // `m` is memoised per language by the provider — this re-reads only
    // when the reader switches language.
  }, [m]);

  return (
    <section
      aria-label={m.admin.changes}
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4 space-y-3"
    >
      <div className="flex items-baseline gap-2 flex-wrap">
        <h2 className="text-sm font-semibold">{m.admin.changes}</h2>
      </div>

      {error ? <div className="text-xs text-red-500">{error}</div> : null}
      {!runs ? (
        <div className="text-xs text-[var(--color-muted-fg)]">{m.admin.loading}</div>
      ) : runs.length === 0 ? (
        <div className="text-xs text-[var(--color-muted-fg)]">
          {m.admin.noChangeRecords}
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
                  onClick={() => void toggle(r.run_at)}
                  aria-expanded={expanded}
                  className="w-full px-3 py-2 text-left cursor-pointer hover:bg-[var(--color-muted)]/50"
                >
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm tabular-nums">{formatTimestamp(locale, r.run_at, r.run_at)}</span>
                    <span className="text-xs text-[var(--color-muted-fg)]">
                      {m.admin.totalChanges(r.total)}
                    </span>
                    {banlistTotal > 0 ? (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">
                        {m.admin.banlistChanges(banlistTotal)}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--color-muted-fg)]">
                    {Object.entries(r.counts).map(([k, n]) => (
                      <span key={k}>
                        {m.admin.kindLabel[k] ?? k} {n}
                      </span>
                    ))}
                  </div>
                </button>

                {expanded ? (
                  <div className="border-t border-[var(--color-border)]">
                    <ChangeList rows={detail[r.run_at]} fallback={r.sample} />
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
