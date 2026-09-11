/**
 * Query-string reading for `/api/v1`, with the failure case spelled out.
 *
 * `Number(url.searchParams.get("page"))` on a missing parameter is 0 and on
 * junk is NaN, and both of those reach SQLite as a LIMIT if nobody looks.
 * Everything here either returns a value inside its declared range or throws
 * INVALID_INPUT naming the parameter — the same reasoning as `action-kit`'s
 * field declarations on the website's forms.
 */

import type { CardLang } from "@/lib/card-lang";
import { ApiError } from "./errors";
import type { LangPair } from "./dto";

const LANGS = ["zh", "ja", "en"] as const;

function lang(url: URL, name: string, fallback: CardLang): CardLang {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === "") return fallback;
  if ((LANGS as readonly string[]).includes(raw)) return raw as CardLang;
  throw new ApiError("INVALID_INPUT", `${name} 只能是 zh、ja 或 en。`);
}

/**
 * Text and art language.
 *
 * The defaults are the reader's, not the database's: Chinese text over
 * Japanese art is what the website's own settings converge on, and a client
 * that sends neither should get that rather than the English rows.
 */
export function langPair(url: URL): LangPair {
  return {
    lang: lang(url, "lang", "zh"),
    artLang: lang(url, "art_lang", "ja"),
  };
}

export function intParam(
  url: URL,
  name: string,
  opts: { min: number; max: number; fallback?: number },
): number | undefined {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === "") return opts.fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < opts.min || n > opts.max) {
    throw new ApiError(
      "INVALID_INPUT",
      `${name} 必须是 ${opts.min} 到 ${opts.max} 之间的整数。`,
    );
  }
  return n;
}

/**
 * A repeatable parameter, accepting both spellings.
 *
 * `?color=Red&color=Blue` is what the contract declares; `?color=Red,Blue` is
 * what everyone writes by hand. Both mean the same thing and neither is worth
 * a support question.
 */
export function listParam(url: URL, name: string): string[] {
  return url.searchParams
    .getAll(name)
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);
}

export function stringParam(url: URL, name: string): string | undefined {
  const raw = url.searchParams.get(name);
  return raw === null || raw === "" ? undefined : raw;
}

export function enumParam<T extends string>(
  url: URL,
  name: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === "") return fallback;
  if ((allowed as readonly string[]).includes(raw)) return raw as T;
  throw new ApiError("INVALID_INPUT", `${name} 只能是 ${allowed.join("、")}。`);
}
