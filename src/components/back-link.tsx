"use client";

import { useRouter } from "next/navigation";
import { hasInAppHistory } from "@/lib/nav-depth";

/**
 * "Back" link that returns to wherever you actually came from.
 *
 * Only for a link whose label says "back". A link that NAMES a destination
 * ("← 全部卡组") has to be an ordinary `<Link>` to that destination: history
 * is not a promise about where you were, and after card page → deck list →
 * import → deck, "back" was the card page while the label said otherwise.
 *
 * It prefers real browser history (`router.back()`), which restores the
 * previous page's scroll position and search filters and always lands on the
 * page you navigated from — deck, search, collection, whatever. It only falls
 * back to the explicit `fallback` URL when there's genuinely nothing to go
 * back to (the card was opened as the first page in the tab) or the previous
 * entry is on another site (e.g. a shared card link clicked from a chat app),
 * in which case staying inside the app is friendlier than leaving it.
 *
 * Why not `document.referrer`: it's only set on full document loads, so with
 * Next's client-side navigation (search → card, deck → card) it goes stale or
 * empty and mis-decides — which made "back" sometimes jump to search even when
 * you came from a deck.
 */
export function BackLink({
  fallback,
  children,
  className,
}: {
  fallback: string;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();

  function canGoBack(): boolean {
    if (typeof window === "undefined") return false;
    // The previous entry has to be one WE pushed. `history.length` can't tell
    // you that: a tab opened straight onto a shared link already reports 2
    // (about:blank plus the page), so this used to go back to about:blank and
    // the link looked dead. See `nav-depth`.
    if (!hasInAppHistory()) return false;
    // Don't hop to another site. An empty referrer means same-tab SPA nav or
    // a refresh/typed URL within the app, which is safe to go back through;
    // a cross-origin referrer means we arrived from outside, so we'd rather
    // land on the in-app fallback than bounce the user off the site.
    const ref = document.referrer;
    return ref === "" || ref.startsWith(window.location.origin);
  }

  return (
    <a
      href={fallback}
      onClick={(e) => {
        if (canGoBack()) {
          e.preventDefault();
          router.back();
        }
      }}
      className={className}
    >
      {children}
    </a>
  );
}
