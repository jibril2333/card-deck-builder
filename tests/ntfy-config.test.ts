import { describe, it, expect } from "vitest";
import {
  maskToken,
  ntfyReady,
  parseNtfyConfig,
} from "@/lib/ntfy-config";

describe("parseNtfyConfig", () => {
  it("keeps a plain server + topic as typed", () => {
    const c = parseNtfyConfig({
      enabled: true,
      url: "https://ntfy.example.com",
      topic: "dcg",
      token: "tk_abc",
    });
    expect(c).toEqual({
      enabled: true,
      url: "https://ntfy.example.com",
      topic: "dcg",
      token: "tk_abc",
    });
  });

  it("assumes https for a bare hostname", () => {
    // What you get if you copy the address out of the ntfy app.
    expect(parseNtfyConfig({ url: "ntfy.example.com" }).url).toBe(
      "https://ntfy.example.com",
    );
  });

  it("takes the topic off a pasted topic URL", () => {
    const c = parseNtfyConfig({ url: "https://ntfy.example.com/dcg" });
    expect(c.url).toBe("https://ntfy.example.com");
    expect(c.topic).toBe("dcg");
  });

  it("doesn't let a pasted URL overwrite a topic you typed", () => {
    const c = parseNtfyConfig({ url: "https://ntfy.example.com/old", topic: "dcg" });
    expect(c.topic).toBe("dcg");
  });

  it("keeps a port, and drops a trailing slash", () => {
    const c = parseNtfyConfig({ url: "http://127.0.0.1:8093/" });
    expect(c.url).toBe("http://127.0.0.1:8093");
    expect(c.topic).toBe("");
  });

  it("trims, and survives junk", () => {
    const c = parseNtfyConfig({ url: "  https://a.test  ", topic: " /dcg/ ", token: " tk_x " });
    expect(c).toMatchObject({ url: "https://a.test", topic: "dcg", token: "tk_x" });
    expect(parseNtfyConfig(null)).toMatchObject({ url: "", topic: "", token: "" });
    expect(parseNtfyConfig({ url: 42, topic: [] })).toMatchObject({ url: "", topic: "" });
  });

  it("defaults `enabled` to whether anything was entered", () => {
    // A first save with the fields filled in should just work; saying so
    // twice (fill in the form AND tick the box) is a trap.
    expect(parseNtfyConfig({ url: "https://a.test" }).enabled).toBe(true);
    expect(parseNtfyConfig({}).enabled).toBe(false);
    expect(parseNtfyConfig({ url: "https://a.test", enabled: false }).enabled).toBe(false);
  });
});

describe("ntfyReady", () => {
  const full = {
    enabled: true,
    url: "https://a.test",
    topic: "dcg",
    token: "tk_x",
  };
  it("needs all four", () => {
    expect(ntfyReady(full)).toBe(true);
    expect(ntfyReady({ ...full, enabled: false })).toBe(false);
    expect(ntfyReady({ ...full, token: "" })).toBe(false);
    expect(ntfyReady({ ...full, topic: "" })).toBe(false);
    expect(ntfyReady({ ...full, url: "" })).toBe(false);
  });
});

describe("maskToken", () => {
  it("shows enough to recognise it and no more", () => {
    expect(maskToken("tk_abcdefghijklmnop")).toBe("tk_ab…mnop");
    expect(maskToken("")).toBe("");
    // Anything this short isn't a real token; don't hand back most of it.
    expect(maskToken("tk_short")).toBe("••••");
  });
});
