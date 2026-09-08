/**
 * 拖到边缘自动滚动的速度曲线。
 */
import { describe, expect, it } from "vitest";
import {
  EDGE_BAND,
  MAX_SPEED,
  MIN_SPEED,
  edgeScrollSpeed,
} from "@/lib/edge-scroll";

const H = 800;

describe("edgeScrollSpeed", () => {
  it("does nothing through the middle of the window", () => {
    for (const y of [EDGE_BAND, 300, 400, H - EDGE_BAND]) {
      expect(edgeScrollSpeed(y, H), `y=${y}`).toBe(0);
    }
  });

  it("scrolls up near the top and down near the bottom", () => {
    expect(edgeScrollSpeed(20, H)).toBeLessThan(0);
    expect(edgeScrollSpeed(H - 20, H)).toBeGreaterThan(0);
  });

  it("speeds up the deeper into the band the pointer goes", () => {
    const shallow = Math.abs(edgeScrollSpeed(EDGE_BAND - 5, H));
    const deep = Math.abs(edgeScrollSpeed(5, H));
    expect(shallow).toBeGreaterThanOrEqual(MIN_SPEED);
    expect(deep).toBeGreaterThan(shallow);
    expect(deep).toBeLessThanOrEqual(MAX_SPEED);
  });

  it("keeps going at full speed past the edge", () => {
    // A pointer dragged off the window should not stop the list.
    expect(edgeScrollSpeed(0, H)).toBe(-MAX_SPEED);
    expect(edgeScrollSpeed(-50, H)).toBe(-MAX_SPEED);
    expect(edgeScrollSpeed(H, H)).toBe(MAX_SPEED);
    expect(edgeScrollSpeed(H + 50, H)).toBe(MAX_SPEED);
  });

  it("leaves a neutral middle on a short window", () => {
    // Two 96px bands on a 200px window would scroll everywhere.
    const short = 200;
    expect(edgeScrollSpeed(short / 2, short)).toBe(0);
    expect(edgeScrollSpeed(5, short)).toBeLessThan(0);
    expect(edgeScrollSpeed(short - 5, short)).toBeGreaterThan(0);
  });

  it("is symmetric", () => {
    for (const d of [1, 20, 50, 95]) {
      expect(edgeScrollSpeed(d, H)).toBe(-edgeScrollSpeed(H - d, H));
    }
  });
});
