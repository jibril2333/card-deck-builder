import { describe, expect, it } from "vitest";
import { sessionCookieSecure } from "@/lib/auth/types";

/**
 * A browser silently discards a `Secure` cookie that arrives over http, so
 * this one boolean decides whether a LAN install can log in at all. It is a
 * function (and tested) because the failure mode gives no error anywhere:
 * the login succeeds and the site still says you're signed out.
 */
describe("sessionCookieSecure", () => {
  it("is on in production, off in development", () => {
    expect(sessionCookieSecure({ NODE_ENV: "production" })).toBe(true);
    expect(sessionCookieSecure({ NODE_ENV: "development" })).toBe(false);
    expect(sessionCookieSecure({})).toBe(false);
  });

  it("can be switched off for a plain-http LAN install", () => {
    expect(
      sessionCookieSecure({ NODE_ENV: "production", CDB_INSECURE_COOKIES: "1" }),
    ).toBe(false);
  });

  it("takes only an exact 1 — a stray value must not weaken the cookie", () => {
    for (const v of ["0", "", "true", "yes", "01"]) {
      expect(
        sessionCookieSecure({ NODE_ENV: "production", CDB_INSECURE_COOKIES: v }),
      ).toBe(true);
    }
  });
});
