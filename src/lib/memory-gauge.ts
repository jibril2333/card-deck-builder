/**
 * The Digimon memory gauge, as a number.
 *
 * The physical gauge is ONE counter on a track numbered 10…1, 0, 1…10, with
 * each player owning one half. There is no "my memory" and "their memory" —
 * there is a single position, and which side of zero it sits on says whose
 * resource it currently is. Every bug in a home-made memory tracker comes from
 * modelling it as two numbers, so this models it as one: `value` is signed,
 * positive on 蓝方's side, and each player reads that same number from their
 * own chair.
 *
 * This module used to also carry spend/gain/pass-turn arithmetic for a keypad
 * UI. That screen is gone (the board is now tap-a-hex, like the app it copies),
 * and rather than keep tested-but-unreachable code the functions went with it —
 * git has them if a turn tracker ever comes back.
 */

/** The track ends at 10 a side. */
export const MEMORY_MAX = 10;

export function clampMemory(v: number): number {
  return Math.max(-MEMORY_MAX, Math.min(MEMORY_MAX, Math.round(v)));
}
