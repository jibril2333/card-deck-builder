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
  /** Digimon only, and only on Digimon-type cards. Drives the level table. */
  level: number | null;
  /** Canonical English type ("Digimon" / "Option" / …). */
  cardType: string;
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
  // One row per PRINTING, not per name. Sharing a name does not make two
  // cards interchangeable in this game — BT1-009 and BT5-008 are both
  // "Monodramon" and do entirely different things — so adding their copies
  // together answered a question nobody asked and overstated the odds for
  // each of them. Tick several rows to get the combined probability, which
  // is what the old grouping was really for.
  const rows = useMemo(
    () =>
      cards
        .filter((c) => !c.isEgg)
        .map((c) => ({ key: c.id, card: c, qty: c.quantity }))
        .sort((a, b) => b.qty - a.qty || a.card.code.localeCompare(b.card.code)),
    [cards],
  );

  const N = pile.length;

  // Expected Digimon per level in the opening hand. The number that decides
  // whether a curve works: you need a Lv.3 to start, and "how many Lv.3s do
  // I actually see" is not something the per-card odds add up to by eye.
  // Hypergeometric expectation is linear, so it is just HAND × K / N — no
  // independence assumption smuggled in.
  const levelRows = useMemo(() => {
    const m = new Map<number, number>();
    for (const c of cards) {
      if (c.isEgg || c.cardType !== "Digimon" || c.level == null) continue;
      m.set(c.level, (m.get(c.level) ?? 0) + c.quantity);
    }
    return [...m.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([level, qty]) => ({ level, qty }));
  }, [cards]);

  const [picked, setPicked] = useState<Set<string>>(new Set());
  const pickedQty = rows
    .filter((r) => picked.has(r.key))
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

      {/* Side by side: the table's four number columns are narrow and the
          name column doesn't need the slack, so the row was mostly empty
          space between them. The level panel fills it and stops being a
          band the reader has to scroll past to reach the table. */}
      <div className="grid lg:grid-cols-[1fr_15rem] gap-4 items-start">
        {/* ── probability table ── */}
        <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
          <h2 className="font-bold">📈 抽到概率</h2>

          {/* Fixed shape in every state — same two lines, same height, zeroes
              when nothing is ticked. Neither hiding the panel nor swapping in
              a one-line hint works: both change how tall it is, so ticking
              the first row shoves the table down and the row you were aiming
              at slides out from under the cursor. `pAtLeastOne` returns 0 for
              k=0, so the zeroes need no special case. */}
          <div className="mt-3 rounded-md border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/5 p-3">
            <div className="text-sm font-medium">
              已选 {picked.size} 张卡 · 共 {pickedQty} 份 —— 抽到任意一张的概率:
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
                    key={r.key}
                    className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-muted)]/40 cursor-pointer"
                    onClick={() =>
                      setPicked((p) => {
                        const n = new Set(p);
                        if (n.has(r.key)) n.delete(r.key);
                        else n.add(r.key);
                        return n;
                      })
                    }
                  >
                    <td className="py-1.5 pr-2">
                      <input
                        type="checkbox"
                        readOnly
                        checked={picked.has(r.key)}
                        className="accent-[var(--color-accent)] pointer-events-none"
                      />
                    </td>
                    <td className="py-1.5 pr-3">
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Same art as the hand simulator above — a row of set
                            codes is not how anyone recognises a card.

                            The aspect ratio goes on the IMAGE, not on a
                            wrapper it fills with height:100%. This cell is a
                            `flex items-center` child, so the wrapper is not
                            stretched, and WebKit will not resolve a
                            percentage height against a box whose own height
                            came from aspect-ratio — the image fell back to
                            its intrinsic 601px, was clipped to the visible
                            45px, and rendered blank in Safari while looking
                            correct in Chrome.

                            contain, not cover: a 5:7 box against a 430×601
                            scan crops ~1.25% off each side, which is exactly
                            the card's printed frame. */}
                        {r.card.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={r.card.image_url}
                            alt=""
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            className="w-8 shrink-0 aspect-[5/7] object-contain rounded bg-[var(--color-muted)]"
                          />
                        ) : (
                          <span className="w-8 shrink-0 aspect-[5/7] rounded bg-[var(--color-muted)]" />
                        )}
                        <span className="min-w-0">
                          <span className="font-medium">{r.card.name}</span>
                          {r.card.level != null ? (
                            <span className="ml-1.5 text-[10px] px-1 rounded bg-[var(--color-muted)] text-[var(--color-muted-fg)]">
                              Lv.{r.card.level}
                            </span>
                          ) : null}
                          <span className="block text-xs font-mono text-[var(--color-muted-fg)]">
                            {r.card.code}
                          </span>
                        </span>
                      </div>
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

        {/* ── expected Digimon per level in the opening hand ── */}
        {levelRows.length ? (
          <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
            <h2 className="font-bold">🎯 起手等级期望</h2>
            <div className="mt-3 grid grid-cols-2 lg:grid-cols-1 gap-2">
              {levelRows.map(({ level, qty }) => {
                const exp = expectedCount(N, qty, HAND);
                const p1 = pAtLeastOne(N, qty, HAND);
                return (
                  <div
                    key={level}
                    className="rounded-md border border-[var(--color-border)] px-3 py-2"
                  >
                    <div className="text-xs text-[var(--color-muted-fg)]">
                      Lv.{level} · 共 {qty} 张
                    </div>
                    <div className="text-lg font-bold tabular-nums leading-tight">
                      {exp.toFixed(2)}
                      <span className="text-xs font-normal text-[var(--color-muted-fg)] ml-1">
                        张
                      </span>
                    </div>
                    <div className="text-xs text-[var(--color-muted-fg)] tabular-nums">
                      ≥1 张 {fmt(p1)}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
