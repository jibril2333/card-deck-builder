/**
 * The wire shapes `/api/v1` returns, and the only place rows become them.
 *
 * A SQLite row is not a contract. `SELECT *` on `cards` is 40 columns of
 * scrape residue whose names and nullability change whenever a source does;
 * shipping it would make every schema edit a client-breaking change and would
 * publish columns (source_url, fetched_at) that are nobody's business. These
 * types are written down, and the mapping happens here rather than in the
 * routes so two endpoints returning a card return the same card.
 *
 * ## Language
 *
 * Two settings, not one. Text and art are chosen separately because the
 * reader wants them apart: Chinese rules text over the Japanese printing they
 * actually own. Each answer says which language it MANAGED to use —
 * `effective_text_lang` / `effective_art_lang` — because a card with no
 * Chinese row silently falls back to English, and a client that cannot see
 * that happen would present the fallback as the translation.
 *
 * `null` for `effective_art_lang` means the art is the canonical scan on the
 * `cards` row, which belongs to no language in particular.
 */

import type { CardLang } from "@/lib/card-lang";
import {
  buildCardView,
  canonicalType,
  FIELD_SOURCE,
  visibleFields,
} from "@/lib/cards/digimon-fields";
import { FIELD_LABELS } from "@/lib/cards/field-labels";
import type { DigimonCard } from "@/lib/db/digimon";
import { deckRevision } from "@/lib/deck-revision";
import * as digimon from "@/lib/db/digimon";

export type CardSummary = {
  id: string;
  code: string;
  name: string;
  /** Layout must key off THIS, never off `display_type`. */
  canonical_type: string;
  /** The type as printed in the reader's language (デジモン / 数码宝贝). */
  display_type: string;
  /** `color` and `color2`, empty strings dropped. */
  colors: string[];
  level: number | null;
  rarity: string | null;
  image_url: string | null;
  text_lang: CardLang;
  art_lang: CardLang;
  effective_text_lang: CardLang;
  effective_art_lang: CardLang | null;
};

export type CardDetail = {
  card: CardSummary;
  fields: { key: string; label: string; value: string }[];
  images: { variant: string; lang: string; url: string }[];
  rulings: { lang: string; question: string; answer: string }[];
};

type Owner = { id: string; display_name: string; is_me: boolean };

type Issue = { code: string; message: string; card_ids: string[] };

export type DeckSummary = {
  id: string;
  name: string;
  owner: Owner;
  locked: boolean;
  pinned: boolean;
  cover_image_url: string | null;
  main_count: number;
  egg_count: number;
  missing_count: number;
  issues: Issue[];
};

type DeckCard = {
  card: CardSummary;
  quantity: number;
  purchased: number;
  missing: number;
  /** The shared held count the purchase stepper edits — see below. */
  owned_control_value: number;
  shared: boolean;
  price_yen: number | null;
  price_source: string | null;
};

export type Adjustment = {
  code: string;
  message: string;
  card_id: string | null;
  requested: number | null;
  actual: number | null;
};

export type DeckDetail = {
  deck: DeckSummary;
  notes: string;
  revision: string;
  can_edit: boolean;
  cards: DeckCard[];
  totals: {
    main_count: number;
    egg_count: number;
    total: number;
    purchased: number;
    missing: number;
    known_missing_price_yen: number;
    unpriced_missing_count: number;
  };
  adjustments: Adjustment[];
};

/** Text and art language for one request. */
export type LangPair = { lang: CardLang; artLang: CardLang };

type Localized = {
  name: string | null;
  image_url: string | null;
  card_type: string | null;
};

/**
 * The translation rows a batch of cards needs, read once per language.
 *
 * Built per request rather than per card: a deck is fifty cards and a search
 * page forty, and one `IN (…)` beats ninety round trips.
 */
export class CardLocalizer {
  private readonly text: Map<string, Localized>;
  private readonly art: Map<string, Localized>;

  constructor(
    codes: string[],
    private readonly langs: LangPair,
  ) {
    this.text = digimon.getDisplayTranslations(codes, langs.lang);
    this.art =
      langs.artLang === langs.lang
        ? this.text
        : digimon.getDisplayTranslations(codes, langs.artLang);
  }

