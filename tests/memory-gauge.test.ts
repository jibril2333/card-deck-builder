import { describe, it, expect } from "vitest";
import {
  MEMORY_MAX,
  INITIAL_GAUGE,
  clampMemory,
  memoryFor,
  setMemoryFor,
  spend,
  gain,
  turnIsOver,
  passTurn,
  other,
  type Gauge,
} from "@/lib/memory-gauge";

describe("reading the gauge from each side", () => {
  it("is the same counter seen from opposite ends", () => {
    expect(memoryFor(3, "self")).toBe(3);
    expect(memoryFor(3, "opponent")).toBe(-3);
    expect(memoryFor(-4, "opponent")).toBe(4);
  });

  it("round-trips through setMemoryFor", () => {
    for (const side of ["self", "opponent"] as const) {
      for (let m = -MEMORY_MAX; m <= MEMORY_MAX; m++) {
        expect(memoryFor(setMemoryFor(m, side), side)).toBe(m);
      }
    }
  });
});

describe("spending and gaining", () => {
  it("pushes the counter toward the opponent whichever side pays", () => {
    expect(spend(0, "self", 3)).toBe(-3);
    expect(spend(0, "opponent", 3)).toBe(3);
  });

  it("lets the payer eat into memory the opponent already had", () => {
    // Opponent is sitting on 5 (value -5); we take our turn and pay 2 more.
    expect(spend(-5, "self", 2)).toBe(-7);
  });

  it("gains pull the counter back", () => {
    expect(gain(-3, "self", 2)).toBe(-1);
    expect(gain(2, "opponent", 5)).toBe(-3);
  });

  it("stops at the end of the track instead of running off it", () => {
    expect(spend(-9, "self", 5)).toBe(-MEMORY_MAX);
    expect(gain(9, "self", 5)).toBe(MEMORY_MAX);
    expect(clampMemory(999)).toBe(MEMORY_MAX);
    expect(clampMemory(-999)).toBe(-MEMORY_MAX);
  });
});

describe("when the turn is over", () => {
  it("ends at exactly 0, not below it", () => {
    expect(turnIsOver({ value: 1, turn: "self" })).toBe(false);
    expect(turnIsOver({ value: 0, turn: "self" })).toBe(true);
    expect(turnIsOver({ value: -1, turn: "self" })).toBe(true);
  });

  it("reads the same rule from the other seat", () => {
    expect(turnIsOver({ value: -1, turn: "opponent" })).toBe(false);
    expect(turnIsOver({ value: 0, turn: "opponent" })).toBe(true);
    expect(turnIsOver({ value: 1, turn: "opponent" })).toBe(true);
  });

  it("says the opening turn is over before anything is played", () => {
    // Both players start on 0, so the first player must spend to do anything.
    expect(turnIsOver(INITIAL_GAUGE)).toBe(true);
  });
});

describe("passing the turn", () => {
  it("swaps the seat and leaves the counter alone", () => {
    const g: Gauge = { value: -4, turn: "self" };
    expect(passTurn(g)).toEqual({ value: -4, turn: "opponent" });
  });

  it("hands the incoming player exactly what is on their side", () => {
    const after = passTurn({ value: -4, turn: "self" });
    expect(memoryFor(after.value, after.turn)).toBe(4);
    expect(turnIsOver(after)).toBe(false);
  });

  it("is its own inverse", () => {
    const g: Gauge = { value: 6, turn: "opponent" };
    expect(passTurn(passTurn(g))).toEqual(g);
  });
});

describe("a whole opening exchange", () => {
  it("tracks a first turn that plays a 3-cost and passes", () => {
    let g: Gauge = INITIAL_GAUGE;
    g = { ...g, value: spend(g.value, g.turn, 3) };
    expect(g.value).toBe(-3);
    expect(turnIsOver(g)).toBe(true);

    g = passTurn(g);
    expect(memoryFor(g.value, g.turn)).toBe(3);

    // Opponent spends 1 of their 3 and is still holding the turn.
    g = { ...g, value: spend(g.value, g.turn, 1) };
    expect(memoryFor(g.value, g.turn)).toBe(2);
    expect(turnIsOver(g)).toBe(false);

    // …then a 4-cost, which overshoots into our side.
    g = { ...g, value: spend(g.value, g.turn, 4) };
    expect(turnIsOver(g)).toBe(true);
    expect(memoryFor(g.value, other(g.turn))).toBe(2);
  });
});
