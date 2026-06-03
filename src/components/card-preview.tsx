"use client";

import { createContext, useContext, useState } from "react";

type Preview = {
  image_url: string | null;
  name: string;
  code: string;
} | null;

const CardPreviewContext = createContext<{
  set: (p: Preview) => void;
} | null>(null);

/**
 * Hover-preview wiring for a card grid. Card tiles call `set(...)` on
 * mouse-enter; this provider renders a large floating image of the hovered
 * card pinned to the right edge of the viewport.
 *
 * The context is OPTIONAL — `useCardPreview()` returns null when a grid isn't
 * wrapped in a provider, so tiles that aren't in a preview context (e.g. in
 * build/purchase modes) simply no-op on hover.
 *
 * The floating panel is `pointer-events-none` and lg-only: it never
 * intercepts clicks, and on small/touch screens (where hover doesn't exist)
 * it isn't rendered at all.
 */
export function CardPreviewProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [preview, setPreview] = useState<Preview>(null);

  return (
    <CardPreviewContext.Provider value={{ set: setPreview }}>
      {/* Clearing on leave of the whole grid (not per-tile) avoids flicker
          when the pointer crosses the gaps between cards. */}
      <div onMouseLeave={() => setPreview(null)}>{children}</div>

      {preview && preview.image_url ? (
        <div
          className="hidden lg:block fixed top-1/2 -translate-y-1/2 z-50 w-[420px] xl:w-[480px] pointer-events-none"
          // Pin the panel's right edge to the right edge of the centered
          // max-w-6xl (1152px) content column instead of the far viewport
          // edge — so it sits over the deck-info / aside area (which the
          // owner is fine covering) rather than floating off in the margin.
          style={{ right: "max(0.75rem, calc((100vw - 1152px) / 2 + 0.75rem))" }}
        >
          <img
            src={preview.image_url}
            alt={preview.name}
            referrerPolicy="no-referrer"
            className="w-full rounded-xl shadow-2xl border border-[var(--color-border)] bg-[var(--color-card)]"
          />
          <div className="mt-2 text-center">
            <div className="text-xs font-mono text-[var(--color-muted-fg)]">
              {preview.code}
            </div>
            <div className="text-base font-medium truncate">{preview.name}</div>
          </div>
        </div>
      ) : null}
    </CardPreviewContext.Provider>
  );
}

/** Returns the preview controller, or null when no provider is mounted. */
export function useCardPreview() {
  return useContext(CardPreviewContext);
}
