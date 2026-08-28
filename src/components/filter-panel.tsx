"use client";

import { useEffect, useState } from "react";

/**
 * The search filters, which are a sidebar on a desktop and a bottom sheet on a
 * phone.
 *
 * Inline collapsing was the old answer: a "筛选" bar at the top of the results
 * that unfolded a wall of controls and pushed every card off the screen, so
 * you filtered, scrolled back up, closed it, and scrolled down again. A sheet
 * costs no layout at all — it slides over the results, and the results are
 * still there behind it when you change something.
 *
 * Same shape as the 30MS collection app: a round button in the thumb's corner
 * carrying the number of active filters, a dimmed backdrop, and a panel that
 * comes up from the bottom edge and stops at 75% of the screen.
 *
 * `desktop:` (see globals.css) is the switch, not a width — a browser window
 * on half a laptop screen has a pointer and gets the sidebar.
 */
export function FilterPanel({
  activeCount,
  children,
}: {
  activeCount: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  // Escape closes it, and the page behind stops scrolling while it is up —
  // otherwise a flick meant for the sheet's own list carries the results away
  // underneath it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      {/* The opener. Bottom-right, thumb height, and it says how many filters
          are on — that count is the reason to open it. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="筛选"
        aria-expanded={open}
        className="desktop:hidden fixed right-4 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-40 w-13 h-13 rounded-full bg-[var(--color-accent)] text-[var(--color-accent-fg)] text-xl shadow-lg flex items-center justify-center cursor-pointer"
      >
        🔍
        {activeCount > 0 ? (
          <span className="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1 rounded-full bg-[var(--color-card)] text-[var(--color-accent)] border border-[var(--color-accent)] text-[10px] font-bold flex items-center justify-center">
            {activeCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          onClick={() => setOpen(false)}
          className="desktop:hidden fixed inset-0 z-40 bg-black/40"
        />
      ) : null}

      {/* One panel, two lives: the sheet on a phone, the plain sidebar column
          from `desktop:` up (see `.filter-sheet` in globals.css). Kept as one
          element so the controls inside have one state, not two. */}
      <div className="filter-sheet" data-open={open ? "" : undefined}>
        {/* The grab handle is the affordance that says "this came up from the
            bottom", even though it is the backdrop and Escape that close it. */}
        <div
          aria-hidden
          className="desktop:hidden mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--color-border)]"
        />
        {children}
      </div>
    </>
  );
}
