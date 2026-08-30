"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Returning to a long list without losing your place — and without asking the
 * browser's history where you came from.
 *
 * "← 全部卡组" names where it goes, so it has to go there: `router.back()`
 * lands on the deck list only when the deck list is the entry behind you, and
 * arriving at a deck any other way (a card page, then the list, then an
 * import) sent it somewhere else entirely. But a plain <Link> is a forward
 * navigation, and the router scrolls those to the top, which is how you lose
 * your place in seventy decks.
 *
 * So the two halves are separated: the link is an ordinary link, and the
 * position is remembered here. `ScrollMemory` writes the list's offset while
 * you scroll it; `RestoreScrollLink` marks the return trip; the next mount of
 * that same list scrolls back and clears the mark. Nothing consults history,
 * so nothing can be wrong about it.
 */
const FLAG = "cdb:scroll-restore";
const key = (id: string) => `cdb:scroll:${id}`;

export function ScrollMemory({ id }: { id: string }) {
  useEffect(() => {
    let armed = false;
    try {
      armed = sessionStorage.getItem(FLAG) === id;
      if (armed) sessionStorage.removeItem(FLAG);
    } catch {
      // Storage disabled: no memory, no restore, no error.
    }
    if (armed) {
      let y = 0;
      try {
        y = Number(sessionStorage.getItem(key(id)) ?? 0);
      } catch {}
      // Two frames: the router resets the scroll on a forward navigation, and
      // this has to land after that rather than before it.
      if (y > 0) {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => window.scrollTo(0, y)),
        );
      }
    }

    let pending = 0;
    const onScroll = () => {
      if (pending) return;
      pending = window.setTimeout(() => {
        pending = 0;
        try {
          sessionStorage.setItem(key(id), String(window.scrollY));
        } catch {}
      }, 150);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (pending) clearTimeout(pending);
    };
  }, [id]);

  return null;
}

/** A link back to a list that `ScrollMemory` is watching. */
export function RestoreScrollLink({
  id,
  href,
  className,
  children,
}: {
  /** Must match the `id` given to that list's ScrollMemory. */
  id: string;
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        try {
          sessionStorage.setItem(FLAG, id);
        } catch {}
      }}
    >
      {children}
    </Link>
  );
}
