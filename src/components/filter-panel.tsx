"use client";

import { useState } from "react";

/**
 * Mobile wrapper for the search filter sidebar. On phones the filter panel
 * would otherwise stack on top of the card grid and push every card below a
 * tall wall of controls — so here it collapses behind a "筛选" toggle
 * (closed by default), letting cards show immediately. Active filters still
 * appear as chips above the grid (ActiveFilters), so collapsing hides the
 * controls, not the state. On lg+ the toggle is hidden and the panel is
 * always open (normal sidebar).
 */
export function FilterPanel({
  activeCount,
  children,
}: {
  activeCount: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="lg:hidden w-full h-10 mb-3 px-3 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] flex items-center justify-between text-sm cursor-pointer"
      >
        <span className="flex items-center gap-2 font-medium">
          🔍 筛选
          {activeCount > 0 ? (
            <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-[var(--color-accent)] text-[var(--color-accent-fg)] text-xs font-bold">
              {activeCount}
            </span>
          ) : null}
        </span>
        <span className="text-[var(--color-muted-fg)]">{open ? "▲" : "▼"}</span>
      </button>

      <div className={open ? "block" : "hidden lg:block"}>{children}</div>
    </>
  );
}
