"use client";

import { useEffect, useRef, useState } from "react";
import { useTransition } from "react";
import { logoutAction } from "@/lib/auth/actions";
import type { User } from "@/lib/auth/types";

/**
 * Top-nav user avatar + dropdown. Shows the display name; clicking opens a
 * small menu with the email and a logout button.
 *
 * No 账号设置 item: account settings are part of 设置, which is two rows above
 * this in the same sidebar. A menu whose only entry duplicates a link already
 * on screen is a menu that exists to hold 登出.
 */
export function UserMenu({
  user,
  /** Sidebar rail: 56px of room, so the name goes and the menu opens right. */
  compact = false,
}: {
  user: User;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement | null>(null);

  // Click outside / ESC to close. Only attach listeners while open so we
  // don't leak document-level handlers across the lifetime of every page.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initial = user.display_name.charAt(0).toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="账号菜单"
        aria-expanded={open}
        className="h-8 px-2 rounded-md hover:bg-[var(--color-muted)] flex items-center gap-2 text-sm cursor-pointer"
      >
        <span
          aria-hidden
          className="w-6 h-6 rounded-full bg-[var(--color-accent)]/15 text-[var(--color-accent)] flex items-center justify-center text-xs font-semibold"
        >
          {initial}
        </span>
        <span
          className={`${compact ? "hidden lg:inline" : "hidden sm:inline"} truncate max-w-[120px]`}
        >
          {user.display_name}
        </span>
      </button>

      {open ? (
        // Opens UPWARD. This menu is always the last thing in the sidebar
        // footer — desktop column and mobile drawer both — so "below the
        // button" is below the viewport: it used to render 128px tall starting
        // 12px from the bottom edge, i.e. 116px of it off-screen.
        <div
          className={`absolute bottom-full mb-1 w-56 ${compact ? "left-0 lg:left-auto lg:right-0" : "right-0"} rounded-md border border-[var(--color-border)] bg-[var(--color-card)] shadow-lg overflow-hidden z-50`}
        >
          <div className="px-3 py-2 border-b border-[var(--color-border)]">
            <div className="text-sm font-medium truncate">
              {user.display_name}
            </div>
            <div className="text-xs text-[var(--color-muted-fg)] truncate">
              {user.email}
            </div>
          </div>
          <form
            action={() => {
              startTransition(async () => {
                await logoutAction();
                // logoutAction redirects to /login server-side; nothing else.
              });
            }}
          >
            <button
              type="submit"
              disabled={pending}
              className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-muted)] cursor-pointer disabled:cursor-wait"
            >
              {pending ? "登出中…" : "登出"}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
