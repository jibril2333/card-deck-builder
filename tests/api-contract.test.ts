/**
 * The parts of the native API contract that can be checked without a server.
 *
 * Three of them, and each stands for a failure that would otherwise reach a
 * client:
 *
 *  · Every error code maps to a status. A code with no entry would be
 *    `undefined`, which `Response.json` turns into a 200 carrying an error
 *    body — the one failure shape a client cannot detect.
 *  · Every card field has a label. `visibleFields` returns whatever the card
 *    holds, so a field added to the model without a label would reach the
 *    phone as `undefined` in the place where a name should be.
 *  · Query parameters refuse junk instead of passing NaN to SQLite.
 */

import { describe, expect, it } from "vitest";
import { ApiError, statusFor, type ApiErrorCode } from "@/lib/api/errors";
import { FIELD_LABELS } from "@/lib/cards/field-labels";
import { FIELD_SOURCE } from "@/lib/cards/digimon-fields";
import { enumParam, intParam, langPair, listParam } from "@/lib/api/params";

const CODES: ApiErrorCode[] = [
  "INVALID_INPUT",
  "INVALID_CREDENTIALS",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "ID_CONFLICT",
  "REVISION_CONFLICT",
  "REVISION_REQUIRED",
  "DECK_LOCKED",
  "RATE_LIMITED",
  "SERVER_ERROR",
];

describe("error codes", () => {
  it("every code has a status in the 4xx/5xx range", () => {
    for (const code of CODES) {
      const status = statusFor(code);
      expect(status, code).toBeGreaterThanOrEqual(400);
      expect(status, code).toBeLessThan(600);
    }
  });

  it("keeps the statuses the contract promises", () => {
    expect(statusFor("REVISION_CONFLICT")).toBe(409);
    expect(statusFor("REVISION_REQUIRED")).toBe(428);
    expect(statusFor("DECK_LOCKED")).toBe(423);
    expect(statusFor("RATE_LIMITED")).toBe(429);
    // Two codes share 401 on purpose: the client's next move differs.
    expect(statusFor("UNAUTHENTICATED")).toBe(401);
    expect(statusFor("INVALID_CREDENTIALS")).toBe(401);
  });

  it("carries extra headers for the cases that need them", () => {
    const err = new ApiError("RATE_LIMITED", "慢一点", { "retry-after": "60" });
    expect(err.headers["retry-after"]).toBe("60");
  });
});

describe("card field labels", () => {
  it("names every field the card model can return", () => {
    for (const key of Object.keys(FIELD_SOURCE)) {
      expect(FIELD_LABELS[key as keyof typeof FIELD_LABELS], key).toBeTruthy();
    }
  });

  it("has no label for a field that no longer exists", () => {
    for (const key of Object.keys(FIELD_LABELS)) {
      expect(FIELD_SOURCE[key as keyof typeof FIELD_SOURCE], key).toBeTruthy();
    }
  });
});

const url = (qs: string) => new URL(`https://x/api/v1/cards${qs}`);

describe("query parameters", () => {
  it("defaults to Chinese text over Japanese art", () => {
    expect(langPair(url(""))).toEqual({ lang: "zh", artLang: "ja" });
  });

  it("takes each language separately", () => {
    expect(langPair(url("?lang=ja&art_lang=en"))).toEqual({
      lang: "ja",
      artLang: "en",
    });
  });

  it("refuses a language it has no data for", () => {
    expect(() => langPair(url("?lang=ko"))).toThrow(ApiError);
  });

  it("refuses junk rather than passing NaN to the query", () => {
    expect(() =>
      intParam(url("?page=abc"), "page", { min: 1, max: 99 }),
    ).toThrow(ApiError);
    expect(() => intParam(url("?page=0"), "page", { min: 1, max: 99 })).toThrow(
      ApiError,
    );
    expect(() =>
      intParam(url("?page=1.5"), "page", { min: 1, max: 99 }),
    ).toThrow(ApiError);
  });

  it("treats an absent and an empty parameter the same", () => {
    const opts = { min: 1, max: 99, fallback: 7 };
    expect(intParam(url(""), "page", opts)).toBe(7);
    expect(intParam(url("?page="), "page", opts)).toBe(7);
  });

  it("reads a repeated parameter both ways round", () => {
    expect(listParam(url("?color=Red&color=Blue"), "color")).toEqual([
      "Red",
      "Blue",
    ]);
    expect(listParam(url("?color=Red,Blue"), "color")).toEqual(["Red", "Blue"]);
    expect(listParam(url(""), "color")).toEqual([]);
  });

  it("holds an enum to its vocabulary", () => {
    const modes = ["name", "effect"] as const;
    expect(enumParam(url("?q_mode=effect"), "q_mode", modes, "name")).toBe(
      "effect",
    );
    expect(enumParam(url(""), "q_mode", modes, "name")).toBe("name");
    expect(() =>
      enumParam(url("?q_mode=all"), "q_mode", modes, "name"),
    ).toThrow(ApiError);
  });
});
