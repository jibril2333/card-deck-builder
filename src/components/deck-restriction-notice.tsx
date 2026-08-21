import type { DeckRestrictionIssue } from "@/lib/db/digimon";

/**
 * What the current banlist disagrees with in this deck.
 *
 * Reports; never edits. `clampQuantityToRestriction` caps quantities as they're
 * WRITTEN, so a deck built before a restriction moved keeps its four copies
 * until someone touches that card — and touching it collapses the stack to the
 * cap in one click. Neither of those is something to do behind the owner's
 * back, so this says what's wrong and leaves the fixing to them.
 *
 * It says ONLY that: which card is capped at what, or which two can't share a
 * deck. The box used to open with "现行禁限表与这副卡组有 N 处冲突 —— 不会自动
 * 修改,请自行调整" and close with a paragraph about the clamp; both described
 * the feature rather than the deck, and a red box full of card codes already
 * reads as "these are a problem".
 */
export function DeckRestrictionNotice({
  issues,
}: {
  issues: DeckRestrictionIssue[];
}) {
  if (issues.length === 0) return null;

  const banned = issues.filter(
    (i) => i.kind === "over_limit" && i.max_count === 0,
  ) as Extract<DeckRestrictionIssue, { kind: "over_limit" }>[];
  const over = issues.filter(
    (i) => i.kind === "over_limit" && i.max_count > 0,
  ) as Extract<DeckRestrictionIssue, { kind: "over_limit" }>[];
  const pairs = issues.filter((i) => i.kind === "pair") as Extract<
    DeckRestrictionIssue,
    { kind: "pair" }
  >[];

  return (
    <div
      role="status"
      aria-label="禁限提醒"
      className="mt-3 rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-2 text-xs flex flex-wrap items-center gap-x-4 gap-y-1"
    >
      {banned.map((b) => (
        <span key={b.code}>
          <span className="font-mono">{b.code}</span> {b.name}{" "}
          <b className="text-red-400">禁卡</b>
        </span>
      ))}
      {over.map((o) => (
        <span key={o.code}>
          <span className="font-mono">{o.code}</span> {o.name}{" "}
          <b className="text-red-400">限 {o.max_count}</b>{" "}
          <span className="text-[var(--color-muted-fg)]">
            (现有 {o.quantity})
          </span>
        </span>
      ))}
      {pairs.map((p) => (
        <span key={`${p.with_code}-${p.code}`}>
          <span className="font-mono">{p.code}</span> {p.name}{" "}
          <b className="text-red-400">不能与</b>{" "}
          <span className="font-mono">{p.with_code}</span> {p.with_name}{" "}
          <b className="text-red-400">同组</b>
        </span>
      ))}
    </div>
  );
}
