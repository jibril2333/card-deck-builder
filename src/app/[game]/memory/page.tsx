import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { isGameId } from "@/lib/games";
import { MemoryBoard } from "@/components/memory-board";

export const metadata: Metadata = {
  title: "内存条",
  // Add to Home Screen from this page and iOS launches it standalone — no
  // address bar, no toolbar. That is the only way to get a genuinely full
  // screen on an iPhone: Safari has no Fullscreen API, and its chrome is worth
  // roughly a hexagon and a half of board.
  appleWebApp: {
    capable: true,
    title: "内存条",
    statusBarStyle: "black-translucent",
  },
};

// Scoped to this route on purpose. `viewport-fit=cover` lets the board reach
// the physical screen edges (the component pays the safe-area insets back where
// they matter), but it would also push the rest of the app's chrome under the
// notch, so the root layout keeps the default.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * The memory gauge, and nothing else. The board covers the viewport — sidebar
 * included — because it's meant to be put on the table between two players,
 * and app chrome around it is just something to mis-tap.
 *
 * Digimon-only: Union Arena has no shared resource track, so the nav entry is
 * hidden there and this route 404s (see sidebar-body.tsx).
 *
 * Entirely client-side — the gauge belongs to the game on the table in front of
 * you, not to an account, so there is nothing here to store on the server or to
 * log in for.
 */
export default async function MemoryPage({
  params,
}: {
  params: Promise<{ game: string }>;
}) {
  const { game } = await params;
  if (!isGameId(game) || game !== "digimon") notFound();

  return <MemoryBoard home={`/${game}`} />;
}
