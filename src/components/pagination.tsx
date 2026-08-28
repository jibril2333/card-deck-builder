import Link from "next/link";

/**
 * Numbered pagination, shared by the card browser and the collection.
 *
 * Both pages had prev/next and a "3 / 73" label, which is fine for three pages
 * and useless for seventy-three: reaching the end of the card list meant
 * seventy clicks, and there was no way to tell roughly where you were. This
 * shows first and last, a window around the current page, and ellipses for the
 * gaps — the usual shape, because it's the one people can already read.
 *
 * The window is a FIXED width at every position, including the ends. Sizing it
 * to whatever happens to be nearby makes the control change width as you page
 * through it, and the buttons move under the cursor you are clicking with.
 *
 * A phone is too narrow for that window plus two labelled buttons — the row
 * wrapped onto a second line — so below `sm` the arrows lose their text and a
 * shorter window is swapped in. Both windows are rendered and one is hidden in
 * CSS: the server has no idea how wide the screen is.
 *
 * The bottom margin is for the filter FAB, which floats over this corner on a
 * phone and was sitting exactly on top of 下一页 once the page was scrolled to
 * the end.
 */
export function Pagination({
  page,
  totalPages,
  hrefFor,
  className = "",
}: {
  page: number;
  totalPages: number;
  /** Build the URL for a page number, preserving the caller's own filters. */
  hrefFor: (p: number) => string;
  className?: string;
}) {
  if (totalPages <= 1) return null;

  const step =
    "h-8 min-w-8 px-2 rounded-md border border-[var(--color-border)] text-sm " +
    "inline-flex items-center justify-center transition-colors";
  const enabled = `${step} hover:bg-[var(--color-muted)]`;
  const disabled = `${step} text-[var(--color-muted-fg)] opacity-40 cursor-not-allowed`;

  const numbers = (window: (number | null)[]) =>
    window.map((p, i) =>
      p === null ? (
        <span
          key={`gap-${i}`}
          className="px-1 text-[var(--color-muted-fg)] select-none"
          aria-hidden
        >
          …
        </span>
      ) : p === page ? (
        <span
          key={p}
          aria-current="page"
          className={`${step} bg-[var(--color-accent)] text-[var(--color-accent-fg)] border-[var(--color-accent)] font-semibold tabular-nums`}
        >
          {p}
        </span>
      ) : (
        <Link key={p} href={hrefFor(p)} className={`${enabled} tabular-nums`}>
          {p}
        </Link>
      ),
    );

  return (
    <nav
      className={`mt-8 touch:mb-20 flex items-center justify-center gap-1 sm:gap-1.5 flex-wrap ${className}`}
      aria-label="分页"
    >
      {page > 1 ? (
        <Link
          href={hrefFor(page - 1)}
          className={enabled}
          rel="prev"
          aria-label="上一页"
        >
          <span aria-hidden>←</span>
          <span className="hidden sm:inline ml-1">上一页</span>
        </Link>
      ) : (
        <span className={disabled} aria-label="上一页">
          <span aria-hidden>←</span>
          <span className="hidden sm:inline ml-1">上一页</span>
        </span>
      )}

      <span className="flex items-center gap-1 sm:hidden">
        {numbers(pageWindow(page, totalPages, 5))}
      </span>
      <span className="hidden sm:flex items-center gap-1.5">
        {numbers(pageWindow(page, totalPages))}
      </span>

      {page < totalPages ? (
        <Link
          href={hrefFor(page + 1)}
          className={enabled}
          rel="next"
          aria-label="下一页"
        >
          <span className="hidden sm:inline mr-1">下一页</span>
          <span aria-hidden>→</span>
        </Link>
      ) : (
        <span className={disabled} aria-label="下一页">
          <span className="hidden sm:inline mr-1">下一页</span>
          <span aria-hidden>→</span>
        </span>
      )}
    </nav>
  );
}

/**
 * The page numbers to draw: always first and last, a run around `page`, and
 * `null` wherever a gap was skipped.
 *
 * `mid` is the number of SLOTS between the two ends, counting the ellipses, so
 * the control is the same width at every position. That is the point of the
 * arithmetic below: near an end there is no gap on that side, and the slot it
 * would have taken is given back to the run instead of just disappearing —
 * otherwise the control is a button narrower on the first three pages than in
 * the middle, and the numbers shift under the cursor as you page through.
 */
export function pageWindow(
  page: number,
  total: number,
  mid = 7,
): (number | null)[] {
  const MID = mid;
  if (total <= MID + 2) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  // A run of exactly MID pages inside (1, total), pushed off the ends rather
  // than shortened.
  let start = page - Math.floor(MID / 2);
  let end = start + MID - 1;
  if (start < 2) {
    start = 2;
    end = start + MID - 1;
  }
  if (end > total - 1) {
    end = total - 1;
    start = end - MID + 1;
  }

  const out: (number | null)[] = [1];
  let from = start;
  let to = end;
  // Each ellipsis costs one slot, taken from the run's own end.
  if (start > 2) {
    out.push(null);
    from = start + 1;
  }
  if (end < total - 1) to = end - 1;
  for (let p = from; p <= to; p++) out.push(p);
  if (end < total - 1) out.push(null);
  out.push(total);
  return out;
}
