"use client";

/**
 * Loading UI shown while a [game] segment page is server-rendering.
 *  - A thin indeterminate bar at the top (so users get instant feedback on nav).
 *  - A subtle centered hint after a moment, in case the page is unusually slow.
 */
import { useI18n } from "@/lib/i18n/client";

export default function GameLoading() {
  const { m } = useI18n();
  return (
    <>
      {/* Top progress bar */}
      <div className="fixed top-0 left-0 right-0 h-0.5 z-50 overflow-hidden pointer-events-none">
        <div className="loading-bar h-full w-1/3 bg-[var(--color-accent)] rounded-r-full" />
      </div>

      <main className="w-full mx-auto max-w-3xl px-4 py-20 flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-[var(--color-muted-fg)]">
          <span
            className="inline-block w-3 h-3 rounded-full border-2 border-[var(--color-muted)] border-t-[var(--color-accent)] animate-spin"
            aria-hidden
          />
          {m.common.loading}
        </div>
      </main>

      <style>{`
        @keyframes cdb-loading-slide {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
        .loading-bar { animation: cdb-loading-slide 1.1s ease-in-out infinite; }
      `}</style>
    </>
  );
}
