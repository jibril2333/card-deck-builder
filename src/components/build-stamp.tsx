import type { BuildInfo } from "@/lib/build-info";

/**
 * The running build, at the bottom of the sidebar under everything else.
 *
 * Deliberately the least prominent thing on the page — it's only ever read
 * when someone is asking "is this the version I just pushed?", and it answers
 * that without a click, on whichever host they happen to be looking at. The
 * commit links out; a local dev server just says 开发版.
 *
 * Takes the info as a prop rather than reading process.env itself: the
 * sidebar it lives in is a client component, so the read happens once in the
 * server wrapper (components/sidebar.tsx).
 */
export function BuildStamp({ info: b }: { info: BuildInfo }) {
  const date = b.builtAt
    ? new Date(b.builtAt).toLocaleDateString("zh-CN", {
        month: "numeric",
        day: "numeric",
        timeZone: "Asia/Tokyo",
      })
    : null;

  const text = (
    <>
      <span className="font-mono">{b.short}</span>
      {date ? <span> · {date}</span> : null}
    </>
  );

  if (!b.url) {
    return (
      <div className="px-1 text-[10px] text-[var(--color-muted-fg)]/70">
        开发版
      </div>
    );
  }
  return (
    <a
      href={b.url}
      target="_blank"
      rel="noreferrer"
      title={`版本 ${b.sha}${b.builtAt ? ` · 构建于 ${b.builtAt}` : ""}`}
      className="px-1 text-[10px] text-[var(--color-muted-fg)]/70 hover:text-[var(--color-fg)] transition-colors"
    >
      {text}
    </a>
  );
}
