import { notFound } from "next/navigation";
import { isGameId } from "@/lib/games";
import { MemoryGauge } from "@/components/memory-gauge";

export const metadata = { title: "记忆条" };

/**
 * A standalone memory gauge, for tracking a real game.
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

  return (
    <main className="w-full mx-auto max-w-[640px] px-4 sm:px-6 py-6">
      <h1 className="text-2xl font-bold">记忆条</h1>
      <p className="text-sm text-[var(--color-muted-fg)] mt-1 mb-5">
        双方共用一条 10–0–10 的记忆条。打牌、进化要花记忆，指示物就往对方那侧推；
        推到 0 或对方一侧时，把当前动作结算完就换手，对方接手时手上就是自己这侧的点数。
      </p>
      <MemoryGauge />
    </main>
  );
}
