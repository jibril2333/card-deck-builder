/**
 * Every section, assembled into one dictionary per language.
 *
 * Adding a section is one import and one line in SECTIONS; the per-language
 * objects and the `Messages` type follow from it. Each section fixes its own
 * shape (see define.ts), so a missing translation is a compile error in the
 * section file, not a blank on a page.
 */

import type { Locale } from "./locale";
import about from "./sections/about";
import account from "./sections/account";
import addToDeck from "./sections/add-to-deck";
import admin from "./sections/admin";
import auth from "./sections/auth";
import card from "./sections/card";
import common from "./sections/common";
import deck from "./sections/deck";
import deckCards from "./sections/deck-cards";
import decks from "./sections/decks";
import filters from "./sections/filters";
import nav from "./sections/nav";
import playtest from "./sections/playtest";
import pool from "./sections/pool";
import restrictions from "./sections/restrictions";
import search from "./sections/search";
import tile from "./sections/tile";

const SECTIONS = {
  common,
  nav,
  filters,
  search,
  card,
  addToDeck,
  tile,
  decks,
  deck,
  deckCards,
  pool,
  playtest,
  restrictions,
  admin,
  about,
  auth,
  account,
};

type Sections = typeof SECTIONS;

export type Messages = { [K in keyof Sections]: Sections[K]["zh"] };

function pick(locale: Locale): Messages {
  return Object.fromEntries(
    Object.entries(SECTIONS).map(([k, v]) => [k, v[locale]]),
  ) as Messages;
}

export const MESSAGES: Record<Locale, Messages> = {
  zh: pick("zh"),
  ja: pick("ja"),
  en: pick("en"),
};
