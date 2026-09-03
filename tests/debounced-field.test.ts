/**
 * Which incoming values a URL-backed control is allowed to adopt.
 *
 * This is the decision the search box had spelled out and the range inputs
 * did not, which is the whole reason it now lives in one place. Pure, so the
 * table can be read without a browser.
 */
import { describe, expect, it } from "vitest";
import { planSync } from "@/lib/use-debounced-field";

const plan = (o: Partial<Parameters<typeof planSync>[0]>) =>
  planSync({
    incoming: "",
    lastSeen: "",
    committed: "",
    composing: false,
    ...o,
  });

describe("planSync", () => {
  it("does nothing when the value has not moved", () => {
    expect(plan({ incoming: "暴龙", lastSeen: "暴龙", committed: "暴龙" }))
      .toEqual({ ack: false, adopt: false });
  });

  it("adopts a value that came from somewhere else", () => {
    // The Back button, or 清空全部: the URL says something we never sent.
    expect(plan({ incoming: "暴龙", lastSeen: "", committed: "" })).toEqual({
      ack: true,
      adopt: true,
    });
  });

  it("acknowledges our own echo without writing it back", () => {
    // The commit we made 300ms ago, arriving as `searchParams.get(key)`.
    // Adopting it would overwrite whatever was typed in the meantime.
    expect(plan({ incoming: "暴龙", lastSeen: "", committed: "暴龙" })).toEqual({
      ack: true,
      adopt: false,
    });
  });

  it("only acknowledges the echo once", () => {
    expect(plan({ incoming: "暴龙", lastSeen: "暴龙", committed: "暴龙" }))
      .toEqual({ ack: false, adopt: false });
  });

  it("defers everything mid-composition", () => {
    // Reassigning a controlled input's value while an IME composes makes the
    // browser drop the composing text. Not acknowledged either, so the change
    // is re-considered when the composition ends and re-renders.
    expect(plan({ incoming: "暴龙", lastSeen: "", committed: "", composing: true }))
      .toEqual({ ack: false, adopt: false });
  });

  it("still adopts an external change once composition ends", () => {
    expect(plan({ incoming: "暴龙", lastSeen: "", committed: "", composing: false }))
      .toEqual({ ack: true, adopt: true });
  });

  it("adopts a clear that came from elsewhere", () => {
    // 清空全部 empties the URL while the box still holds text.
    expect(plan({ incoming: "", lastSeen: "暴龙", committed: "暴龙" })).toEqual({
      ack: true,
      adopt: true,
    });
  });
});

describe("the echo bug this exists for", () => {
  it("keeps the newer keystrokes when the older commit comes back", () => {
    // Typed "3", the commit fired, then "0" was typed before the URL echoed
    // "3" back. Adopting it would put the box back to "3" under the finger.
    const p = plan({ incoming: "3", lastSeen: "", committed: "3" });
    expect(p.adopt).toBe(false);
  });

  it("but a genuine external 3 still lands", () => {
    const p = plan({ incoming: "3", lastSeen: "", committed: "" });
    expect(p.adopt).toBe(true);
  });
});
