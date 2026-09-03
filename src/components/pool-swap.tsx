"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type SwapCard = {
  card_id: string;
  code: string;
  name: string;
  image_url: string | null;
  card_type: string;
  /** deckId → quantity in that deck. */
  perDeck: Record<string, number>;
  /** Shared held count (copies you physically own in the pool). */
  owned: number;
};

type DeckLite = {
  id: string;
  name: string;
  accent_color: string;
  accent_color2: string | null;
};

/**
 * "Reassemble from deck A to deck B" helper for a shared pool. Since the decks
 * share one physical card set, switching which one you play means pulling some
 * cards out and putting others in. We diff the per-card quantities:
 *   take OUT  = max(0, qtyA − qtyB)   (A runs more copies than B)
 *   put IN    = max(0, qtyB − qtyA)   (B runs more copies than A)
 * A put-in card you don't hold enough of (owned < qtyB) is flagged.
 */
export function PoolSwap({
  game,
  decks,
  cards,
}: {
  game: string;
  decks: DeckLite[];
  cards: SwapCard[];
}) {
  const [open, setOpen] = useState(false);
  const [aId, setAId] = useState(decks[0]?.id ?? "");
  const [bId, setBId] = useState(decks[1]?.id ?? decks[0]?.id ?? "");
  // Two physical strategies for turning assembled-A into assembled-B:
  //   edit    — keep A on the table: pull the A-only diff, slot in the B-only
  //             diff. Cheap when the decks OVERLAP a lot.
  //   rebuild — dump A entirely, PICK OUT the few cards B also uses, then add
  //             the rest of B. Cheap when the overlap is SMALL (picking a few
  //             shared cards beats surgically removing a large diff).
  // "auto" resolves to whichever handles fewer individual cards.
  const [modeChoice, setModeChoice] = useState<"auto" | "edit" | "rebuild">(
    "auto",
  );

  const dot = (d: DeckLite) =>
    d.accent_color2
      ? `linear-gradient(135deg, ${d.accent_color}, ${d.accent_color2})`
      : d.accent_color;

  const { takeOut, putIn, keep } = useMemo(() => {
    const out: { c: SwapCard; n: number }[] = [];
    const inn: { c: SwapCard; n: number; short: number }[] = [];
    const kp: { c: SwapCard; n: number }[] = [];
    for (const c of cards) {
      const qa = c.perDeck[aId] ?? 0;
      const qb = c.perDeck[bId] ?? 0;
      if (qa > qb) out.push({ c, n: qa - qb });
      else if (qb > qa)
        inn.push({ c, n: qb - qa, short: Math.max(0, qb - c.owned) });
      const shared = Math.min(qa, qb);
      if (shared > 0) kp.push({ c, n: shared });
    }
    const sort = <T extends { c: SwapCard }>(arr: T[]) =>
      arr.sort(
        (x, y) =>
          (x.c.card_type === "Digi-Egg" ? 0 : 1) -
            (y.c.card_type === "Digi-Egg" ? 0 : 1) ||
          x.c.code.localeCompare(y.c.code),
      );
    return { takeOut: sort(out), putIn: sort(inn), keep: sort(kp) };
  }, [cards, aId, bId]);

  const sameDeck = aId === bId;
  const outTotal = takeOut.reduce((s, x) => s + x.n, 0);
  const inTotal = putIn.reduce((s, x) => s + x.n, 0);
  const keepTotal = keep.reduce((s, x) => s + x.n, 0);
  // Cards you have to individually handle on the "A side" of each strategy.
  // (The put-in side is identical either way.)
  const mode: "edit" | "rebuild" =
    modeChoice === "auto"
      ? keepTotal < outTotal
        ? "rebuild"
        : "edit"
      : modeChoice;
  const aName = decks.find((d) => d.id === aId)?.name ?? "A";

  function Thumb({ c }: { c: SwapCard }) {
    return (
      <span className="w-6 h-[34px] shrink-0 rounded overflow-hidden bg-[var(--color-muted)] block">
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
    );
  }

  function Row({
    c,
    n,
    short,
  }: {
    c: SwapCard;
    n: number;
    short?: number;
  }) {
    return (
      <li>
        <Link
          href={`/${game}/card/${c.code
            .split("/")
            .map(encodeURIComponent)
            .join("/")}`}
          className="flex items-center gap-2 py-1 hover:underline"
        >
          <Thumb c={c} />
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-mono text-[var(--color-muted-fg)]">
              {c.code}
            </span>
            <span className="block truncate text-sm">{c.name}</span>
          </span>
          <span className="tabular-nums text-sm font-semibold shrink-0">
            ×{n}
          </span>
          {short && short > 0 ? (
            <span
              className="text-[10px] text-amber-500 shrink-0"
              title={`你只持有 ${c.owned} 张，组这套还差 ${short} 张`}
            >
              ⚠缺{short}
            </span>
          ) : null}
        </Link>
      </li>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 cursor-pointer text-left"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold">🔄 换组装（A → B）</span>
        <span className="text-xs text-[var(--color-muted-fg)]">
          换着玩时拆/装哪些卡
        </span>
        <span
          className={`ml-auto text-[var(--color-muted-fg)] transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
      </button>

      {open ? (
        <div className="px-3 pb-3 border-t border-[var(--color-border)] pt-3">
          {/* A → B picker */}
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <span className="text-[var(--color-muted-fg)]">从</span>
            <DeckSelect
              decks={decks}
              value={aId}
              onChange={(v) => {
                setAId(v);
                setModeChoice("auto");
              }}
              dot={dot}
            />
            <button
              type="button"
              onClick={() => {
                setAId(bId);
                setBId(aId);
                setModeChoice("auto");
              }}
              className="w-7 h-7 rounded-md border border-[var(--color-border)] hover:bg-[var(--color-muted)] cursor-pointer"
              title="对调 A / B"
              aria-label="对调"
            >
              ⇄
            </button>
            <span className="text-[var(--color-muted-fg)]">变成</span>
            <DeckSelect
              decks={decks}
              value={bId}
              onChange={(v) => {
                setBId(v);
                setModeChoice("auto");
              }}
              dot={dot}
            />
          </div>

          {sameDeck ? (
            <p className="text-sm text-[var(--color-muted-fg)] mt-3">
              选两个不同的卡组。
            </p>
          ) : (
            <>
              {/* Strategy toggle — auto-picks whichever handles fewer cards.
                  Shared-heavy pairs → edit in place; shared-light → rebuild. */}
              <div className="flex items-center gap-1 mt-3 p-0.5 border border-[var(--color-border)] rounded-lg bg-[var(--color-bg)] w-fit text-xs">
                <button
                  type="button"
                  onClick={() => setModeChoice("edit")}
                  className={`px-2.5 h-7 rounded-md cursor-pointer transition-colors ${
                    mode === "edit"
                      ? "bg-[var(--color-muted)] font-medium"
                      : "text-[var(--color-muted-fg)] hover:text-[var(--color-fg)]"
                  }`}
                  title="保持 A 不拆，抽掉差异、补上差异——共用卡多时更省事"
                >
                  🔧 拆改（动 {outTotal + inTotal} 张）
                </button>
                <button
                  type="button"
                  onClick={() => setModeChoice("rebuild")}
                  className={`px-2.5 h-7 rounded-md cursor-pointer transition-colors ${
                    mode === "rebuild"
                      ? "bg-[var(--color-muted)] font-medium"
                      : "text-[var(--color-muted-fg)] hover:text-[var(--color-fg)]"
                  }`}
                  title="把 A 整副拆散放回，只挑出 B 也要用的，再加上其余——共用卡少时更省事"
                >
                  ♻️ 重挑（动 {keepTotal + inTotal} 张）
                </button>
              </div>

              {mode === "rebuild" ? (
                <p className="text-xs text-[var(--color-muted-fg)] mt-2">
                  把「{aName}」整副拆散放回收纳，从里面<b>只挑出</b>下面左列这
                  {keepTotal} 张（B 也要用），其余整堆收走，再把右列加上。
                </p>
              ) : null}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2 mt-3">
                <div>
                  {mode === "edit" ? (
                    <div className="text-xs font-semibold text-red-500 mb-1 pb-1 border-b border-[var(--color-border)]">
                      ➖ 去掉 {outTotal} 张
                    </div>
                  ) : (
                    <div className="text-xs font-semibold text-sky-500 mb-1 pb-1 border-b border-[var(--color-border)]">
                      🔍 挑出保留 {keepTotal} 张
                    </div>
                  )}
                  {(mode === "edit" ? takeOut : keep).length ? (
                    <ul className="divide-y divide-[var(--color-border)]/40">
                      {(mode === "edit" ? takeOut : keep).map((x) => (
                        <Row key={x.c.card_id} c={x.c} n={x.n} />
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-[var(--color-muted-fg)] py-1">
                      无
                    </p>
                  )}
                </div>
                <div>
                  <div className="text-xs font-semibold text-green-600 mb-1 pb-1 border-b border-[var(--color-border)]">
                    ➕ 加上 {inTotal} 张
                  </div>
                  {putIn.length ? (
                    <ul className="divide-y divide-[var(--color-border)]/40">
                      {putIn.map((x) => (
                        <Row key={x.c.card_id} c={x.c} n={x.n} short={x.short} />
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-[var(--color-muted-fg)] py-1">
                      无
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function DeckSelect({
  decks,
  value,
  onChange,
  dot,
}: {
  decks: DeckLite[];
  value: string;
  onChange: (v: string) => void;
  dot: (d: DeckLite) => string;
}) {
  const cur = decks.find((d) => d.id === value);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] pl-2 pr-1 h-8">
      <span
        className="w-2.5 h-2.5 rounded-full shrink-0"
        style={{ background: cur ? dot(cur) : "transparent" }}
      />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-sm focus:outline-none cursor-pointer pr-1 max-w-[8rem]"
      >
        {decks.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
    </span>
  );
}
