"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { TableMode } from "@/components/memory-table-mode";
import {
  MEMORY_MAX,
  INITIAL_GAUGE,
  memoryFor,
  spend,
  gain,
  turnIsOver,
  passTurn,
  other,
  type Gauge,
  type Side,
} from "@/lib/memory-gauge";

/**
 * A memory gauge you can put on the table next to a real game.
 *
 * Everything about the layout assumes that: it's used one-handed, in a hurry,
 * next to a board someone is looking at instead of the screen. So the number is
 * enormous, the cost buttons are the primary control (not a +/− stepper you'd
 * have to press four times for a 4-cost), and undo is one tap away because the
 * fix for a mistap needs to be faster than the mistap was.
 *
 * The arithmetic — including which way "spend" pushes and the exactly-zero
 * turn-end rule — lives in src/lib/memory-gauge.ts, where it's tested.
 */

const STORAGE_KEY = "cdb.memory-gauge";

/** Costs on real cards run 0–14ish, but 1–8 covers nearly every play. */
const QUICK = [1, 2, 3, 4, 5, 6, 7, 8];

type Snapshot = Gauge;

function load(): Gauge {
  if (typeof window === "undefined") return INITIAL_GAUGE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL_GAUGE;
    const parsed = JSON.parse(raw) as Partial<Gauge>;
    const value = Number(parsed.value);
    const turn: Side = parsed.turn === "opponent" ? "opponent" : "self";
    if (!Number.isFinite(value) || Math.abs(value) > MEMORY_MAX) {
      return INITIAL_GAUGE;
    }
    return { value, turn };
  } catch {
    return INITIAL_GAUGE;
  }
}

const SIDE_LABEL: Record<Side, string> = { self: "我方", opponent: "对手" };

