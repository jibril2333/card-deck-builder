/**
 * Card-text language preference (Digimon only — UA cards are native JP and
 * have no translation data).
 *
 * Stored in a plain cookie so every server component can read it and the
 * switcher is a one-line client write + router.refresh(). 'en' is the native
 * language of the digimon `cards` table; 'zh'/'ja' overlay from
 * `card_translations` with per-field fallback to EN.
 */
export const CARD_LANG_COOKIE = "cardLang";

export type CardLang = "en" | "zh" | "ja";

export function parseCardLang(v: string | undefined | null): CardLang {
  return v === "zh" || v === "ja" ? v : "en";
}

export const CARD_LANG_LABELS: Record<CardLang, string> = {
  en: "EN",
  zh: "中",
  ja: "日",
};
