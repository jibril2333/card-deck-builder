/**
 * Which language a reader gets.
 *
 * The rules are small and every one of them is visible: the switch's choice
 * must survive whatever the browser says, a Japanese browser must get the
 * Japanese site on the first visit, and a header naming nothing this site
 * has must land on Chinese rather than on whatever language sorted first.
 */

import { describe, expect, it } from "vitest";
import {
  localeFromAcceptLanguage,
  resolveLocale,
} from "@/lib/i18n/locale";

describe("resolveLocale", () => {
  it("takes the switch's choice over the browser's", () => {
    expect(resolveLocale("en", "ja,zh;q=0.8")).toBe("en");
    expect(resolveLocale("ja", "en-US,en;q=0.9")).toBe("ja");
  });

  it("falls back to the browser when nothing was chosen", () => {
    expect(resolveLocale(undefined, "ja-JP,ja;q=0.9,en;q=0.8")).toBe("ja");
    expect(resolveLocale(undefined, "en-GB")).toBe("en");
  });

  it("ignores a cookie value it does not recognise", () => {
    // An old or hand-edited cookie must not blank the page.
    expect(resolveLocale("fr", "ja")).toBe("ja");
    expect(resolveLocale("", "ja")).toBe("ja");
  });

  it("lands on Chinese when neither says anything usable", () => {
    expect(resolveLocale(undefined, undefined)).toBe("zh");
    expect(resolveLocale(undefined, "fr-FR,de;q=0.9")).toBe("zh");
    expect(resolveLocale(undefined, "")).toBe("zh");
  });
});

describe("localeFromAcceptLanguage", () => {
  it("honours q weights over header order", () => {
    expect(localeFromAcceptLanguage("en;q=0.5,ja;q=0.9")).toBe("ja");
  });

  it("keeps header order among equal weights", () => {
    expect(localeFromAcceptLanguage("ja,en")).toBe("ja");
    expect(localeFromAcceptLanguage("en,ja")).toBe("en");
  });

  it("skips languages it has no dictionary for", () => {
    expect(localeFromAcceptLanguage("fr-FR,ko;q=0.9,ja;q=0.5")).toBe("ja");
  });

  it("reads every Chinese variant as the one Chinese dictionary", () => {
    expect(localeFromAcceptLanguage("zh-TW")).toBe("zh");
    expect(localeFromAcceptLanguage("zh-Hans-CN")).toBe("zh");
  });

  it("drops an entry the browser marked q=0", () => {
    // q=0 means "not acceptable", not "least preferred".
    expect(localeFromAcceptLanguage("ja;q=0,en;q=0.1")).toBe("en");
  });

  it("returns nothing for an empty or unusable header", () => {
    expect(localeFromAcceptLanguage(null)).toBeNull();
    expect(localeFromAcceptLanguage("*")).toBeNull();
  });
});
