/**
 * The parsing layer every write action now sits behind.
 *
 * Worth its own test because the hand-written parses it replaced had no
 * failure case: `Number(formData.get("quantity") ?? 0)` on a junk field is
 * NaN, and NaN reached SQLite. These assert the shapes that guard that.
 */
import { describe, expect, it } from "vitest";
import { field, toRecord } from "@/app/[game]/action-kit";

const fd = (pairs: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of pairs) f.append(k, v);
  return f;
};

describe("toRecord", () => {
  it("keeps a field posted many times as an array", () => {
    expect(
      toRecord(
        fd([
          ["game", "digimon"],
          ["deck_id", "a"],
          ["deck_id", "b"],
        ]),
      ),
    ).toEqual({ game: "digimon", deck_id: ["a", "b"] });
  });

  it("leaves a field posted once as a string", () => {
    expect(toRecord(fd([["deck_id", "a"]]))).toEqual({ deck_id: "a" });
  });
});

describe("field.count", () => {
  it("parses a number", () => {
    expect(field.count.parse("4")).toBe(4);
  });

  it("turns junk into 0 rather than NaN", () => {
    // The bug this whole layer exists for: NaN used to reach the repo.
    expect(field.count.parse("abc")).toBe(0);
    expect(field.count.parse(undefined)).toBe(0);
  });

  it("clamps negatives away", () => {
    expect(field.count.parse("-3")).toBe(0);
  });
});

describe("field.step", () => {
  it("keeps the sign — it is a ±1 button", () => {
    expect(field.step.parse("-2")).toBe(-2);
    expect(field.step.parse("1")).toBe(1);
  });

  it("turns junk into 0", () => {
    expect(field.step.parse("x")).toBe(0);
  });
});

describe("field.strictNumber", () => {
  it("throws on junk instead of substituting a value", () => {
    // The adjustment stepper wants the caller to fail loudly; the repo
    // clamps the range afterwards.
    expect(() => field.strictNumber.parse("abc")).toThrow();
    expect(field.strictNumber.parse("2")).toBe(2);
  });
});

describe("field.flag", () => {
  it('is true only for "1"', () => {
    expect(field.flag.parse("1")).toBe(true);
    expect(field.flag.parse("0")).toBe(false);
    expect(field.flag.parse(undefined)).toBe(false);
  });
});

describe("field.list", () => {
  it("accepts none, one, or many, and drops empties", () => {
    expect(field.list.parse(undefined)).toEqual([]);
    expect(field.list.parse("a")).toEqual(["a"]);
    expect(field.list.parse(["a", "", "b"])).toEqual(["a", "b"]);
  });
});

describe("field.optionalText", () => {
  it("tells an absent field from an empty one", () => {
    // The deck meta form saves one field at a time: absent notes must leave
    // the stored note alone, empty notes must clear it.
    expect(field.optionalText.parse(undefined)).toBeUndefined();
    expect(field.optionalText.parse("")).toBe("");
  });
});

describe("field.id", () => {
  it("rejects an empty id", () => {
    expect(() => field.id.parse("")).toThrow();
    expect(field.id.parse("d1")).toBe("d1");
  });
});
