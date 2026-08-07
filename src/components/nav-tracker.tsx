"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { noteNavigation } from "@/lib/nav-depth";

/**
 * Counts client-side navigations for `BackLink`. Mounted once in the layout.
 *
 * Only CHANGES count — the first render is the page you arrived on, and there
 * is nothing behind it.
 */
export function NavTracker() {
  const pathname = usePathname();
  const last = useRef(pathname);

  useEffect(() => {
    if (last.current !== pathname) {
      last.current = pathname;
      noteNavigation();
    }
  }, [pathname]);

  return null;
}
