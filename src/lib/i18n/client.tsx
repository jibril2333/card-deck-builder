"use client";

/**
 * The language, for Client Components.
 *
 * The root layout resolves the locale on the server and hands this provider
 * only its NAME; the dictionary itself is imported here. Messages include
 * functions (anything that interpolates), and functions cannot cross the
 * server→client boundary as props — so the client bundle carries all three
 * dictionaries and picks one, which costs a few kilobytes and keeps the call
 * sites identical on both sides: `m.deck.title` whichever side renders it.
 *
 * Switching language refreshes the router, the layout re-renders with the
 * new locale, and every consumer of this context re-renders with it.
 */

import { createContext, useContext, useMemo } from "react";
import type { Locale } from "./locale";
import { MESSAGES, type Messages } from "./messages";

type I18n = { locale: Locale; m: Messages };

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ locale, m: MESSAGES[locale] }), [locale]);
  return <I18nContext value={value}>{children}</I18nContext>;
}

export function useI18n(): I18n {
  const v = useContext(I18nContext);
  if (!v) throw new Error("useI18n outside I18nProvider");
  return v;
}
