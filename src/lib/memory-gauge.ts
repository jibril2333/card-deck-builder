/**
 * The Digimon memory gauge, as arithmetic.
 *
 * The physical gauge is ONE counter on a track numbered 10…1, 0, 1…10, with
 * each player owning one half. There is no "my memory" and "their memory" —
 * there is a single position, and which side of zero it sits on says whose
 * resource it currently is. Every bug in a home-made memory tracker comes from
 * modelling it as two numbers, so this models it as one.
 *
 * `value` is signed from ONE fixed viewpoint (`self`, the person holding the
 * phone): +3 means three on our side, -3 means three on the opponent's. That
 * fixed frame is what makes the gauge drawable; the players' own view of it is
 * derived on the way out (`memoryFor`) and on the way in (`spend` / `gain`),
 * so a "spend 3" never has to know which direction it is pushing.
 */

export type Side = "self" | "opponent";

/** The track ends at 10 a side; a cost that would overshoot stops there. */
export const MEMORY_MAX = 10;

export type Gauge = {
  /** Position on the track, from `self`'s viewpoint. */
  value: number;
  /** Whose turn it is. */
  turn: Side;
};

export const INITIAL_GAUGE: Gauge = { value: 0, turn: "self" };

export function other(side: Side): Side {
  return side === "self" ? "opponent" : "self";
}

export function clampMemory(v: number): number {
  return Math.max(-MEMORY_MAX, Math.min(MEMORY_MAX, Math.round(v)));
}

/** The gauge as `side` reads it: positive = memory that side can spend. */
export function memoryFor(value: number, side: Side): number {
  return side === "self" ? value : -value;
}

/** Move the counter to where `side` would read it as `memory`. */
export function setMemoryFor(memory: number, side: Side): number {
  return clampMemory(side === "self" ? memory : -memory);
}

/** `side` pays `n` memory: the counter moves that far toward the opponent. */
export function spend(value: number, side: Side, n: number): number {
  return setMemoryFor(memoryFor(value, side) - n, side);
}

/** `side` gains `n` memory: the counter moves that far toward them. */
export function gain(value: number, side: Side, n: number): number {
  return setMemoryFor(memoryFor(value, side) + n, side);
}

/**
 * Whether the turn player is out of memory and the turn is over.
 *
 * The rule is "0 or into the opponent's side", not "below 0" — landing exactly
 * on 0 ends the turn too, and that off-by-one is the single most common way to
 * play this wrong. Advisory only: the turn player finishes the action that
 * pushed it there (and any effects it triggered) before the turn actually ends,
 * so nothing here passes the turn on its own.
 */
export function turnIsOver(g: Gauge): boolean {
  return memoryFor(g.value, g.turn) <= 0;
}

/**
 * Hand the turn over. The counter does NOT move or reset — whatever is sitting
 * on the new turn player's side is exactly what they have to spend, which is
 * the whole point of a shared gauge.
 */
export function passTurn(g: Gauge): Gauge {
  return { value: g.value, turn: other(g.turn) };
}
