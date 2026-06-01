import { describe, expect, it } from "vitest";
import { altArtSuffix, isAltArt, stripAltArt } from "@/lib/alt-art";

describe("alt-art utilities", () => {
  describe("stripAltArt", () => {
    it("removes uppercase Digimon parallel suffix", () => {
      expect(stripAltArt("BT1-001_P1")).toBe("BT1-001");
      expect(stripAltArt("BT12-050_P2")).toBe("BT12-050");
      expect(stripAltArt("ST1-07_P12")).toBe("ST1-07");
    });
    it("removes lowercase UA parallel suffix", () => {
      expect(stripAltArt("EX01BT/HTR-1-030_p1")).toBe("EX01BT/HTR-1-030");
      expect(stripAltArt("UA22BT/JJK-2-100_p3")).toBe("UA22BT/JJK-2-100");
    });
    it("leaves base-printing codes unchanged", () => {
      expect(stripAltArt("BT1-001")).toBe("BT1-001");
      expect(stripAltArt("EX01BT/HTR-2-001")).toBe("EX01BT/HTR-2-001");
    });
    it("only strips trailing suffix, not internal _p sequences", () => {
      // "_p" appearing earlier in the code shouldn't be touched. Real-world
      // codes don't actually have this, but the regex is anchored to $ so
      // we test the anchor.
      expect(stripAltArt("BT_P1-001")).toBe("BT_P1-001");
    });
  });

  describe("isAltArt", () => {
    it("recognizes both case variants", () => {
      expect(isAltArt("BT1-001_P1")).toBe(true);
      expect(isAltArt("EX01BT/HTR-1-030_p1")).toBe(true);
    });
    it("rejects base printings", () => {
      expect(isAltArt("BT1-001")).toBe(false);
      expect(isAltArt("EX01BT/HTR-2-001")).toBe(false);
    });
    it("rejects codes with internal _p sequences", () => {
      expect(isAltArt("BT_P1-001")).toBe(false);
    });
  });

  describe("altArtSuffix", () => {
    it("returns the matching suffix with its leading underscore", () => {
      expect(altArtSuffix("BT1-001_P1")).toBe("_P1");
      expect(altArtSuffix("BT12-050_P25")).toBe("_P25");
      expect(altArtSuffix("EX01BT/HTR-1-030_p1")).toBe("_p1");
    });
    it("returns empty string for base printings", () => {
      expect(altArtSuffix("BT1-001")).toBe("");
      expect(altArtSuffix("EX01BT/HTR-2-001")).toBe("");
    });
  });
});
