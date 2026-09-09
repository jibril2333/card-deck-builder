/**
 * 共享卡池 的对照表:每张卡一行,每副成员卡组一列。
 *
 * Eggs and mains share ONE table so their columns line up — two tables size
 * their columns independently and the decks stop lining up between them. A
 * full-width label row separates the sections.
 *
 * Two layouts, both rendered, one shown (`.pool-wide` / `.pool-blocks` in
 * globals.css). A column per deck plus 需备 / 持有 / 缺 is 591px of table in a
 * 358px phone viewport, and the three columns pushed off the edge are the ones
 * the page exists to answer. The phone therefore gets a block per card with
 * the same numbers stacked instead of spread. Deciding in CSS rather than in
 * JavaScript costs a second copy of the rows — including a second, hidden
 * `PoolHeldStepper` per card — and buys a server-rendered page that is correct
 * before hydration and does not reflow when it arrives.
 *
 * Its own file because it was declared inside the page's render, which makes
 * it a new component type on every render.
 */
import Link from "next/link";
import { Fragment } from "react";
import { PoolHeldStepper } from "@/components/pool-held-stepper";

export type PoolRow = {
  card_id: string;
  code: string;
  name: string;
  image_url: string | null;
  /** deck id → copies that deck runs. */
  perDeck: Record<string, number>;
  /** The largest of those — what the pool has to own. */
  need: number;
  /** Shared held count. */
  owned: number;
  /** need − owned, floored at 0. */
  missing: number;
  /** How many member decks run this card. */
  deckCount: number;
};

export type PoolDeck = {
  id: string;
  name: string;
  accent_color: string;
  accent_color2: string | null;
};

const deckColor = (d: PoolDeck) =>
  d.accent_color2
    ? `linear-gradient(135deg, ${d.accent_color}, ${d.accent_color2})`
    : d.accent_color;

