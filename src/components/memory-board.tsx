"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { hasInAppHistory } from "@/lib/nav-depth";
import { MEMORY_MAX, clampMemory } from "@/lib/memory-gauge";

/**
 * The memory gauge as a honeycomb, after the reference app: one flat-top
 * hexagon per position, the phone laid flat between the two players.
 *
 * ONE counter, not two. A position is a single signed number — positive is
 * 橙方's side, negative is 蓝方's — and each player reads that same hex from
 * their own chair. Modelling it as two numbers is where every home-made memory
 * tracker goes wrong.
 *
 * The fold, the numbering and every hex position are copied off the reference
 * screenshot; see BLUE_CELLS.
 *
 * There is no chrome. No title bar, no back arrow across the top — the board
 * is the screen, because on a phone lying between two players every pixel of
 * banner is a pixel of hexagon. 返回 lives in the footer where the reference
 * puts its left button.
 *
 * Tapping a hex moves the counter there — that is the whole interaction. No
 * keypad: there is nothing to add up when you already know the number you're
 * moving to.
 *
 * The palette is the reference's own (grey field, navy bar, that blue and that
 * gold) rather than the app's cyan and orange, so the screen stays recognisable
 * as the thing it copies.
 */

const FIELD = "#2f2f2f";
const BLUE = "#3f6cb0";
const GOLD = "#b58a37";
const ZERO = "#484d55";
const BTN = "#414c63";

const STORAGE_KEY = "cdb.memory-gauge";

/** Corner-to-corner width of a flat-top hex, and the height that implies. */
const W = 100;
const H = W * (Math.sqrt(3) / 2);
/** Neighbouring columns sit 3/4 of a width apart; rows step by half a height. */
const COL = 0.75 * W;
const ROW = H / 2;

/**
 * [column, row] for 橙方 1…10, in COL/ROW units with the zero hex at the origin
 * — copied off the reference screenshot position for position.
 *
 * The fold is a double U: 1, 2, 3 climb the middle column, 4 steps out to the
 * top of the left column, and 5…10 come back DOWN it. 蓝方 is this list negated,
 * so the figure is point-symmetric about zero and the two 10s land in opposite
 * corners.
 */
const POS_CELLS: [number, number][] = [
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

if (POS_CELLS.length !== MEMORY_MAX) {
  throw new Error("hex layout and MEMORY_MAX disagree");
}

type Cell = { value: number; x: number; y: number; fill: string; spin: number };

const CELLS: Cell[] = [
  // Zero is turned with the rest of them. Left upright it was the only digit on
  // the board reading the "wrong" way for both players at once.
  { value: 0, x: 0, y: 0, fill: ZERO, spin: 90 },
  ...POS_CELLS.flatMap(([c, r], i): Cell[] => {
    const n = i + 1;
    return [
      // The two sides read the phone from opposite chairs, so their digits are
      // turned 180° from each other. Without it one player is always reading
      // upside down — and an upside-down 6 is a 9.
      { value: n, x: c * COL, y: r * ROW, fill: GOLD, spin: 90 },
      { value: -n, x: -c * COL, y: -r * ROW, fill: BLUE, spin: -90 },
    ];
  }),
];

// The figure spans ±7 rows plus half a hex, and ±1 column plus half a width.
const ROW_SPAN = Math.max(...POS_CELLS.map(([, r]) => Math.abs(r)));
const VB_W = 2 * COL + W;
const VB_H = 2 * ROW_SPAN * ROW + H;

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
  v === 0 ? "0" : `${v > 0 ? "橙方" : "蓝方"} ${Math.abs(v)}`;

function load(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return 0;
    const v = Number((JSON.parse(raw) as { value?: unknown }).value);
    return Number.isFinite(v) ? clampMemory(v) : 0;
  } catch {
    return 0;
  }
}

export function MemoryBoard({ home }: { home: string }) {
  // Starts at 0 rather than from storage so the server HTML and the first
  // client render agree; the saved game arrives in an effect.
  const [value, setValue] = useState(0);
  const [ready, setReady] = useState(false);
  const router = useRouter();

  useWakeLock();

  useEffect(() => {
    setValue(load());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ value }));
    } catch {
      /* private mode / quota — the board still works, it just won't survive a reload */
    }
  }, [value, ready]);

  const back = useCallback(() => {
    // Same rule as BackLink: only go back through history we pushed, and never
    // off the site. Otherwise land on the game's home page.
    const ref = typeof document === "undefined" ? "" : document.referrer;
    if (hasInAppHistory() && (ref === "" || ref.startsWith(window.location.origin))) {
      router.back();
    } else {
      router.push(home);
    }
  }, [router, home]);

  return (
    <div
      className="fixed inset-0 z-50 select-none"
      style={{
        background: FIELD,
        overscrollBehavior: "none",
        touchAction: "manipulation",
        // The page asks for viewport-fit=cover so the field reaches the screen
        // edges; these keep the hexes and the buttons out from under the notch
        // and the home indicator. Without cover, iOS reserves those strips for
        // us and the board simply gets smaller.
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      {/* The board gets the whole screen. The two controls float in the corners
          the honeycomb's diagonal ribbon leaves empty rather than sitting in a
          footer row — a row costs every hexagon ~7% of its size, and on a phone
          on a table that is the difference you actually feel. */}
      <div className="relative w-full h-full p-1">
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
                onClick={() => setValue(c.value)}
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

        <button
          type="button"
          onClick={back}
          className="absolute left-2 bottom-2 h-9 px-4 rounded-lg text-white text-sm cursor-pointer"
          style={{ background: BTN }}
        >
          返回
        </button>
        <FullscreenButton />
      </div>
    </div>
  );
}

/**
 * Rendered only where the Fullscreen API exists — which is why an iPhone shows
 * nothing down here but 返回. iPhone Safari has never
 * implemented `requestFullscreen` on any element, so there the button would be
 * a dead control; the equivalent on that device is Add to Home Screen, which
 * this page's `appleWebApp` metadata turns into a chrome-less standalone launch.
 */
function FullscreenButton() {
  const [supported, setSupported] = useState(false);
  const [on, setOn] = useState(false);

  useEffect(() => {
    setSupported(typeof document.documentElement.requestFullscreen === "function");
    const sync = () => setOn(document.fullscreenElement !== null);
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={() => {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      }}
      className="absolute right-2 bottom-2 w-9 h-9 rounded-lg text-white text-[15px] cursor-pointer"
      style={{ background: BTN }}
      aria-pressed={on}
      aria-label={on ? "退出全屏" : "全屏"}
    >
      {on ? "⤡" : "⤢"}
    </button>
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
