"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  MEMORY_MAX,
  memoryFor,
  turnIsOver,
  other,
  type Gauge,
  type Side,
} from "@/lib/memory-gauge";

/**
 * The gauge with the phone lying flat between two players.
 *
 * The whole layout follows from that one fact:
 *
 *   - Two control zones, one per seat, the far one rotated 180° so each player
 *     reads their own half upright. Everything a player needs — their number,
 *     their costs, their end-turn — is inside their own half; nobody has to
 *     reach across or read upside down.
 *   - Seat-neutral names. "我方 / 对手" is the right framing when one person is
 *     tracking a game, and the wrong one here: the top half would be labelled
 *     "对手" while facing the person it belongs to. So this mode says 蓝方 /
 *     橙方, which means the same thing from both chairs.
 *   - The track runs the full height along one edge instead of sitting between
 *     the halves. A horizontal strip between two facing players is mirrored for
 *     one of them, so which end is "yours" needs a legend; running it away from
 *     each player makes the marker's own position the answer — near you, it's
 *     yours — and it happens to buy 21 real touch targets out of the phone's
 *     long dimension instead of ~11px slivers.
 *   - Digits on the far half are flipped with it, exactly like the reference
 *     app. That also removes the one genuinely dangerous misread: an unrotated
 *     "6" is a "9" from the other chair.
 */

const ZONE: Record<Side, { name: string; color: string; fg: string }> = {
  opponent: {
    name: "橙方",
    color: "var(--color-accent2)",
    fg: "var(--color-accent2-fg)",
  },
  self: {
    name: "蓝方",
    color: "var(--color-accent)",
    fg: "var(--color-accent-fg)",
  },
};

/** Costs beyond 8 are rare enough to reach for the track instead. */
const SPEND = [1, 2, 3, 4, 5, 6, 7, 8];
const GAIN = [1, 2, 3, 4];

export function TableMode({
  g,
  onSpend,
  onGain,
  onPass,
  onSet,
  onUndo,
  canUndo,
  onExit,
}: {
  g: Gauge;
  onSpend: (side: Side, n: number) => void;
  onGain: (side: Side, n: number) => void;
  onPass: () => void;
  onSet: (value: number) => void;
  onUndo: () => void;
  canUndo: boolean;
  onExit: () => void;
}) {
  useWakeLock();
  const compact = useShortViewport();

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 bg-[var(--color-bg)] flex select-none",
        compact ? "gap-1 p-1" : "gap-1.5 p-1.5",
      )}
      // The gauge is the whole screen here; nothing should rubber-band or
      // scroll out from under a thumb mid-game.
      style={{ overscrollBehavior: "none", touchAction: "manipulation" }}
    >
      <div className={cn("flex-1 min-w-0 flex flex-col", compact ? "gap-1" : "gap-1.5")}>
        <Zone side="opponent" flip compact={compact} g={g} onSpend={onSpend} onGain={onGain} onPass={onPass} onUndo={onUndo} canUndo={canUndo} onExit={onExit} />
        <Zone side="self" compact={compact} g={g} onSpend={onSpend} onGain={onGain} onPass={onPass} onUndo={onUndo} canUndo={canUndo} onExit={onExit} />
      </div>
      <Track value={g.value} onSet={onSet} compact={compact} />
    </div>
  );
}

