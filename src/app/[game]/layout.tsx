import { notFound } from "next/navigation";
import { isGameId, GAMES } from "@/lib/games";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ game: string }>;
}) {
  const { game } = await params;
  if (!isGameId(game)) return {};
  return { title: `${GAMES[game].label} · Deck Builder` };
}

export default async function GameLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ game: string }>;
}) {
  const { game } = await params;
  if (!isGameId(game)) notFound();
  return <>{children}</>;
}
