import { notFound } from "next/navigation";
import { isGameId } from "@/lib/games";
import { isAdmin } from "@/lib/auth/admin";
import { RefreshCardsPanel } from "@/components/refresh-cards-panel";

export const dynamic = "force-dynamic";

export default async function AdminPage({
  params,
}: {
  params: Promise<{ game: string }>;
}) {
  const { game } = await params;
  if (!isGameId(game)) notFound();
  // 404 rather than a 403 page: non-admins shouldn't learn this route exists.
  if (!(await isAdmin())) notFound();

  return (
    <main className="w-full mx-auto max-w-3xl px-4 sm:px-6 py-6 space-y-4">
      <h1 className="text-lg font-semibold">管理</h1>
      <RefreshCardsPanel />
    </main>
  );
}