function Zone({
  side,
  flip = false,
  compact,
  g,
  onSpend,
  onGain,
  onPass,
  onUndo,
  canUndo,
  onExit,
}: {
  side: Side;
  flip?: boolean;
  compact: boolean;
  g: Gauge;
  onSpend: (side: Side, n: number) => void;
  onGain: (side: Side, n: number) => void;
  onPass: () => void;
  onUndo: () => void;
  canUndo: boolean;
  onExit: () => void;
}) {
  const z = ZONE[side];
  const mine = memoryFor(g.value, side);
  const active = g.turn === side;
  // Sitting on exactly 0 satisfies turnIsOver, but leading with "结算完就换手"
  // before anyone has spent anything reads as a warning about nothing — and 0
  // is where every game starts. At 0 the honest status is just "your move";
  // the hand-over prompt is for when memory has actually crossed over.
  const over = active && turnIsOver(g) && g.value !== 0;

  return (
    <section
      aria-label={z.name}
      className={cn(
        "flex-1 min-h-0 overflow-hidden rounded-2xl border flex flex-col transition-opacity",
        compact ? "gap-1 p-1.5" : "gap-1.5 p-2",
        // The waiting side stays legible but stops competing for attention —
        // dimmed, not disabled: an effect can move memory on either turn.
        active ? "opacity-100" : "opacity-55",
      )}
      style={{
        transform: flip ? "rotate(180deg)" : undefined,
        borderColor: active ? z.color : "var(--color-border)",
        background: active
          ? `color-mix(in oklch, ${z.color} 9%, var(--color-card))`
          : "var(--color-card)",
      }}
    >
      <header className="flex items-center gap-2 shrink-0">
        <span className="text-sm font-semibold" style={{ color: z.color }}>
          {z.name}
        </span>
        <span className="text-[11px] text-[var(--color-muted-fg)]">
          {active ? (over ? "结算完就换手" : "行动中") : "等待"}
        </span>
        {compact ? (
          <span
            className="text-3xl font-bold tabular-nums leading-none ml-auto"
            style={{ color: mine <= 0 ? "var(--color-muted-fg)" : z.color }}
            aria-label={`${z.name}可用记忆 ${mine}`}
          >
            {mine}
          </span>
        ) : null}
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className={cn(
            "h-7 px-2.5 rounded-md border border-[var(--color-border)] text-[11px] cursor-pointer disabled:opacity-40",
            compact ? "ml-1.5" : "ml-auto",
          )}
        >
          撤销
        </button>
        <button
          type="button"
          onClick={onExit}
          aria-label={`${z.name}退出桌面模式`}
          className="h-7 px-2.5 rounded-md border border-[var(--color-border)] text-[11px] text-[var(--color-muted-fg)] cursor-pointer"
        >
          退出
        </button>
      </header>

      {compact ? null : (
        <div className="shrink-0 text-center leading-none">
          <div
            className="text-6xl font-bold tabular-nums"
            style={{ color: mine <= 0 ? "var(--color-muted-fg)" : z.color }}
            aria-label={`${z.name}可用记忆 ${mine}`}
          >
            {mine}
          </div>
        </div>
      )}

      <Pad
        label="花费"
        values={SPEND}
        sign="−"
        cols={compact ? 8 : 4}
        compact={compact}
        onPick={(n) => onSpend(side, n)}
      />
      <Pad
        label="获得"
        values={GAIN}
        sign="+"
        cols={4}
        compact={compact}
        onPick={(n) => onGain(side, n)}
      />

      <button
        type="button"
        onClick={onPass}
        disabled={!active}
        aria-label={`${z.name}结束回合`}
        className={cn(
          "shrink-0 rounded-xl text-sm font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-40",
          compact ? "h-9" : "h-11",
        )}
        style={{
          background: active ? z.color : "transparent",
          color: active ? z.fg : "var(--color-muted-fg)",
          border: active ? "none" : "1px solid var(--color-border)",
        }}
      >
        {active ? "结束回合 →" : `轮到${ZONE[other(side)].name}`}
      </button>
    </section>
  );
}

