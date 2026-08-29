"use client";

import { useEffect, useRef, useState } from "react";

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
 * Three forms, and the pointer decides which two are even on the table:
 *   · room for the column — it is just there, open, no control at all;
 *   · a mouse without the room (`narrow:`) — the old bar above the results,
 *     collapsed by default;
 *   · fingers (`touch:`) — the sheet, whatever the width, because a tablet in
 *     landscape is wide and still has no cursor to hover with.
 */
export function FilterPanel({
  activeCount,
  children,
}: {
  activeCount: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

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

  // Flick it back down to dismiss it, which is how every other sheet on a
  // phone behaves — reaching back up to the backdrop is a stretch when the
  // sheet takes three quarters of the screen.
  //
  // The gesture only starts when the sheet's own list is already at the top,
  // so scrolling the filters still scrolls them, and the listener has to be
  // native and non-passive: React's onTouchMove cannot preventDefault, and
  // without that the browser scrolls the sheet while the finger is dragging
  // it.
  useEffect(() => {
    const el = sheetRef.current;
    if (!el || !open) return;
    // The same condition the CSS uses for the sheet. Anywhere else this
    // element is a plain column, and a stray drag must not move it.
    if (!matchMedia("(pointer: coarse) and (max-width: 63.99rem)").matches) {
      return;
    }
    el.style.transform = "";
    el.style.transition = "";

    let startY = 0;
    let startedAt = 0;
    let dy = 0;
    let tracking = false;
    let dragging = false;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      tracking = el.scrollTop <= 0;
      startY = e.touches[0].clientY;
      startedAt = e.timeStamp;
      dy = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      dy = e.touches[0].clientY - startY;
      // A few pixels of slop so a tap on a checkbox is still a tap.
      if (!dragging && dy > 6) {
        dragging = true;
        el.style.transition = "none";
      }
      if (!dragging) return;
      e.preventDefault();
      el.style.transform = `translateY(${Math.max(0, dy)}px)`;
    };
    const onEnd = (e: TouchEvent) => {
      tracking = false;
      if (!dragging) return;
      dragging = false;
      const speed = dy / Math.max(1, e.timeStamp - startedAt);
      const far = dy > el.getBoundingClientRect().height * 0.25;
      el.style.transition = "";
      if (far || speed > 0.5) {
        // Hand it to the CSS mid-flight: `data-open` comes off on the next
        // render and carries it the rest of the way down.
        el.style.transform = "translateY(100%)";
        setOpen(false);
      } else {
        el.style.transform = "";
      }
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      // The inline transform is left alone on purpose: on the way out it is
      // what the closing slide starts from, and opening again clears it above.
    };
  }, [open]);

  return (
    <>
      {/* A mouse in a narrow window: the old bar, in place, above the results.
          No sheet — nothing here is being reached with a thumb. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="hidden narrow:flex w-full h-10 mb-3 px-3 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] items-center justify-between text-sm cursor-pointer"
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

      {/* The opener. Bottom-right, thumb height, and it says how many filters
          are on — that count is the reason to open it. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="筛选"
        aria-expanded={open}
        className="hidden touch:flex fixed right-4 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-40 w-13 h-13 rounded-full bg-[var(--color-accent)] text-[var(--color-accent-fg)] text-xl shadow-lg items-center justify-center cursor-pointer"
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
          className="hidden touch:block fixed inset-0 z-40 bg-black/40"
        />
      ) : null}

      {/* One panel, two lives: the sheet on a phone, the plain sidebar column
          from `desktop:` up (see `.filter-sheet` in globals.css). Kept as one
          element so the controls inside have one state, not two. */}
      <div
        ref={sheetRef}
        className="filter-sheet"
        data-open={open ? "" : undefined}
      >
        {/* The grab handle: it says the sheet came up from the bottom, and now
            it says the truth — drag it back down and it goes. */}
        <div
          aria-hidden
          className="hidden touch:block mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--color-border)]"
        />
        {children}
      </div>
    </>
  );
}
