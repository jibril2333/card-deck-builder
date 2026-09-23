/**
 * One section of the dictionary: the same keys in all three languages,
 * written side by side.
 *
 * Side by side because the translations are reviewed by reading them, and a
 * reviewer comparing `zh.ts` against `ja.ts` in two windows misses the key
 * that is in one and not the other. Here the three versions of a string sit
 * a few lines apart, and the type does the comparing: the Chinese block
 * defines the shape, and a Japanese or English block that lacks a key — or
 * carries one the Chinese does not, or takes different arguments — fails to
 * compile.
 *
 * Values are strings, or functions for anything that interpolates. Functions
 * rather than `{n}` templates so the arguments are typed at every call site,
 * and so English can pluralise where Chinese and Japanese do not.
 */

export type Section<T> = { zh: T; ja: T; en: T };

export function section<T>(s: {
  zh: T;
  ja: NoInfer<T>;
  en: NoInfer<T>;
}): Section<T> {
  return s;
}
