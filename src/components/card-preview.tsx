"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/** Viewport rect of the hovered tile, used to place the panel beside it. */
type Anchor = { top: number; bottom: number; left: number; right: number };

type Preview = {
  image_url: string | null;
  name: string;
  code: string;
  /** Products this card can be pulled from — often more than one. */
  sets?: string[];
  anchor?: Anchor;
} | null;

const CardPreviewContext = createContext<{
  set: (p: Preview) => void;
  /** Hide the panel — call on leaving a tile. See GRACE_MS. */
  clear: () => void;
} | null>(null);

/**
 * How long `clear` waits before the panel actually goes away.
 *
 * Tiles are separated by grid gaps, so sliding from one card to the next means
 * leaving the first before entering the second. Hiding on that leave makes the
 * panel blink off and back on for every card the pointer crosses. The delay is
 * shorter than that transit, and `set` cancels a pending clear, so moving
 * between cards swaps the panel while moving OFF the cards still hides it —
 * fast enough to read as immediate.
 */
const GRACE_MS = 90;

// Panel geometry. Width is also declared in the className below; keep them in
// sync — the placement math needs the number, Tailwind needs the literal.
const PANEL_W = 420;
const GAP = 12; // breathing room between the tile and the panel
const MARGIN = 8; // keep this far from the viewport edges
/** Card art is 5:7; plus ~52px of code/name caption underneath. */
const PANEL_H = Math.round((PANEL_W * 7) / 5) + 52;

/**
 * Hover-preview wiring for a card grid. Card tiles report themselves (and
 * their on-screen rect) on mouse-enter and this provider floats a large image
 * of the hovered card NEXT TO the tile.
 *
 * It used to be pinned to a fixed spot — vertically centred, with its right
 * edge lined up against a `max-w-6xl` content column. Once the deck page went
 * full-width that column stopped existing, so the panel landed in the middle
 * of the grid and covered the very cards the user was hovering. Placing it
 * relative to the anchor keeps it clear of whatever you're pointing at, at any
 * window size.
 *
 * The panel is `pointer-events-none` and lg-only: it never intercepts clicks,
 * and on small/touch screens (where hover doesn't exist) it isn't rendered.
 */
export function CardPreviewProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [preview, setPreview] = useState<Preview>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPending = useCallback(() => {
    if (pending.current) {
      clearTimeout(pending.current);
      pending.current = null;
    }
  }, []);

  const set = useCallback(
    (p: Preview) => {
      cancelPending();
      setPreview(p);
    },
    [cancelPending],
  );

  const clear = useCallback(() => {
    cancelPending();
    pending.current = setTimeout(() => {
      pending.current = null;
      setPreview(null);
    }, GRACE_MS);
  }, [cancelPending]);

  // A timer outliving the provider would setState on an unmounted tree.
  useEffect(() => cancelPending, [cancelPending]);

  const ctx = useMemo(() => ({ set, clear }), [set, clear]);

  return (
    <CardPreviewContext.Provider value={ctx}>
      {/* Tiles hide the panel themselves on leave; this catches the pointer
          leaving the grid by a route that skips a tile's own mouseleave —
          off the window entirely, or across the padding around the grid.
          Immediate, because there is no next card to wait for. */}
      <div
        onMouseLeave={() => {
          cancelPending();
          setPreview(null);
        }}
      >
        {children}
      </div>

      {preview && preview.image_url ? (
        <div
          className="hidden lg:block fixed z-50 w-[420px] pointer-events-none"
          style={placement(preview.anchor)}
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
            {/* Which packs this card comes out of. Worth space here because
                the code only names ONE set, while promos in particular are
                reprinted across many products. */}
            {preview.sets && preview.sets.length > 0 ? (
              <div className="mt-1.5 text-[11px] text-[var(--color-muted-fg)] leading-snug">
                <span className="opacity-70">收录：</span>
                {preview.sets.join(" · ")}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </CardPreviewContext.Provider>
  );
}

/**
 * Place the panel beside the hovered tile: to its right when there's room,
 * otherwise flipped to its left (so cards in the last column don't push the
 * panel off-screen), and vertically centred on the tile but clamped inside the
 * viewport.
 */
function placement(anchor: Anchor | undefined): React.CSSProperties {
  // No anchor (shouldn't happen, but the type allows it): fall back to the
  // right margin so the panel is at least out of the way.
  if (!anchor) return { top: MARGIN, right: MARGIN };

  const vw = typeof window === "undefined" ? 1280 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;

  const roomRight = vw - anchor.right - GAP - MARGIN;
  const left =
    roomRight >= PANEL_W
      ? anchor.right + GAP
      : Math.max(MARGIN, anchor.left - GAP - PANEL_W);

  const centred = (anchor.top + anchor.bottom) / 2 - PANEL_H / 2;
  const top = Math.min(Math.max(MARGIN, centred), Math.max(MARGIN, vh - PANEL_H - MARGIN));

  return { left, top };
}

/** Returns the preview controller, or null when no provider is mounted. */
export function useCardPreview() {
  return useContext(CardPreviewContext);
}