  summary(card: DigimonCard): CardSummary {
    const t = this.text.get(card.code);
    const a = this.art.get(card.code);
    const art = a?.image_url ?? null;
    return {
      id: card.id,
      code: card.code,
      name: t?.name ?? card.name,
      // `cards.card_type` is the canonical English word; canonicalType()
      // returns null for anything outside the closed vocabulary, and the
      // wire keeps the raw string in that case rather than inventing one.
      canonical_type: canonicalType(card.card_type) ?? card.card_type,
      display_type: t?.card_type ?? card.card_type,
      colors: [card.color, card.color2].filter(
        (c): c is string => !!c && c !== "",
      ),
      level: card.level,
      rarity: card.rarity,
      image_url: art ?? card.image_url,
      text_lang: this.langs.lang,
      art_lang: this.langs.artLang,
      // A translation row with no name is a row that exists for its art; the
      // text still came from English.
      effective_text_lang: t?.name ? this.langs.lang : "en",
      effective_art_lang: art
        ? this.langs.artLang
        : card.image_url
          ? "en"
          : null,
    };
  }
}

/** One card, with everything the detail page shows. */
export function cardDetail(card: DigimonCard, langs: LangPair): CardDetail {
  const translation = digimon.getCardTranslation(card.code, langs.lang);
  const view = buildCardView(card, translation);
  const localizer = new CardLocalizer([card.code], langs);
  const summary = localizer.summary(card);
  // The summary's name/type come from the batch lookup; buildCardView has the
  // same answer from the full row, and they must not diverge.
  summary.name = view.name;
  summary.display_type = view.card_type;

  const fields = visibleFields(view).map((key) => ({
    key,
    label: FIELD_LABELS[key],
    // Everything crosses the wire as a string: `dp` is a number, `link_dp` is
    // a number the site prints with a sign, and a client that has to switch
    // on the type of `value` to render a row has been given a worse job than
    // formatting one itself.
    value: String(view[FIELD_SOURCE[key].base] ?? ""),
  }));

  return {
    card: summary,
    fields,
    images: digimon
      .getCardImages(card.code, langs.artLang)
      .map((v) => ({ variant: v.variant, lang: v.lang, url: v.image_url })),
    rulings: digimon.getCardRulings(card.code).map((r) => ({
      lang: r.lang,
      question: r.question,
      answer: r.answer,
    })),
  };
}

// ────────────────────────────────────────────────────────────────────────
// Decks
// ────────────────────────────────────────────────────────────────────────

/** A deck row as `listDecksWithCover` returns it. */
type DeckRow = {
  id: string;
  name: string;
  notes: string | null;
  locked: number;
  pinned: number;
  user_id: string | null;
  owner_id: string | null;
  owner_name: string | null;
  cover_image_url?: string | null;
};

function owner(deck: DeckRow, meId: string): Owner {
  return {
    id: deck.owner_id ?? deck.user_id ?? "",
    // A deck whose owner row is gone still lists; it just has no name to
    // show. Blanking it here beats every client inventing its own word.
    display_name: deck.owner_name ?? "",
    is_me: deck.user_id === meId,
  };
}

/**
 * The banlist's complaints about a deck, as the client should phrase them.
 *
 * Reported, never applied — same as the website. The message carries the
 * numbers because "this deck has a problem" is not something a reader can
 * act on, and `card_ids` lets the client point at the offending rows.
 */
function deckIssues(deckId: string): Issue[] {
  return digimon.deckRestrictionIssues(deckId).map((i) =>
    i.kind === "over_limit"
      ? {
          code: "OVER_LIMIT",
          message: `${i.name} 限 ${i.max_count} 张,当前 ${i.quantity} 张`,
          card_ids: [i.card_id],
        }
      : {
          code: "BANNED_PAIR",
          message: `${i.name} 与 ${i.with_name} 不能同时加入`,
          card_ids: [i.card_id],
        },
  );
}

