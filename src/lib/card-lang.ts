/**
 * Card-text language preference.
 *
 * Stored in a plain cookie so every server component can read it and the
 * switcher is a one-line client write + router.refresh(). 'en' is the native
 * language of the digimon `cards` table; 'zh'/'ja' overlay from
 * `card_translations` with per-field fallback to EN.
 */
export { LOCALE_COOKIE as CARD_LANG_COOKIE } from "@/lib/i18n/locale";

/**
 * The card-text language is the site's language — one switch sets both, and
 * which one a reader gets without a cookie is decided in `lib/i18n/locale`.
 */
export type { Locale as CardLang } from "@/lib/i18n/locale";
import type { Locale as CardLang } from "@/lib/i18n/locale";

export const CARD_LANG_LABELS: Record<CardLang, string> = {
  en: "EN",
  zh: "中",
  ja: "日",
};