export function PoolTable({
  game,
  groupId,
  memberDecks,
  eggs,
  mains,
}: {
  game: string;
  groupId: string;
  memberDecks: PoolDeck[];
  eggs: PoolRow[];
  mains: PoolRow[];
}) {
  const colCount = 1 + memberDecks.length + 3;
  const sections: { label: string; rows: PoolRow[] }[] = [];
  if (eggs.length) sections.push({ label: "蛋卡", rows: eggs });
  sections.push({ label: eggs.length ? "主卡组" : "", rows: mains });
  return (
    <>
      <div className="pool-wide overflow-x-auto mt-5">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-xs text-[var(--color-muted-fg)] border-b border-[var(--color-border)]">
              <th className="py-1.5 pr-3">卡</th>
              {memberDecks.map((d) => (
                <th key={d.id} className="py-1.5 px-1.5 text-center">
                  <span className="inline-flex items-center gap-1">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: deckColor(d) }}
                    />
                    <span className="max-w-[6rem] truncate">{d.name}</span>
                  </span>
                </th>
              ))}
              <th className="py-1.5 px-2 text-center font-semibold text-[var(--color-fg)]">
                需备
              </th>
              <th className="py-1.5 px-2 text-center whitespace-nowrap">
                持有(共享)
              </th>
              <th className="py-1.5 px-2 text-center">缺</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((sec) => (
              <Fragment key={sec.label || "main"}>
                {sec.label ? (
                  <tr>
                    <td
                      colSpan={colCount}
                      className="pt-3 pb-1 text-xs font-semibold text-[var(--color-muted-fg)]"
                    >
                      {sec.label}
                    </td>
                  </tr>
                ) : null}
                {sec.rows.map((c) => (
                  <CardRow
                    key={c.card_id}
                    c={c}
                    game={game}
                    groupId={groupId}
                    memberDecks={memberDecks}
                  />
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pool-blocks mt-4">
        {sections.map((sec) => (
          <Fragment key={sec.label || "main"}>
            {sec.label ? (
              <div className="pt-3 pb-1 text-xs font-semibold text-[var(--color-muted-fg)]">
                {sec.label}
              </div>
            ) : null}
            <ul>
              {sec.rows.map((c) => (
                <CardBlock
                  key={c.card_id}
                  c={c}
                  game={game}
                  groupId={groupId}
                  memberDecks={memberDecks}
                />
              ))}
            </ul>
          </Fragment>
        ))}
      </div>
    </>
  );
}

function CardRow({
  c,
  game,
  groupId,
  memberDecks,
}: {
  c: PoolRow;
  game: string;
  groupId: string;
  memberDecks: PoolDeck[];
}) {
  return (
    <tr
      className={`border-b border-[var(--color-border)]/50 ${
        c.deckCount > 1 ? "bg-[var(--color-accent)]/5" : ""
      }`}
    >
      <td className="py-1.5 pr-3">
        <Link
          href={`/${game}/card/${c.code
            .split("/")
            .map(encodeURIComponent)
            .join("/")}`}
          className="flex items-center gap-2 hover:underline"
        >
          {/* Fixed width+height (not aspect-ratio): the thumbnail is a flex
              item, and aspect-ratio + a %-height <img> on a flex item is a
              circular dependency that collapses the image. */}
          <span className="w-7 h-10 shrink-0 rounded overflow-hidden bg-[var(--color-muted)] block">
            {c.image_url ? (
              <img
                src={c.image_url}
                alt={c.name}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : null}
          </span>
          <span className="min-w-0">
            <span className="block text-[10px] font-mono text-[var(--color-muted-fg)]">
              {c.code}
            </span>
            <span className="block truncate">{c.name}</span>
          </span>
        </Link>
      </td>
      {memberDecks.map((d) => {
        const q = c.perDeck[d.id] ?? 0;
        const binds = q === c.need && q > 0;
        return (
          <td
            key={d.id}
            className={`py-1.5 px-1.5 text-center tabular-nums ${
              q === 0
                ? "text-[var(--color-border)]"
                : binds
                  ? "font-bold text-[var(--color-fg)]"
                  : "text-[var(--color-muted-fg)]"
            }`}
          >
            {q === 0 ? "·" : q}
          </td>
        );
      })}
      <td className="py-1.5 px-2 text-center tabular-nums font-bold">
        {c.need}
      </td>
      <td className="py-1.5 px-2 text-center">
        <PoolHeldStepper
          game={game}
          groupId={groupId}
          cardId={c.card_id}
          owned={c.owned}
          need={c.need}
        />
      </td>
      <td
        className={`py-1.5 px-2 text-center tabular-nums ${
          c.missing > 0
            ? "text-red-500 font-medium"
            : "text-[var(--color-muted-fg)]"
        }`}
      >
        {c.missing > 0 ? c.missing : "✓"}
      </td>
    </tr>
  );
}

/**
 * 手机布局:一张卡一块。
 *
 * Same three numbers as the table's right-hand columns, arranged down instead
 * of across: 需备 and 缺 sit beside the name, the shared held stepper and the
 * per-deck counts share the line below. A deck that does not run the card
 * keeps its dot at low opacity rather than disappearing, so the decks stay in
 * the same order on every block and can be read down the list.
 */
function CardBlock({
  c,
  game,
  groupId,
  memberDecks,
}: {
  c: PoolRow;
  game: string;
  groupId: string;
  memberDecks: PoolDeck[];
}) {
  const href = `/${game}/card/${c.code
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
  return (
    <li
      className={`flex gap-2 py-2 border-b border-[var(--color-border)]/50 ${
        c.deckCount > 1 ? "bg-[var(--color-accent)]/5" : ""
      }`}
    >
      <Link
        href={href}
        className="w-10 h-14 shrink-0 rounded overflow-hidden bg-[var(--color-muted)] block"
      >
        {c.image_url ? (
          <img
            src={c.image_url}
            alt={c.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        ) : null}
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <Link href={href} className="min-w-0 flex-1">
            <span className="block text-[10px] font-mono text-[var(--color-muted-fg)]">
              {c.code}
            </span>
            <span className="block truncate text-sm">{c.name}</span>
          </Link>
          <span className="shrink-0 text-xs tabular-nums text-[var(--color-muted-fg)]">
            需备{" "}
            <span className="font-bold text-[var(--color-fg)]">{c.need}</span>
            {" · 缺 "}
            <span
              className={c.missing > 0 ? "text-red-500 font-medium" : undefined}
            >
              {c.missing > 0 ? c.missing : "✓"}
            </span>
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--color-muted-fg)]">
            {memberDecks.map((d) => {
              const q = c.perDeck[d.id] ?? 0;
              const binds = q === c.need && q > 0;
              return (
                <span
                  key={d.id}
                  className={`inline-flex items-center gap-1 ${
                    q === 0 ? "opacity-40" : ""
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: deckColor(d) }}
                  />
                  <span className="max-w-[5rem] truncate">{d.name}</span>
                  <span
                    className={`tabular-nums ${
                      binds ? "font-bold text-[var(--color-fg)]" : ""
                    }`}
                  >
                    {q}
                  </span>
                </span>
              );
            })}
          </div>
          <PoolHeldStepper
            game={game}
            groupId={groupId}
            cardId={c.card_id}
            owned={c.owned}
            need={c.need}
          />
        </div>
      </div>
    </li>
  );
}