/** Deck-list rows. One pass over every deck the caller may read. */
export function deckSummaries(meId: string): DeckSummary[] {
  const decks = digimon.listDecksWithCover(meId) as unknown as DeckRow[];
  const ids = decks.map((d) => d.id);
  const counts = digimon.deckMainEggCounts(ids);
  const missing = digimon.deckMissingCounts(ids);
  return decks.map((d) => {
    const c = counts.get(d.id) ?? { main: 0, egg: 0 };
    return {
      id: d.id,
      name: d.name,
      owner: owner(d, meId),
      locked: !!d.locked,
      pinned: !!d.pinned,
      cover_image_url: d.cover_image_url ?? null,
      main_count: c.main,
      egg_count: c.egg,
      missing_count: missing.get(d.id) ?? 0,
      issues: deckIssues(d.id),
    };
  });
}

/**
 * One deck, with its cards, totals and current revision.
 *
 * `adjustments` is what the server did differently from what was asked —
 * empty on a read, and on a write it carries the clamps. The client replaces
 * its optimistic state with this whole object rather than patching it: the
 * only view of a deck that is certainly right is the one the server just
 * computed.
 */
export function deckDetail(
  deckId: string,
  meId: string,
  langs: LangPair,
  adjustments: Adjustment[] = [],
): DeckDetail | null {
  const deck = digimon.getDeck(deckId);
  if (!deck) return null;
  const state = digimon.deckRevisionState(deckId);
  if (!state) return null;

  const ownerRow = digimon.getDeckWithCover(deckId);
  const rows = digimon.getDeckCards(deckId);
  const localizer = new CardLocalizer(
    rows.map((r) => r.code),
    langs,
  );

  // 共享卡池: the held count the purchase stepper edits is the POOL's, which
  // can exceed what this deck runs. Read once for the deck rather than per
  // card — the peer list is the same for every card in it.
  const peers = deck.user_id
    ? digimon.decksSharingPoolWith(deck.user_id, deckId)
    : [];
  const shared = peers.length > 1;

  let mainCount = 0;
  let eggCount = 0;
  let purchasedTotal = 0;
  let missingTotal = 0;
  let knownMissingPrice = 0;
  let unpricedMissing = 0;

  const cards: DeckCard[] = rows.map((r) => {
    const held = Math.min(r.purchased, r.quantity);
    const missing = r.quantity - held;
    if (r.card_type === "Digi-Egg") eggCount += r.quantity;
    else mainCount += r.quantity;
    purchasedTotal += held;
    missingTotal += missing;
    if (missing > 0) {
      if (r.price != null) knownMissingPrice += r.price * missing;
      else unpricedMissing += missing;
    }
    return {
      card: localizer.summary(r),
      quantity: r.quantity,
      purchased: r.purchased,
      missing,
      owned_control_value: shared
        ? digimon.pooledOwnedForCard(peers, r.id)
        : r.purchased,
      shared,
      price_yen: r.price,
      price_source:
        r.price == null
          ? null
          : r.manual_price != null
            ? "manual"
            : r.market_source,
    };
  });

  const summary: DeckSummary = {
    id: deck.id,
    name: deck.name,
    owner: owner(
      {
        id: deck.id,
        name: deck.name,
        notes: deck.notes,
        locked: deck.locked,
        pinned: deck.pinned,
        user_id: deck.user_id,
        owner_id: ownerRow?.owner_id ?? deck.user_id ?? null,
        owner_name: ownerRow?.owner_name ?? null,
      },
      meId,
    ),
    locked: !!deck.locked,
    pinned: !!deck.pinned,
    cover_image_url: ownerRow?.cover_image_url ?? null,
    main_count: mainCount,
    egg_count: eggCount,
    missing_count: missingTotal,
    issues: deckIssues(deckId),
  };

  return {
    deck: summary,
    notes: deck.notes ?? "",
    revision: deckRevision(state),
    // A friend may read this deck; only its owner may write it, and a locked
    // deck is closed even to its owner until they unlock it.
    can_edit: deck.user_id === meId && !deck.locked,
    cards,
    totals: {
      main_count: mainCount,
      egg_count: eggCount,
      total: mainCount + eggCount,
      purchased: purchasedTotal,
      missing: missingTotal,
      known_missing_price_yen: knownMissingPrice,
      unpriced_missing_count: unpricedMissing,
    },
    adjustments,
  };
}