function Pad({
  label,
  values,
  sign,
  cols,
  compact,
  onPick,
}: {
  label: string;
  values: number[];
  sign: string;
  cols: number;
  compact: boolean;
  onPick: (n: number) => void;
}) {
  return (
    <div className="min-h-0 flex-1 flex flex-col gap-1">
      {compact ? null : (
        <div className="text-[10px] text-[var(--color-muted-fg)] shrink-0">
          {label}
        </div>
      )}
      <div
        className="flex-1 min-h-0 grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridAutoRows: "minmax(0, 1fr)",
        }}
      >
        {values.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onPick(n)}
            aria-label={`${label} ${n}`}
            className={cn(
              "rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]/40 tabular-nums cursor-pointer active:bg-[var(--color-muted)]",
              compact ? "min-h-7 text-sm" : "min-h-9 text-base",
            )}
          >
            {sign}
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The shared counter, one cell per position, running from 橙方 10 at the top to
 * 蓝方 10 at the bottom. Cells between 0 and the marker are tinted, so how much
 * a side is holding is legible at arm's length without reading the number.
 */
function Track({
  value,
  onSet,
  compact,
}: {
  value: number;
  onSet: (v: number) => void;
  compact: boolean;
}) {
  const cells: number[] = [];
  for (let v = -MEMORY_MAX; v <= MEMORY_MAX; v++) cells.push(v);

  return (
    <div
      className={cn(
        "shrink-0 flex flex-col rounded-2xl overflow-hidden border border-[var(--color-border)]",
        compact ? "w-9" : "w-14",
      )}
      role="group"
      aria-label="记忆条"
    >
      {cells.map((v) => {
        const here = v === value;
        const side: Side | null = v === 0 ? null : v > 0 ? "self" : "opponent";
        const z = side ? ZONE[side] : null;
        // Between zero and the marker, on the marker's own side.
        const inRun =
          !here && side !== null && Math.sign(v) === Math.sign(value) &&
          Math.abs(v) < Math.abs(value);

        return (
          <button
            key={v}
            type="button"
            onClick={() => onSet(v)}
            aria-current={here ? "true" : undefined}
            aria-label={`把记忆条移到 ${v === 0 ? "0" : `${ZONE[side!].name} ${Math.abs(v)}`}`}
            className={cn(
              "flex-1 min-h-0 text-xs tabular-nums cursor-pointer border-b border-[var(--color-border)] last:border-b-0",
              here ? "font-bold text-sm" : "text-[var(--color-muted-fg)]",
            )}
            style={{
              // Flipped with the far half, so 橙方 reads their own numbers the
              // right way up — and a 6 can't be mistaken for a 9.
              transform: v < 0 ? "rotate(180deg)" : undefined,
              background: here
                ? z?.color ?? "var(--color-muted-fg)"
                : inRun
                  ? `color-mix(in oklch, ${z!.color} 26%, transparent)`
                  : v === 0
                    ? "var(--color-muted)"
                    : undefined,
              color: here ? z?.fg ?? "var(--color-bg)" : undefined,
            }}
          >
            {Math.abs(v)}
          </button>
        );
      })}
    </div>
  );
}

/**
 * True when the screen is too short for the roomy layout — a phone on its side
 * between the players, or a small one. Below it the headline number moves up
 * into the header and the keypads flatten to one row each.
 *
 * 740 is measured, not chosen. Adding up the roomy zone's parts predicted ~660;
 * binary-searching the real layout put the first clean height at 706, because
 * the keypad rows keep their 36px minimum while the grid track shrinks under
 * them — so they silently OVERLAP rather than overflow anything, and no amount
 * of overflow checking would have caught it. The margin over 706 is for fonts
 * that render taller than this machine's. The e2e case re-measures across a
 * range of heights instead of trusting this number.
 */
function useShortViewport(): boolean {
  const [short, setShort] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-height: 740px)");
    const sync = () => setShort(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return short;
}

/**
 * Keep the screen on while the gauge is the table's. Best-effort: the API is
 * unavailable on non-secure origins and in some browsers, and the lock is
 * dropped whenever the tab is hidden, so it's re-taken on the way back.
 */
function useWakeLock() {
  const lock = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function acquire() {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        lock.current = await navigator.wakeLock?.request("screen");
      } catch {
        /* denied, unsupported, or not a secure context — the gauge still works */
      }
    }

    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", acquire);
      lock.current?.release().catch(() => {});
      lock.current = null;
    };
  }, []);
}
