import type { DeckRestrictionIssue } from "@/lib/db/digimon";

/**
 * What the current banlist disagrees with in this deck.
 *
 * Reports; never edits. `clampQuantityToRestriction` caps quantities as they're
 * WRITTEN, so a deck built before a restriction moved keeps its four copies
 * until someone touches that card — and touching it collapses the stack to the
 * cap in one click. Neither of those is something to do to a deck behind its
 * owner's back, so this says what's wrong and leaves the fixing to them.
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
      className="mt-3 rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-2 text-xs space-y-1"
    >
      <div className="font-medium text-red-400">
        现行禁限表与这副卡组有 {issues.length} 处冲突 —— 不会自动修改,请自行调整
      </div>
      {banned.length ? (
        <div>
          <span className="text-red-400">禁卡</span>{" "}
          {banned.map((b) => (
            <span key={b.code} className="mr-2">
              <span className="font-mono">{b.code}</span> {b.name}
              <span className="text-[var(--color-muted-fg)]"> ×{b.quantity}</span>
            </span>
          ))}
        </div>
      ) : null}
      {over.length ? (
        <div>
          <span className="text-red-400">超出上限</span>{" "}
          {over.map((o) => (
            <span key={o.code} className="mr-2">
              <span className="font-mono">{o.code}</span> {o.name}
              <span className="text-[var(--color-muted-fg)]">
                {" "}
                {o.quantity} / {o.max_count}
              </span>
            </span>
          ))}
        </div>
      ) : null}
      {pairs.length ? (
        <div>
          <span className="text-red-400">禁卡组合</span>{" "}
          {pairs.map((p) => (
            <span key={`${p.with_code}-${p.code}`} className="mr-2">
              <span className="font-mono">{p.code}</span> {p.name}
              <span className="text-[var(--color-muted-fg)]">
                {" "}
                不能与 <span className="font-mono">{p.with_code}</span>{" "}
                {p.with_name} 同组
              </span>
            </span>
          ))}
        </div>
      ) : null}
      {/* Said out loud because the app clamps elsewhere and the difference
          matters: nothing here has been removed from the deck. */}
      <div className="text-[var(--color-muted-fg)]">
        提示:在组建模式下改这些卡的数量时,系统会把它截到上限 —— 4 张的卡按一次
        加减都会直接变成上限张数。
      </div>
    </div>
  );
}
