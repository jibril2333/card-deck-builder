"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GAMES, type GameId } from "@/lib/games";
import { cn } from "@/lib/utils";
import { UserMenu } from "@/components/user-menu";
import { CardLangSwitcher } from "@/components/card-lang-switcher";
import type { CardLang } from "@/lib/card-lang";

type NavId = "search" | "decks" | "collection" | "restrictions" | "about";

const NAV: { id: NavId; label: string; icon: string; sub: string }[] = [
  { id: "search", label: "卡牌检索", icon: "🔍", sub: "Cards" },
  { id: "decks", label: "我的卡组", icon: "🗂️", sub: "Decks" },
  { id: "collection", label: "已收集", icon: "📦", sub: "Collection" },
  { id: "restrictions", label: "禁制限卡", icon: "🚫", sub: "Banlist" },
  { id: "about", label: "游戏知识", icon: "📖", sub: "About" },
];

function hrefFor(id: NavId, game: string): string {
  return id === "search" ? `/${game}` : `/${game}/${id}`;
}

/** Which nav item the current path belongs to. */
function activeFor(pathname: string, game: string): NavId {
  const base = `/${game}`;
  if (pathname.startsWith(`${base}/decks`) || pathname.startsWith(`${base}/groups`))
    return "decks";
  if (pathname.startsWith(`${base}/collection`)) return "collection";
  if (pathname.startsWith(`${base}/restrictions`)) return "restrictions";
  if (pathname.startsWith(`${base}/about`)) return "about";
  return "search"; // /[game], /[game]/card/... and fallbacks
}

/**
 * Left sidebar shell (uptcg-style): brand, game switcher, section nav with
 * icons, and — pinned to the bottom — the card-language switcher and user
 * menu. On desktop it's a sticky full-height column; on phones it collapses
 * to a top bar with a slide-in drawer.
 */
export function SidebarBody({
  game,
  loggedIn,
  cardLang,
  user,
}: {
  game: GameId;
  loggedIn: boolean;
  cardLang: CardLang;
  user: React.ComponentProps<typeof UserMenu>["user"] | null;
}) {
  const pathname = usePathname() ?? `/${game}`;
  const active = activeFor(pathname, game);
  const [open, setOpen] = useState(false);

  // Collection is the current user's own — hide it for anon.
  const items = loggedIn ? NAV : NAV.filter((n) => n.id !== "collection");

  const brand = (
    <Link href="/" className="flex items-center gap-2 min-w-0">
      <span
        aria-hidden
        className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
        style={{ background: GAMES[game].accent }}
      />
      <span className="font-semibold tracking-tight truncate">
        Card Deck Builder
      </span>
    </Link>
  );

  const gameSwitcher = (
    <div className="flex gap-1 p-0.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]">
      {(Object.values(GAMES) as (typeof GAMES)[GameId][]).map((g) => {
        const isActive = g.id === game;
        return (
          <Link
            key={g.id}
            href={`/${g.id}`}
            onClick={() => setOpen(false)}
            className={cn(
              "flex-1 px-2 h-8 rounded-md text-sm flex items-center justify-center gap-1.5 transition-colors",
              isActive
                ? "font-medium"
                : "text-[var(--color-muted-fg)] hover:text-[var(--color-fg)]",
            )}
            style={isActive ? { background: `${g.accent}22`, color: g.accent } : undefined}
          >
            <span aria-hidden>{g.emoji}</span>
            <span className="truncate">{g.label}</span>
          </Link>
        );
      })}
    </div>
  );

  const navList = (
    <nav className="flex flex-col gap-0.5">
      <div className="px-2 pb-1 text-[10px] uppercase tracking-wider text-[var(--color-muted-fg)]">
        选单
      </div>
      {items.map((n) => {
        const isActive = n.id === active;
        return (
          <Link
            key={n.id}
            href={hrefFor(n.id, game)}
            onClick={() => setOpen(false)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 px-2.5 h-10 rounded-lg text-sm transition-colors",
              isActive
                ? "bg-[var(--color-accent)]/12 text-[var(--color-accent)] font-medium"
                : "text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] hover:bg-[var(--color-muted)]",
            )}
          >
            <span aria-hidden className="text-base leading-none w-5 text-center">
              {n.icon}
            </span>
            <span>{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="flex flex-col gap-2">
      {game === "digimon" ? <CardLangSwitcher current={cardLang} /> : null}
      {user ? (
        <UserMenu user={user} />
      ) : (
        <Link
          href="/login"
          onClick={() => setOpen(false)}
          className="text-sm text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] border border-[var(--color-border)] rounded-lg px-3 h-9 flex items-center gap-2"
        >
          <span aria-hidden>👤</span> 登录
        </Link>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop: sticky full-height column */}
      <aside className="hidden lg:flex lg:flex-col lg:w-60 lg:shrink-0 lg:h-screen lg:sticky lg:top-0 border-r border-[var(--color-border)] bg-[var(--color-card)] px-3 py-4 gap-4">
        <div className="px-1">{brand}</div>
        {gameSwitcher}
        <div className="flex-1 overflow-y-auto no-scrollbar">{navList}</div>
        {footer}
      </aside>

      {/* Mobile: sticky top bar */}
      <div className="lg:hidden sticky top-0 z-30 backdrop-blur bg-[var(--color-bg)]/85 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2 h-14 px-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="打开菜单"
            className="w-9 h-9 rounded-md border border-[var(--color-border)] flex items-center justify-center text-lg cursor-pointer"
          >
            ☰
          </button>
          {brand}
          <div className="ml-auto flex items-center gap-2">
            {game === "digimon" ? <CardLangSwitcher current={cardLang} /> : null}
          </div>
        </div>
      </div>

      {/* Mobile: slide-in drawer */}
      {open ? (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-64 max-w-[80%] h-full bg-[var(--color-card)] border-r border-[var(--color-border)] px-3 py-4 flex flex-col gap-4 overflow-y-auto">
            <div className="flex items-center justify-between">
              {brand}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="关闭"
                className="w-8 h-8 rounded-md hover:bg-[var(--color-muted)] cursor-pointer text-lg"
              >
                ×
              </button>
            </div>
            {gameSwitcher}
            <div className="flex-1">{navList}</div>
            {footer}
          </div>
        </div>
      ) : null}
    </>
  );
}
