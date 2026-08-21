import { cookies } from "next/headers";
import type { GameId } from "@/lib/games";
import { getCurrentUser } from "@/lib/auth/session";
import { CARD_LANG_COOKIE, parseCardLang } from "@/lib/card-lang";
import { SidebarBody } from "@/components/sidebar-body";
import { buildInfo } from "@/lib/build-info";

/**
 * Server wrapper for the app sidebar: fetches the current user + card-language
 * cookie, then hands off to the client SidebarBody (which owns active-route
 * highlighting and the mobile drawer). Rendered once by the [game] layout.
 */
export async function Sidebar({ game }: { game: GameId }) {
  const user = await getCurrentUser();
  const cardLang = parseCardLang(
    (await cookies()).get(CARD_LANG_COOKIE)?.value,
  );
  return (
    <SidebarBody
      game={game}
      loggedIn={!!user}
      cardLang={cardLang}
      user={user}
      build={buildInfo()}
    />
  );
}
