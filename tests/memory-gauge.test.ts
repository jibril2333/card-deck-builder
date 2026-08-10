import { describe, it, expect } from "vitest";
import { MEMORY_MAX, clampMemory } from "@/lib/memory-gauge";

describe("clampMemory", () => {
  it("keeps positions on the track", () => {
    for (let v = -MEMORY_MAX; v <= MEMORY_MAX; v++) {
      expect(clampMemory(v)).toBe(v);
    }
  });

  it("stops at the ends instead of running off them", () => {
    expect(clampMemory(MEMORY_MAX + 1)).toBe(MEMORY_MAX);
    expect(clampMemory(-MEMORY_MAX - 1)).toBe(-MEMORY_MAX);
    expect(clampMemory(9999)).toBe(MEMORY_MAX);
    expect(clampMemory(-9999)).toBe(-MEMORY_MAX);
  });

  it("rounds, so a corrupt stored value can't land between hexes", () => {
    expect(clampMemory(2.4)).toBe(2);
    expect(clampMemory(-2.6)).toBe(-3);
  });
});
