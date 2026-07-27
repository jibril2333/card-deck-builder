export type StatBar = { label: string; value: number; color?: string };
export type StatPanel = { title: string; bars: StatBar[] };

/**
 * Deck composition, sized for the deck page's narrow right column.
 *
 * It used to be a full-width grid of vertical bar charts sitting under the
 * deck, which ate a screenful to show a handful of numbers. Horizontal rows
 * carry the same information in a fraction of the height and read fine at
 * 300px wide, so the panel can live beside the deck instead of below it.
 */
export function DeckStats({ panels }: { panels: StatPanel[] }) {
  const nonEmpty = panels.filter((p) => p.bars.length > 0);
  if (nonEmpty.length === 0) return null;
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4 space-y-4">
      <h2 className="text-sm font-semibold">卡组分布</h2>
      {nonEmpty.map((p) => (
        <Panel key={p.title} panel={p} />
      ))}
    </div>
  );
}

function Panel({ panel }: { panel: StatPanel }) {
  const max = Math.max(1, ...panel.bars.map((b) => b.value));
  return (
    <div>
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted-fg)] mb-1.5">
        {panel.title}
      </h3>
      <div className="space-y-1">
        {panel.bars.map((b, i) => (
          <div
            key={`${b.label}-${i}`}
            className="flex items-center gap-2"
            title={`${b.label}: ${b.value}`}
          >
            <span className="text-[11px] text-[var(--color-muted-fg)] w-16 shrink-0 truncate flex items-center gap-1">
              {b.color ? (
                <span
                  className="inline-block w-2 h-2 rounded-full shrink-0"
                  style={{ background: b.color }}
                />
              ) : null}
              <span className="truncate">{b.label}</span>
            </span>
            {/* Full-width track behind every bar, so lengths stay comparable
                across rows even though the labels differ. */}
            <span className="flex-1 h-1.5 rounded-full bg-[var(--color-muted)] overflow-hidden">
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${(b.value / max) * 100}%`,
                  minWidth: 3,
                  background: b.color ?? "var(--color-accent)",
                }}
              />
            </span>
            <span className="text-[11px] font-semibold tabular-nums w-5 text-right shrink-0">
              {b.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
