"use client";

import { useMemo, useState } from "react";
import { pAtLeastOne, expectedCount } from "@/lib/probability";

/**
 * Deck playtesting: an opening-hand simulator and a hypergeometric
 * probability table ("when will I see this card?").
 *
 * Rules baked in per game:
 *   - digimon: 50-card main deck, opening hand 5, top 5 set aside as
 *     security after the hand is kept, Digi-Egg cards live in a separate
 *     egg deck and are never drawn. One mulligan (full redraw, must keep).
 *   - unionarena: 50-card deck, opening hand 7, one mulligan.
 *
 * The probability table treats "seen by turn T" as opening hand + T draws —
 * a uniform random subset of the deck (see src/lib/probability.ts), so
 * security cards don't bias it. Mulligan and search effects aren't modeled;
 * real odds are at least as good as shown.
 */

export type PlaytestCard = {
  id: string;
  code: string;
  name: string;
  image_url: string | null;
  quantity: number;
  /** Digimon Digi-Egg cards — separate deck, excluded from draws. */
  isEgg: boolean;
};

type SimCard = { key: string; card: PlaytestCard };

function shuffled(cards: SimCard[]): SimCard[] {
  const a = [...cards];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function CardFace({
  card,
  size = "md",
}: {
  card: PlaytestCard;
  size?: "md" | "sm";
}) {
  return (
    <div
      className={`${
        size === "md" ? "w-20 sm:w-24" : "w-14"
      } shrink-0 aspect-[5/7] rounded-md overflow-hidden border border-[var(--color-border)] bg-[var(--color-muted)] relative`}
      title={`${card.code} ${card.name}`}
    >
      {card.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={card.image_url}
          alt={card.name}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="p-1 text-[9px] leading-tight text-[var(--color-muted-fg)]">
          {card.code}
          <br />
          {card.name}
        </div>
      )}
    </div>
  );
}

function FaceDown({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`w-14 shrink-0 aspect-[5/7] rounded-md border border-[var(--color-border)] bg-gradient-to-br from-indigo-900 to-slate-800 flex items-center justify-center text-white/40 text-lg ${
        onClick ? "cursor-pointer hover:from-indigo-800" : ""
      }`}
      title={onClick ? "点击翻开" : undefined}
    >
      ◆
    </button>
  );
}

