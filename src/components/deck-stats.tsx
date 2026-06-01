export type StatBar = { label: string; value: number; color?: string };
export type StatPanel = { title: string; bars: StatBar[] };

export function DeckStats({ panels }: { panels: StatPanel[] }) {
  const nonEmpty = panels.filter((p) => p.bars.length > 0);
  if (nonEmpty.length === 0) return null;
  return (
    <div className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted-fg)] mb-3">
        卡组分布
      </h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {nonEmpty.map((p) => (
          <Panel key={p.title} panel={p} />
        ))}
      </div>
    </div>
  );
}

function Panel({ panel }: { panel: StatPanel }) {
  const max = Math.max(1, ...panel.bars.map((b) => b.value));
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-fg)] mb-3">
        {panel.title}
      </h3>
      <div className="flex items-end gap-1.5 overflow-x-auto pb-1">
        {panel.bars.map((b, i) => {
          const pct = (b.value / max) * 100;
          return (
            <div
              key={`${b.label}-${i}`}
              className="flex-1 min-w-[2.5rem] flex flex-col items-center"
            >
              <div className="w-full h-24 flex items-end">
                <div
                  className="w-full rounded-t-md transition-all"
                  style={{
                    height: `${pct}%`,
                    minHeight: 5,
                    background: b.color ?? "var(--color-accent)",
                  }}
                  title={`${b.label}: ${b.value}`}
                />
              </div>
              <div className="text-[10px] text-[var(--color-muted-fg)] mt-1.5 text-center leading-tight w-full truncate flex items-center justify-center gap-1">
                {b.color ? (
                  <span
                    className="inline-block w-2 h-2 rounded-full shrink-0"
                    style={{ background: b.color }}
                  />
                ) : null}
                <span className="truncate" title={b.label}>
                  {b.label}
                </span>
              </div>
              <div className="text-xs font-semibold tabular-nums">
                {b.value}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
