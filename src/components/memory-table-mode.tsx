"use client";

import { useEffect, useRef } from "react";
import { MEMORY_MAX } from "@/lib/memory-gauge";

/**
 * The gauge as a honeycomb, laid out after the reference app: one flat-top
 * hexagon per position, folded into three columns so all 21 fit a portrait
 * screen, blue counting away from zero one way and gold the other, each side's
 * digits turned toward the player who owns them.
 *
 * The fold is a double U, and the whole figure is point-symmetric about the
 * zero hex: from 0 the blue run goes UP the middle column to 3, steps out to
 * the left column at 4, then turns back DOWN it to 10; gold is that rotated
 * 180°. The two 10s land in opposite corners and every position is one tap
 * away.
 *
 * Tapping a hex moves the counter there — that is the whole interaction. No
 * keypad: there is nothing to add up when you already know the number you're
 * moving to.
 *
 * The palette is the reference's own (grey field, navy bar, that blue and that
 * gold) rather than the app's cyan and orange, because this screen is supposed
 * to be recognisable as the thing it copies.
 */

const BAR = "#24406c";
const FIELD = "#2f2f2f";
const BLUE = "#3f6cb0";
const GOLD = "#b58a37";
const ZERO = "#484d55";
const BTN = "#414c63";

/** Corner-to-corner width of a flat-top hex, and the height that implies. */
const W = 100;
const H = W * (Math.sqrt(3) / 2);
/** Neighbouring columns sit 3/4 of a width apart; rows step by half a height. */
const COL = 0.75 * W;
const ROW = H / 2;

/**
 * [column, row] for blue 1…10, in COL/ROW units with the zero hex at the
 * origin. Gold is this list negated — the figure is point-symmetric.
 */
const BLUE_CELLS: [number, number][] = [
  [0, -2], // 1
  [0, -4], // 2
  [0, -6], // 3
  [-1, -7], // 4 — steps out to the left column, then turns back down
  [-1, -5], // 5
  [-1, -3], // 6
  [-1, -1], // 7
  [-1, 1], // 8
  [-1, 3], // 9
  [-1, 5], // 10
];

if (BLUE_CELLS.length !== MEMORY_MAX) {
  throw new Error("hex layout and MEMORY_MAX disagree");
}

type Cell = { value: number; x: number; y: number; fill: string; spin: number };

const CELLS: Cell[] = [
  { value: 0, x: 0, y: 0, fill: ZERO, spin: 0 },
  ...BLUE_CELLS.flatMap(([c, r], i): Cell[] => {
    const n = i + 1;
    return [
      // Blue reads from one side of the phone and gold from the other, so their
      // digits are turned 180° from each other. Without it one player is always
      // reading upside down — and an upside-down 6 is a 9.
      { value: n, x: c * COL, y: r * ROW, fill: BLUE, spin: -90 },
      { value: -n, x: -c * COL, y: -r * ROW, fill: GOLD, spin: 90 },
    ];
  }),
];

// The figure spans ±7 rows plus half a hex, and ±1 column plus half a width.
const VB_W = 2 * COL + W;
const VB_H = 14 * ROW + H;

function hexPoints(x: number, y: number, scale = 0.97): string {
  const w = (W / 2) * scale;
  const h = (H / 2) * scale;
  return [
    [x - w, y],
    [x - w / 2, y - h],
    [x + w / 2, y - h],
    [x + w, y],
    [x + w / 2, y + h],
    [x - w / 2, y + h],
  ]
    .map(([px, py]) => `${px.toFixed(2)},${py.toFixed(2)}`)
    .join(" ");
}

const cellName = (v: number) =>
  v === 0 ? "0" : `${v > 0 ? "蓝方" : "橙方"} ${Math.abs(v)}`;

export function TableMode({
  value,
  onSet,
  onUndo,
  canUndo,
  onReset,
  onExit,
}: {
  value: number;
  onSet: (v: number) => void;
  onUndo: () => void;
  canUndo: boolean;
  onReset: () => void;
  onExit: () => void;
}) {
  useWakeLock();

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col select-none"
      style={{
        background: FIELD,
        overscrollBehavior: "none",
        touchAction: "manipulation",
      }}
    >
      <header
        className="relative shrink-0 h-12 flex items-center px-2 text-white"
        style={{ background: BAR }}
      >
        <button
          type="button"
          onClick={onExit}
          className="h-9 px-2 text-[15px] cursor-pointer"
        >
          ‹ 返回
        </button>
        <span className="absolute left-1/2 -translate-x-1/2 text-[17px] font-semibold">
          内存条
        </span>
      </header>

      <div className="flex-1 min-h-0 p-2">
        <svg
          viewBox={`${-VB_W / 2} ${-VB_H / 2} ${VB_W} ${VB_H}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-full"
          role="group"
          aria-label="内存条"
        >
          {CELLS.map((c) => {
            const here = c.value === value;
            return (
              <g
                key={c.value}
                role="button"
                aria-label={cellName(c.value)}
                aria-current={here ? "true" : undefined}
                onClick={() => onSet(c.value)}
                style={{ cursor: "pointer" }}
              >
                <polygon
                  points={hexPoints(c.x, c.y)}
                  fill={c.fill}
                  stroke={here ? "#fff" : "none"}
                  strokeWidth={here ? 5 : 0}
                />
                <text
                  x={c.x}
                  y={c.y}
                  fill="#fff"
                  fontSize={36}
                  fontWeight={600}
                  textAnchor="middle"
                  dominantBaseline="central"
                  transform={`rotate(${c.spin} ${c.x} ${c.y})`}
                  style={{ pointerEvents: "none" }}
                >
                  {Math.abs(c.value)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <footer className="shrink-0 flex gap-3 px-3 pb-4 pt-1">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className="flex-1 h-11 rounded-lg text-white text-[15px] cursor-pointer disabled:opacity-40"
          style={{ background: BTN }}
        >
          撤销
        </button>
        <button
          type="button"
          onClick={onReset}
          className="flex-1 h-11 rounded-lg text-white text-[15px] cursor-pointer"
          style={{ background: BTN }}
        >
          开局
        </button>
      </footer>
    </div>
  );
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