export function Playtest({
  game,
  cards,
}: {
  game: string;
  cards: PlaytestCard[];
}) {
  const isDigimon = game === "digimon";
  const HAND = isDigimon ? 5 : 7;
  const SECURITY = isDigimon ? 5 : 0;

  // Expand quantities into individual sim cards (main deck only).
  const pile = useMemo(() => {
    const out: SimCard[] = [];
    for (const c of cards) {
      if (c.isEgg) continue;
      for (let i = 0; i < c.quantity; i++)
        out.push({ key: `${c.id}#${i}`, card: c });
    }
    return out;
  }, [cards]);

  const eggCount = useMemo(
    () => cards.filter((c) => c.isEgg).reduce((s, c) => s + c.quantity, 0),
    [cards],
  );

  // ── simulator state ──────────────────────────────────────────────────
  type Sim = {
    hand: SimCard[];
    security: SimCard[];
    deck: SimCard[];
    revealed: boolean[]; // security face-up flags
    mulliganed: boolean;
    turnDraws: number;
  };
  const [sim, setSim] = useState<Sim | null>(null);

  function deal(): Sim {
    const d = shuffled(pile);
    const hand = d.slice(0, HAND);
    const security = d.slice(HAND, HAND + SECURITY);
    return {
      hand,
      security,
      deck: d.slice(HAND + SECURITY),
      revealed: security.map(() => false),
      mulliganed: false,
      turnDraws: 0,
    };
  }

  const canSim = pile.length >= HAND + SECURITY;

  // ── probability table ────────────────────────────────────────────────
  // Group printings by name: "any Gatomon" is what people actually ask.
  const rows = useMemo(() => {
    const byName = new Map<
      string,
      { name: string; codes: string[]; qty: number }
    >();
    for (const c of cards) {
      if (c.isEgg) continue;
      const r = byName.get(c.name) ?? { name: c.name, codes: [], qty: 0 };
      r.codes.push(c.code);
      r.qty += c.quantity;
      byName.set(c.name, r);
    }
    return [...byName.values()].sort((a, b) => b.qty - a.qty);
  }, [cards]);

  const N = pile.length;
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const pickedQty = rows
    .filter((r) => picked.has(r.name))
    .reduce((s, r) => s + r.qty, 0);

  const fmt = (p: number) => `${(p * 100).toFixed(1)}%`;
  const seenAt = (turn: number) => HAND + turn;

  return (
    <div className="flex flex-col gap-6">
      {/* ── opening hand simulator ── */}
      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="font-bold">🎲 起手模拟</h2>
          <span className="text-xs text-[var(--color-muted-fg)]">
            主卡组 {N} 张{isDigimon ? ` · 蛋卡 ${eggCount} 张(不参与抽卡)` : ""}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSim(deal())}
              disabled={!canSim}
              className="h-8 px-3 rounded-md text-sm font-medium bg-[var(--color-accent)] text-[var(--color-accent-fg)] hover:opacity-90 disabled:opacity-40 cursor-pointer"
            >
              {sim ? "重新开局" : "开局"}
            </button>
            {sim ? (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setSim((s) => {
                      if (!s || s.mulliganed || s.turnDraws > 0) return s;
                      const next = deal();
                      next.mulliganed = true;
                      return next;
                    })
                  }
                  disabled={sim.mulliganed || sim.turnDraws > 0}
                  className="h-8 px-3 rounded-md text-sm border border-[var(--color-border)] hover:bg-[var(--color-muted)] disabled:opacity-40 cursor-pointer"
                  title="调度:洗回全部手牌重抽一次(只能一次,抽完必须保留)"
                >
                  ♻️ 调度
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSim((s) => {
                      if (!s || s.deck.length === 0) return s;
                      const [top, ...rest] = s.deck;
                      return {
                        ...s,
                        hand: [...s.hand, top],
                        deck: rest,
                        turnDraws: s.turnDraws + 1,
                      };
                    })
                  }
                  disabled={sim.deck.length === 0}
                  className="h-8 px-3 rounded-md text-sm border border-[var(--color-border)] hover:bg-[var(--color-muted)] disabled:opacity-40 cursor-pointer"
                >
                  🃏 抽一张
                </button>
              </>
            ) : null}
          </div>
        </div>

        {!canSim ? (
          <p className="text-sm text-[var(--color-muted-fg)] mt-3">
            主卡组至少需要 {HAND + SECURITY} 张才能模拟。
          </p>
        ) : null}

        {sim ? (
          <div className="mt-4 flex flex-col gap-4">
            <div>
              <div className="text-xs text-[var(--color-muted-fg)] mb-1.5">
                手牌 {sim.hand.length} 张
                {sim.turnDraws > 0 ? `(起手 ${HAND} + 抽 ${sim.turnDraws})` : ""}
                {sim.mulliganed ? " · 已调度" : ""}
              </div>
              <div className="flex flex-wrap gap-2">
                {sim.hand.map((c) => (
                  <CardFace key={c.key} card={c.card} />
                ))}
              </div>
            </div>
            {SECURITY > 0 ? (
              <div>
                <div className="text-xs text-[var(--color-muted-fg)] mb-1.5">
                  安防区 {sim.security.length} 张(点击翻开)
                </div>
                <div className="flex flex-wrap gap-2">
                  {sim.security.map((c, i) =>
                    sim.revealed[i] ? (
                      <CardFace key={c.key} card={c.card} size="sm" />
                    ) : (
                      <FaceDown
                        key={c.key}
                        onClick={() =>
                          setSim((s) =>
                            s
                              ? {
                                  ...s,
                                  revealed: s.revealed.map((r, j) =>
                                    j === i ? true : r,
                                  ),
                                }
                              : s,
                          )
                        }
                      />
                    ),
                  )}
                </div>
              </div>
            ) : null}
            <div className="text-xs text-[var(--color-muted-fg)]">
              牌库剩余 {sim.deck.length} 张
            </div>
          </div>
        ) : null}
      </section>

      {/* ── probability table ── */}
      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <h2 className="font-bold">📈 抽到概率</h2>
        <p className="text-xs text-[var(--color-muted-fg)] mt-1">
          「第 T 回合」= 起手 {HAND} 张 + 每回合抽 1 张后,见到至少 1
          张目标卡的概率(同名卡合并计算;不计调度和检索/抽卡效果,实际概率只会更高)。勾选多行可计算「抽到其中任意一张」的组合概率。
        </p>

        {picked.size > 0 ? (
          <div className="mt-3 rounded-md border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/5 p-3">
            <div className="text-sm font-medium">
              已选 {picked.size} 种 · 共 {pickedQty} 张 —— 抽到任意一张的概率:
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-1.5 text-sm">
              <span>
                起手 <b>{fmt(pAtLeastOne(N, pickedQty, HAND))}</b>
              </span>
              {[1, 2, 3, 4, 5].map((t) => (
                <span key={t}>
                  T{t} <b>{fmt(pAtLeastOne(N, pickedQty, seenAt(t)))}</b>
                </span>
              ))}
              <span className="text-[var(--color-muted-fg)]">
                起手期望 {expectedCount(N, pickedQty, HAND).toFixed(2)} 张
              </span>
            </div>
          </div>
        ) : null}

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs text-[var(--color-muted-fg)] border-b border-[var(--color-border)]">
                <th className="py-1.5 pr-2 w-8"></th>
                <th className="py-1.5 pr-3">卡名</th>
                <th className="py-1.5 pr-3 text-right">张数</th>
                <th className="py-1.5 pr-3 text-right">起手</th>
                <th className="py-1.5 pr-3 text-right">T3</th>
                <th className="py-1.5 pr-3 text-right">T5</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.name}
                  className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-muted)]/40 cursor-pointer"
                  onClick={() =>
                    setPicked((p) => {
                      const n = new Set(p);
                      if (n.has(r.name)) n.delete(r.name);
                      else n.add(r.name);
                      return n;
                    })
                  }
                >
                  <td className="py-1.5 pr-2">
                    <input
                      type="checkbox"
                      readOnly
                      checked={picked.has(r.name)}
                      className="accent-[var(--color-accent)] pointer-events-none"
                    />
                  </td>
                  <td className="py-1.5 pr-3">
                    <span className="font-medium">{r.name}</span>{" "}
                    <span className="text-xs font-mono text-[var(--color-muted-fg)]">
                      {r.codes.join(" ")}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {r.qty}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {fmt(pAtLeastOne(N, r.qty, HAND))}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {fmt(pAtLeastOne(N, r.qty, seenAt(3)))}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {fmt(pAtLeastOne(N, r.qty, seenAt(5)))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
