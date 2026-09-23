import type { GameId } from "@/lib/games";
import { getCurrentUser } from "@/lib/auth/session";
import { SidebarBody } from "@/components/sidebar-body";
import { buildInfo } from "@/lib/build-info";

/**
 * Server wrapper for the app sidebar: fetches the current user, then hands off to the client SidebarBody (which owns active-route
 * highlighting and the mobile drawer). Rendered once by the [game] layout.
 */
export async function Sidebar({ game }: { game: GameId }) {
  const user = await getCurrentUser();
  return (
    <SidebarBody
      game={game}
      loggedIn={!!user}
      user={user}
      build={buildInfo()}
    />
  );
}
