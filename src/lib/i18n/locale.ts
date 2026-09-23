/**
 * Which language the site is in — for the interface AND for the cards.
 *
 * One setting, not two. The EN / 中 / 日 switch used to change only the card
 * text and art; it now changes every word on the page as well, so a reader
 * who picks 日 gets Japanese buttons over Japanese cards. The cost, accepted
 * deliberately, is that English card names now come with an English
 * interface.
 *
 * The choice lives in the `cardLang` cookie. The name predates the widening
 * and is kept on purpose: renaming it would silently reset every reader's
 * existing choice.
 *
 * With no cookie, the browser's Accept-Language decides, and anything this
 * site has no dictionary for falls back to Chinese — the language the site
 * was written in and the one its first readers use. A choice made with the
 * switch always wins over the header.
 *
 * Pure: no `next/headers` here, so the rules can be tested without a request.
 * `./server.ts` is the part that reads the request.
 */

export type Locale = "zh" | "ja" | "en";

export const LOCALES: readonly Locale[] = ["zh", "ja", "en"];

const DEFAULT_LOCALE: Locale = "zh";

/** The cookie the switch writes. See the header for why it is not renamed. */
export const LOCALE_COOKIE = "cardLang";

function parseLocale(v: string | null | undefined): Locale | null {
  return v === "zh" || v === "ja" || v === "en" ? v : null;
}

/**
 * The best supported language in an Accept-Language header.
 *
 * Entries are taken in q order (ties keep header order, which is the
 * browser's own preference order), and each is matched on its primary
 * subtag: `zh-TW` and `zh-Hans-CN` are both Chinese here, since there is one
 * Chinese dictionary. The first entry that maps to a supported language
 * wins; a header naming none of them yields null.
 */
export function localeFromAcceptLanguage(
  header: string | null | undefined,
): Locale | null {
  if (!header) return null;
  const entries = header
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const qParam = params.find((p) => p.trim().startsWith("q="));
      const q = qParam ? Number(qParam.trim().slice(2)) : 1;
      return {
        primary: tag.trim().toLowerCase().split("-")[0],
        q: Number.isFinite(q) ? q : 0,
        index,
      };
    })
    .filter((e) => e.primary && e.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const e of entries) {
    const hit = parseLocale(e.primary);
    if (hit) return hit;
  }
  return null;
}

/** The switch's choice, else the browser's, else Chinese. */
export function resolveLocale(
  cookie: string | null | undefined,
  acceptLanguage: string | null | undefined,
): Locale {
  return (
    parseLocale(cookie) ??
    localeFromAcceptLanguage(acceptLanguage) ??
    DEFAULT_LOCALE
  );
}

/**
 * `<html lang>` for each locale.
 *
 * Not decoration: Chinese and Japanese share code points for most kanji, and
 * the browser picks the glyph shapes from this attribute. A Japanese page
 * declared `zh` renders 直 and 骨 in their Chinese forms.
 */
export const HTML_LANG: Record<Locale, string> = {
  zh: "zh-Hans",
  ja: "ja",
  en: "en",
};

/**
 * The locale handed to Intl for dates and numbers.
 *
 * Separate from HTML_LANG on purpose: `zh-Hans` is the right thing to tell a
 * browser about a page's script, while `zh-CN` is what these dates were
 * formatted with before the site had more than one language, and a Chinese
 * reader should see exactly the dates they always saw.
 */
export const INTL_LOCALE: Record<Locale, string> = {
  zh: "zh-CN",
  ja: "ja-JP",
  en: "en-US",
};
