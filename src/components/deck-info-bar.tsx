"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { clearImportReportAction } from "@/app/[game]/actions";
import type { ImportReport } from "@/lib/import-report";
import type { DeckRestrictionIssue } from "@/lib/db/digimon";

/**
 * Everything wrong with this deck, in one place above 卡组分布.
 *
 * Three unrelated complaints used to live in three unrelated spots: the
 * banlist notice under the counts row, the deck-size shortfall as red words
 * inside the counts themselves, and the import's "couldn't place these" as
 * prose stuffed into the owner's notes field. Same question in all three
 * cases — "what's not right here?" — so they answer it together, and when
 * there's nothing to say the whole bar is absent rather than reassuring.
 *
 * Each line is the fact and nothing else: a card and a number, a code that
 * doesn't exist. What to DO about it is the owner's call.
 */
export function DeckInfoBar({
  game,
  deckId,
  size,
  issues,
  report,
  dismissable,
}: {
  game: string;
  deckId: string;
  /** null when the deck is empty — a deck you just made isn't "wrong". */
  size: {
    main: number;
    mainTarget: number;
    eggs: number;
    eggTarget: number;
  } | null;
  issues: DeckRestrictionIssue[];
  report: ImportReport | null;
  dismissable: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const sizeBad =
    size !== null &&
    (size.main !== size.mainTarget || size.eggs > size.eggTarget);
  if (!sizeBad && issues.length === 0 && !report) return null;

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

  function dismiss() {
    start(async () => {
      const fd = new FormData();
      fd.set("game", game);
      fd.set("deck_id", deckId);
      await clearImportReportAction(fd);
      router.refresh();
    });
  }

  const row = "flex flex-wrap items-baseline gap-x-2 gap-y-0.5";
  const tag = "text-[var(--color-muted-fg)] shrink-0";
  const code = "font-mono";

  return (
    <div
      role="status"
      aria-label="卡组信息"
      className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs space-y-1.5"
    >
      {sizeBad && size ? (
        <div className={row}>
          <span className={tag}>数量</span>
          {size.main !== size.mainTarget ? (
            <span>
              主卡组 <b className="text-amber-500">{size.main}</b> /{" "}
              {size.mainTarget}
            </span>
          ) : null}
          {size.eggs > size.eggTarget ? (
            <span>
              蛋卡 <b className="text-amber-500">{size.eggs}</b> /{" "}
              {size.eggTarget}
            </span>
          ) : null}
        </div>
      ) : null}

      {banned.map((b) => (
        <div key={`b-${b.code}`} className={row}>
          <span className={tag}>禁限</span>
          <span>
            <span className={code}>{b.code}</span> {b.name}{" "}
            <b className="text-red-400">禁卡</b>
          </span>
        </div>
      ))}
      {over.map((o) => (
        <div key={`o-${o.code}`} className={row}>
          <span className={tag}>禁限</span>
          <span>
            <span className={code}>{o.code}</span> {o.name}{" "}
            <b className="text-red-400">限 {o.max_count}</b>{" "}
            <span className={tag}>(现有 {o.quantity})</span>
          </span>
        </div>
      ))}
      {pairs.map((p) => (
        <div key={`p-${p.code}-${p.with_code}`} className={row}>
          <span className={tag}>禁限</span>
          <span>
            <span className={code}>{p.code}</span> {p.name}{" "}
            <b className="text-red-400">不能与</b>{" "}
            <span className={code}>{p.with_code}</span> {p.with_name}{" "}
            <b className="text-red-400">同组</b>
          </span>
        </div>
      ))}

      {report ? (
        <div className="space-y-1 border-t border-[var(--color-border)] pt-1.5">
          {report.missing?.length ? (
            <div className={row}>
              <span className={tag}>未收录</span>
              <span className="space-x-2">
                {report.missing.map((m) => (
                  <span key={m.code}>
                    <span className={code}>{m.code}</span> ×{m.qty}
                  </span>
                ))}
              </span>
            </div>
          ) : null}
          {report.banned?.length ? (
            <div className={row}>
              <span className={tag}>禁卡未导入</span>
              <span className="space-x-2">
                {report.banned.map((m) => (
                  <span key={m.code}>
                    <span className={code}>{m.code}</span> ×{m.qty}
                  </span>
                ))}
              </span>
            </div>
          ) : null}
          {report.capped?.length ? (
            <div className={row}>
              <span className={tag}>导入时截到上限</span>
              <span className="space-x-2">
                {report.capped.map((m) => (
                  <span key={m.code}>
                    <span className={code}>{m.code}</span> {m.from}→{m.to}
                  </span>
                ))}
              </span>
            </div>
          ) : null}
          {report.pairs?.length ? (
            <div className={row}>
              <span className={tag}>互斥未导入</span>
              <span className="space-x-2">
                {report.pairs.map((m) => (
                  <span key={m.code}>
                    <span className={code}>{m.code}</span>
                    <span className={tag}>（与 {m.with}）</span>
                  </span>
                ))}
              </span>
            </div>
          ) : null}
          {report.unparsed?.length ? (
            <div className={row}>
              <span className={tag}>没读懂 {report.unparsed.length} 行</span>
              <span className="font-mono opacity-70 truncate max-w-full">
                {report.unparsed[0]}
              </span>
            </div>
          ) : null}
          {dismissable ? (
            <button
              type="button"
              onClick={dismiss}
              disabled={pending}
              className="mt-0.5 h-6 px-2 rounded-md border border-[var(--color-border)] hover:bg-[var(--color-muted)] cursor-pointer disabled:opacity-60"
            >
              知道了
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
