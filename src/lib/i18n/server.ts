/**
 * The request's language, for Server Components, Server Actions and route
 * handlers.
 *
 * `cache` makes it one read per request however many components ask — the
 * sidebar, the page and a dozen server-rendered children all want it.
 */

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, resolveLocale, type Locale } from "./locale";
import { MESSAGES, type Messages } from "./messages";

export const getLocale = cache(async (): Promise<Locale> => {
  const [jar, h] = await Promise.all([cookies(), headers()]);
  return resolveLocale(
    jar.get(LOCALE_COOKIE)?.value,
    h.get("accept-language"),
  );
});

export async function getMessages(): Promise<Messages> {
  return MESSAGES[await getLocale()];
}
