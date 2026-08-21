import { redirect } from "next/navigation";

/**
 * The admin page became part of 设置. Kept as a redirect because the address
 * is out in the world: it's the tap target of every ntfy notification this app
 * has ever sent, and it's what anyone who bookmarked it will use.
 */
export default async function AdminPage({
  params,
}: {
  params: Promise<{ game: string }>;
}) {
  const { game } = await params;
  redirect(`/${game}/settings`);
}
