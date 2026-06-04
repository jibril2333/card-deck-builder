import Link from "next/link";
import { GAMES, type GameId } from "@/lib/games";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/lib/auth/session";
import { UserMenu } from "@/components/user-menu";

type TopNavProps = {
  game: GameId;
  active: "search" | "decks" | "collection" | "restrictions" | "about";
};

const TABS: { id: TopNavProps["active"]; label: string; sub: string }[] = [
  { id: "search", label: "卡牌检索", sub: "Search" },
  { id: "decks", label: "我的卡组", sub: "Decks" },
  { id: "collection", label: "已收集", sub: "Collection" },
  { id: "restrictions", label: "禁制限卡", sub: "Banlist" },
  { id: "about", label: "游戏知识", sub: "About" },
];

export async function TopNav({ game, active }: TopNavProps) {
  const accent = GAMES[game].accent;
  const user = await getCurrentUser();
  // Anon: hide the personal tabs (collection is the *current* user's own,
  // which makes no sense without a user). Keep search / decks / restrictions
  // / about — those are public reads.
  const visibleTabs = user
    ? TABS
    : TABS.filter((t) => t.id !== "collection");

  return (
    <header className="sticky top-0 z-30 backdrop-blur bg-[var(--color-bg)]/80 border-b border-[var(--color-border)]">
      <div className="mx-auto max-w-7xl px-4 flex items-center justify-between h-14 gap-2 sm:gap-6">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block w-2.5 h-2.5 rounded-full"
            style={{ background: accent }}
          />
          <Link href="/" className="font-semibold tracking-tight">
            Card Deck Builder
          </Link>
        </div>

        <nav className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] p-0.5 bg-[var(--color-card)]">
          {(Object.values(GAMES) as (typeof GAMES)[GameId][]).map((g) => {
            const isActive = g.id === game;
            return (
              <Link
                key={g.id}
                href={`/${g.id}`}
                className={cn(
                  "px-3 h-8 rounded-md text-sm flex items-center gap-1.5 transition-colors",
                  isActive
                    ? "text-[var(--color-fg)] font-medium"
                    : "text-[var(--color-muted-fg)] hover:text-[var(--color-fg)]",
                )}
                style={
                  isActive
                    ? { background: `${g.accent}22`, color: g.accent }
                    : undefined
                }
              >
                <span aria-hidden>{g.emoji}</span>
                {/* Label eats width on phones — emoji alone is enough there. */}
                <span className="hidden sm:inline">{g.label}</span>
              </Link>
            );
          })}
        </nav>

        <nav className="hidden md:flex items-center gap-1 text-sm">
          {visibleTabs.map((t) => {
            const href =
              t.id === "search" ? `/${game}` : `/${game}/${t.id}`;
            const isActive = t.id === active;
            return (
              <Link
                key={t.id}
                href={href}
                className={cn(
                  "px-3 h-9 rounded-md flex items-center transition-colors",
                  isActive
                    ? "bg-[var(--color-muted)] text-[var(--color-fg)] font-medium"
                    : "text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] hover:bg-[var(--color-muted)]",
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>

        {user ? (
          <UserMenu user={user} />
        ) : (
          <Link
            href="/login"
            className="text-xs text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] border border-[var(--color-border)] rounded-md px-3 h-8 flex items-center gap-1.5"
          >
            登录
          </Link>
        )}
      </div>

      {/* Mobile tab bar: 5 tabs don't fit on a phone row, so let it scroll
          horizontally (each tab keeps its size via shrink-0) instead of
          clipping or squishing. Scrollbar hidden for a clean strip. */}
      <div className="md:hidden border-t border-[var(--color-border)]">
        <div className="mx-auto max-w-7xl px-2 flex gap-1 text-sm h-10 items-center overflow-x-auto no-scrollbar">
          {visibleTabs.map((t) => {
            const href =
              t.id === "search" ? `/${game}` : `/${game}/${t.id}`;
            const isActive = t.id === active;
            return (
              <Link
                key={t.id}
                href={href}
                className={cn(
                  "px-3 h-7 rounded-md flex items-center shrink-0 whitespace-nowrap",
                  isActive
                    ? "bg-[var(--color-muted)] font-medium"
                    : "text-[var(--color-muted-fg)]",
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
