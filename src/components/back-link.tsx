"use client";

import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";

/**
 * 返回链接：优先用浏览器历史 (router.back())，保留原页面的滚动位置和搜索筛选。
 * 如果用户直接进入此页（没有同源 referrer），fallback 到指定 URL。
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
  // `document.referrer` is set once at navigation time and never changes for
  // this mount, so we use a no-op `subscribe` and rely on the initial snapshot.
  // The server snapshot is `false` (no document on the server) which keeps
  // SSR's HTML stable — the actual value is filled in on hydration.
  const canGoBack = useSyncExternalStore(
    () => () => {},
    () => document.referrer.startsWith(window.location.origin),
    () => false,
  );

  return (
    <a
      href={fallback}
      onClick={(e) => {
        if (canGoBack) {
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