export function MemoryGauge() {
  // Starts from the constant, not from storage, so the server HTML and the
  // first client render agree; the stored game arrives in an effect below.
  const [g, setG] = useState<Gauge>(INITIAL_GAUGE);
  const [past, setPast] = useState<Snapshot[]>([]);
  const [ready, setReady] = useState(false);
  const [table, setTable] = useState(false);

  useEffect(() => {
    setG(load());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(g));
    } catch {
      /* private mode / quota — the gauge still works, it just won't survive a reload */
    }
  }, [g, ready]);

  const push = useCallback((next: Gauge) => {
    setG((cur) => {
      if (next.value === cur.value && next.turn === cur.turn) return cur;
      setPast((p) => [...p.slice(-49), cur]);
      return next;
    });
  }, []);

  // Side-explicit, because table mode has two seats pressing buttons and only
  // one of them is the turn player. Everything else defaults to whoever's turn
  // it is.
  const spendBy = useCallback(
    (side: Side, n: number) => push({ ...g, value: spend(g.value, side, n) }),
    [g, push],
  );
  const gainBy = useCallback(
    (side: Side, n: number) => push({ ...g, value: gain(g.value, side, n) }),
    [g, push],
  );
  const setValue = useCallback(
    (value: number) => push({ ...g, value }),
    [g, push],
  );
  const doSpend = useCallback((n: number) => spendBy(g.turn, n), [g.turn, spendBy]);
  const doGain = useCallback((n: number) => gainBy(g.turn, n), [g.turn, gainBy]);
  const doPass = useCallback(() => push(passTurn(g)), [g, push]);

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      setG(p[p.length - 1]);
      return p.slice(0, -1);
    });
  }, []);

  const reset = useCallback(() => {
    setPast([]);
    setG(INITIAL_GAUGE);
  }, []);

  // Keyboard, for playing on a laptop: digits spend, shift+digit gains,
  // space passes the turn, backspace undoes.
  //
  // Bound to the window rather than a focused container: there is nothing here
  // worth tabbing to first, and a shortcut you have to click into is a shortcut
  // nobody uses. Guarded so it can't eat keystrokes meant for a field.
  const ref = useRef({ doSpend, doGain, doPass, undo });
  ref.current = { doSpend, doGain, doPass, undo };
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        (t &&
          (t.isContentEditable ||
            ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)))
      ) {
        return;
      }
      const api = ref.current;
      if (e.key >= "0" && e.key <= "9") {
        const n = e.key === "0" ? 10 : Number(e.key);
        e.preventDefault();
        api.doSpend(n);
      } else if (e.key === ")" || (e.shiftKey && /^[!@#$%^&*(]$/.test(e.key))) {
        // The shifted digits, as typed on a US layout.
        const n = ")!@#$%^&*(".indexOf(e.key);
        e.preventDefault();
        api.doGain(n === 0 ? 10 : n);
      } else if (e.key === " ") {
        e.preventDefault();
        api.doPass();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        api.undo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const mine = memoryFor(g.value, g.turn);
  const over = turnIsOver(g);
  const turnLabel = SIDE_LABEL[g.turn];
  const untouched = past.length === 0 && g.value === 0;

  if (table) {
    return (
      <TableMode
        g={g}
        onSpend={spendBy}
        onGain={gainBy}
        onPass={doPass}
        onSet={setValue}
        onUndo={undo}
        canUndo={past.length > 0}
        onExit={() => setTable(false)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <button
        type="button"
        onClick={() => setTable(true)}
        className="h-12 rounded-xl border border-[var(--color-accent)] text-[var(--color-accent)] text-sm font-medium cursor-pointer hover:bg-[var(--color-accent)]/10"
        style={{ background: "color-mix(in oklch, var(--color-accent) 8%, transparent)" }}
      >
        📱 桌面模式 · 手机放桌子中间,两边各按各的
      </button>
      {/* Whose turn — also the control that changes it, because on a gauge
          those are the same question. */}
      <div className="flex gap-2">
        {(["self", "opponent"] as Side[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => (s === g.turn ? undefined : push(passTurn(g)))}
            aria-pressed={s === g.turn}
            className={cn(
              "flex-1 h-12 rounded-xl border text-base transition-colors cursor-pointer",
              s === g.turn
                ? "font-semibold"
                : "border-[var(--color-border)] text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] hover:bg-[var(--color-muted)]",
            )}
            style={
              s === g.turn
                ? {
                    borderColor: "var(--color-accent)",
                    background: "color-mix(in oklch, var(--color-accent) 16%, transparent)",
                    color: "var(--color-accent)",
                  }
                : undefined
            }
          >
            {SIDE_LABEL[s]}的回合
          </button>
        ))}
      </div>

      {/* The readout. Deliberately the biggest thing on the page. */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-5 py-6 text-center">
        <div className="text-xs uppercase tracking-wider text-[var(--color-muted-fg)]">
          {turnLabel}可用记忆
        </div>
        <div
          className="text-7xl sm:text-8xl font-bold tabular-nums leading-none mt-2"
          style={{
            color: over && !untouched ? "var(--color-accent2)" : "var(--color-accent)",
          }}
          aria-live="polite"
        >
          {mine}
        </div>
        {/* Fixed height so the number doesn't jump as this line comes and goes.
            The opening position (0, nothing played) satisfies turnIsOver too —
            correctly, the first player must spend to act — but leading with a
            换手 warning on a gauge nobody has touched reads as an error, so it
            says what's actually going on instead. */}
        <div className="mt-3 text-sm min-h-10 flex items-center justify-center">
          {!over ? null : untouched ? (
            <span className="text-[var(--color-muted-fg)]">
              开局双方都在 0 · 先手方一动就换手
            </span>
          ) : (
            <span style={{ color: "var(--color-accent2)" }}>
              结算完当前动作后换手 · {SIDE_LABEL[other(g.turn)]}接手时有 {-mine} 点
            </span>
          )}
        </div>
      </div>

      <Track value={g.value} turn={g.turn} onPick={(v) => push({ ...g, value: v })} />

      <Row label={`${turnLabel}花费`} tone="spend" onPick={doSpend} />
      <Row label={`${turnLabel}获得`} tone="gain" onPick={doGain} />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={doPass}
          className={cn(
            "flex-[2] h-14 rounded-xl text-base font-semibold cursor-pointer transition-opacity hover:opacity-90",
            "bg-[var(--color-accent)] text-[var(--color-accent-fg)]",
          )}
        >
          结束回合 →
        </button>
        <button
          type="button"
          onClick={undo}
          disabled={past.length === 0}
          className="flex-1 h-14 rounded-xl border border-[var(--color-border)] text-sm cursor-pointer hover:bg-[var(--color-muted)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          撤销
        </button>
        <button
          type="button"
          onClick={reset}
          className="flex-1 h-14 rounded-xl border border-[var(--color-border)] text-sm text-[var(--color-muted-fg)] cursor-pointer hover:bg-[var(--color-muted)] hover:text-[var(--color-fg)]"
        >
          重置
        </button>
      </div>

      <p className="text-xs text-[var(--color-muted-fg)] leading-relaxed">
        键盘：数字键 = 花费该点数（0 为 10），Shift + 数字 = 获得，空格 = 结束回合，
        Backspace = 撤销。进度存在这台设备上，刷新不会丢。
      </p>
    </div>
  );
}

/** The physical track: 10…0…10, with a marker on the current position. */
function Track({
  value,
  turn,
  onPick,
}: {
  value: number;
  turn: Side;
  onPick: (v: number) => void;
}) {
  const cells: number[] = [];
  for (let v = -MEMORY_MAX; v <= MEMORY_MAX; v++) cells.push(v);

  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5">
        <span style={{ color: "var(--color-accent2)" }}>← 对手一侧</span>
        <span style={{ color: "var(--color-accent)" }}>我方一侧 →</span>
      </div>
      <div
        className="flex rounded-xl overflow-hidden border border-[var(--color-border)]"
        role="group"
        aria-label="记忆条"
      >
        {cells.map((v) => {
          const here = v === value;
          const side: Side | null = v === 0 ? null : v > 0 ? "self" : "opponent";
          const tint =
            side === "self"
              ? "var(--color-accent)"
              : side === "opponent"
                ? "var(--color-accent2)"
                : "var(--color-muted-fg)";
          return (
            <button
              key={v}
              type="button"
              onClick={() => onPick(v)}
              aria-label={`把记忆条移到 ${v === 0 ? "0" : `${SIDE_LABEL[side!]} ${Math.abs(v)}`}`}
              aria-current={here ? "true" : undefined}
              className={cn(
                "flex-1 h-12 text-[11px] tabular-nums cursor-pointer transition-colors",
                "border-r border-[var(--color-border)] last:border-r-0",
                here ? "font-bold" : "text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]",
              )}
              style={
                here
                  ? {
                      background: tint,
                      color:
                        side === "opponent"
                          ? "var(--color-accent2-fg)"
                          : side === "self"
                            ? "var(--color-accent-fg)"
                            : "var(--color-bg)",
                    }
                  : v === 0
                    ? { background: "var(--color-muted)" }
                    : undefined
              }
            >
              {Math.abs(v)}
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 text-xs text-[var(--color-muted-fg)]">
        轮到{SIDE_LABEL[turn]}行动 · 点格子可直接把指示物挪过去
      </div>
    </div>
  );
}

function Row({
  label,
  tone,
  onPick,
}: {
  label: string;
  tone: "spend" | "gain";
  onPick: (n: number) => void;
}) {
  return (
    <div>
      <div className="text-xs text-[var(--color-muted-fg)] mb-1.5">{label}</div>
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
        {QUICK.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onPick(n)}
            className={cn(
              "h-12 rounded-lg border text-base tabular-nums cursor-pointer transition-colors",
              "border-[var(--color-border)] hover:bg-[var(--color-muted)]",
            )}
          >
            {tone === "spend" ? "−" : "+"}
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
