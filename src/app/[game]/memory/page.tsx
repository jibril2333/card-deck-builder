import { notFound } from "next/navigation";
import { isGameId } from "@/lib/games";
import { MemoryBoard } from "@/components/memory-board";

export const metadata = { title: "内存条" };

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
