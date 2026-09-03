/**
 * Everything the deck page knows before it renders anything.
 *
 * The page used to open with 360 lines of loading and arithmetic — eight
 * queries, the ジョグレス pairing, the stat panels, the purchase totals, the
 * price sums, the comparison — and only then start on the markup. Reading it
 * meant scrolling past all of that to find the JSX, and none of it could be
 * exercised without rendering a page.
 *
 * It is one function now, returning one view model. The page destructures it
 * and lays it out.
 *
 * Still does the DB reads itself rather than taking them as arguments: they
 * feed each other (cover art depends on the deck row, ジョグレス on the
 * cards, the stat panels on both), and splitting a chain like that into
 * arguments only moves the chain up a level.
 */

import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { isGameId, colorHex } from "@/lib/games";
import { CARD_LANG_COOKIE, parseCardLang } from "@/lib/card-lang";
import { splitSetNames } from "@/lib/card-sets";
import { type DeckCardData } from "@/components/deck-card";
import { computeDeckSearchTargets, type SearchGroup } from "@/lib/deck-search";
import { type StatPanel } from "@/components/deck-stats";
import { type Adjustment } from "@/components/deck-adjustments";
import { colorHex as colorHexFn } from "@/lib/games";
import {
  exportDeckText,
  exportDigimoncardIoUrl,
  type DeckCardForExport,
} from "@/lib/deck-formats";
import * as digimon from "@/lib/db/digimon";
import { DECK_TARGET } from "@/lib/deck-legality";
import { tallyColors, tallyLevels, MULTI_COLOR } from "@/lib/deck-tally";
import { deckThemeCss } from "@/lib/deck-theme";
import { computeDeckJogress } from "@/lib/jogress";
import {
  buildSetOrder,
  cardsNewerThan,
  deckVersionOf,
} from "@/lib/deck-version";
import type { VersionOption } from "@/components/deck-version-picker";
import type { JogressView } from "@/components/jogress-badge";

type RawDeckCard = {
  card_type: string;
  color?: string | null;
  color2?: string | null;
  level?: number | null;
  play_cost?: number | null;
  dp?: number | null;
  digi_types?: string | null;
  quantity: number;
};

/** Tally a key → summed quantity, return sorted bars. */
function tally(
  cards: RawDeckCard[],
  keyFn: (c: RawDeckCard) => string | null | undefined,
  opts: {
    sort: "count" | "label-num";
    limit?: number;
    color?: (label: string) => string | undefined;
  },
): { label: string; value: number; color?: string }[] {
  const m = new Map<string, number>();
  for (const c of cards) {
    const k = keyFn(c);
    if (k === null || k === undefined || k === "") continue;
    m.set(k, (m.get(k) ?? 0) + c.quantity);
  }
  let bars = [...m.entries()].map(([label, value]) => ({
    label,
    value,
    color: opts.color?.(label),
  }));
  if (opts.sort === "count") {
    bars.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  } else {
    bars.sort(
      (a, b) =>
        (parseFloat(a.label.replace(/[^\d.]/g, "")) || 0) -
        (parseFloat(b.label.replace(/[^\d.]/g, "")) || 0),
    );
  }
  if (opts.limit) bars = bars.slice(0, opts.limit);
  return bars;
}

function buildDigimonStats(cards: RawDeckCard[]): StatPanel[] {
  // Traits: split digi_types by "/"
  const traitCards: RawDeckCard[] = [];
  for (const c of cards) {
    if (!c.digi_types) continue;
    for (const t of c.digi_types.split("/")) {
      const tt = t.trim();
      if (tt) traitCards.push({ ...c, digi_types: tt });
    }
  }
  return [
    {
      title: "卡片类型",
      bars: tally(cards, (c) => c.card_type, { sort: "count" }),
    },
    // Both of these keep a rule the generic `tally` can't express — empty
    // rungs, and a card counting for more than one bucket. See lib/deck-tally.
    { title: "等级", bars: tallyLevels(cards) },
    {
      title: "颜色",
      bars: tallyColors(cards).map((b) => ({
        ...b,
        color: b.label === MULTI_COLOR ? undefined : colorHexFn(b.label),
      })),
    },
    {
      title: "登场费用",
      bars: tally(
        cards,
        (c) => (c.play_cost != null ? `${c.play_cost} Cost` : null),
        { sort: "label-num" },
      ),
    },
    {
      title: "特征 (Traits)",
      bars: tally(traitCards, (c) => c.digi_types, {
        sort: "count",
        limit: 10,
      }),
    },
    {
      title: "DP",
      bars: tally(
        cards,
        (c) => (c.dp != null && c.dp > 0 ? c.dp.toLocaleString() : null),
        { sort: "label-num" },
      ),
    },
  ];
}

export type Loaded = {
  deck: {
    id: string;
    name: string;
    notes: string | null;
    accent_color: string;
    accent_color2: string | null;
    cover_card_id: string | null;
    /** Which printing of the cover card to show ('' = base art). */
    cover_variant: string;
    /** Pack this list is built for, e.g. 'BT-26'. See lib/deck-version. */
    version: string | null;
    /** Closed to edits — every write path refuses. */
    locked: boolean;
    /** Raw JSON from the import that made this deck. See lib/import-report. */
    import_report: string | null;
    updated_at: string;
    user_id: string | null;
  };
  /** Every pack, newest first — the version picker's vocabulary. */
  versionOptions: VersionOption[];
  /** What the deck's own cards imply the version should be. */
  autoVersion: string | null;
  /** Cards needing a pack newer than the recorded version. */
  newerThanVersion: number;
  cards: DeckCardData[];
  /** Considered swaps — display only; excluded from every other computation. */
  adjustments: Adjustment[];
  exportCards: DeckCardForExport[];
  statsPanels: StatPanel[];
  /** Digimon only: cardId → per-slot groups of deck cards its search can fetch. */
  searchTargets: Map<string, SearchGroup[]>;
  /** Digimon only: cardId → its ジョグレス conditions and the pairs in this
   *  deck that satisfy them. See lib/jogress. */
  jogress: Map<string, JogressView[]>;
  cover: {
    image_url: string | null;
    code: string;
    name: string;
    /** Cover card's `color`, mapped to hex. Used by the meta form's
     *  "应用封面卡颜色" button to populate the accent picker. */
    accent: string | null;
    /** Cover card's `color2`, mapped to hex. Null for single-color covers. */
    accent2: string | null;
    /** Every printing of the cover card (base + alt arts), so the owner can
     *  choose which one the deck shows. */
    arts: { variant: string; image_url: string }[];
  } | null;
  isDigimon: boolean;
};

export type DeckViewParams = {
  game: string;
  id: string;
  sp: { mode?: string; missing?: string; compare?: string };
  me: { id: string } | null;
};

/** The whole page's data, in the order the page reads it. */
export async function loadDeckView({ game, id, sp, me }: DeckViewParams) {
  // build / purchase mode require deck ownership. We can't decide that until
  // we've loaded the deck, so we compute the *requested* mode here and may
  // demote it to "browse" further down.
  const requestedMode: "browse" | "build" | "purchase" =
    sp.mode === "build"
      ? "build"
      : sp.mode === "purchase"
        ? "purchase"
        : "browse";
  if (!isGameId(game)) notFound();

  // Read once for the whole page: the deck grid, the adjustment picker and the
  // build-mode picker all need to agree on what language cards read in.
  const cardLangForPage = parseCardLang(
    (await cookies()).get(CARD_LANG_COOKIE)?.value,
  );

  const deck = digimon.getDeck(id);
  if (!deck) notFound();
  const cards = digimon.getDeckCards(id);
  // The viewer's own shelf, not the deck owner's — the question a tile answers
  // is "do I have this one", and that stays interesting on a friend's deck.
  const ownedCounts = me ? digimon.getOwnedCounts(me.id) : null;
  const cardLang = cardLangForPage;
  const tMap = digimon.getDisplayTranslations(
    cards.map((c) => c.code),
    cardLang,
  );
  const coverCard = deck.cover_card_id
    ? (cards.find((c) => c.id === deck.cover_card_id) ??
      digimon.getCardById(deck.cover_card_id))
    : undefined;
  // ジョグレス: which pairs already in this deck can make each card that DNA
  // digivolves. Matched against the Japanese rows (that's where the condition
  // is written — see lib/jogress) but displayed in the page's language.
  const jaFacts = digimon.getJapaneseFacts(cards.map((c) => c.code));
  const jogressPairs = computeDeckJogress(
    cards.map((c) => {
      const ja = jaFacts.get(c.code);
      return {
        id: c.id,
        code: c.code,
        name: c.name,
        card_type: c.card_type,
        color: c.color,
        color2: c.color2,
        level: c.level,
        quantity: c.quantity,
        jaName: ja?.name,
        jaTraits: ja?.traits,
        jaText: ja?.text,
        jaEvoReq: ja?.evo_req,
      };
    }),
  );
  const displayCard = (cardId: string) => {
    const c = cards.find((x) => x.id === cardId)!;
    const t = tMap.get(c.code);
    return {
      id: c.id,
      code: c.code,
      name: t?.name ?? c.name,
      image_url: t?.image_url ?? c.image_url,
    };
  };
  const jogress = new Map<string, JogressView[]>(
    [...jogressPairs].map(([cardId, options]) => [
      cardId,
      options.map((o) => ({
        label: o.label,
        cost: o.cost,
        parsed: o.parsed,
        pairs: o.pairs.map(
          ([a, b]) =>
            [displayCard(a), displayCard(b)] as [
              ReturnType<typeof displayCard>,
              ReturnType<typeof displayCard>,
            ],
        ),
      })),
    ]),
  );

  // Pack order comes from the official product list (the `sets` refresh
  // stage). Empty on a database that predates it — the picker then renders
  // nothing rather than offering a vocabulary of one.
  const cardSets = digimon.listCardSets();
  const setOrder = buildSetOrder(cardSets);

  const loaded: Loaded = {
    deck: {
      id: deck.id,
      name: deck.name,
      notes: deck.notes,
      accent_color: deck.accent_color,
      accent_color2: deck.accent_color2,
      cover_card_id: deck.cover_card_id,
      cover_variant: deck.cover_variant ?? "",
      version: deck.version ?? null,
      locked: !!deck.locked,
      import_report: deck.import_report ?? null,
      updated_at: deck.updated_at,
      user_id: deck.user_id,
    },
    versionOptions: cardSets.map((s) => ({
      code: s.code,
      name_ja: s.name_ja,
      name_en: s.name_en,
    })),
    autoVersion: deckVersionOf(cards, setOrder),
    // Counted in COPIES, not distinct cards — "3 张" is what a player counts,
    // and it's the number they'd have to take out.
    newerThanVersion: (() => {
      const newer = new Set(
        cardsNewerThan(deck.version ?? null, cards, setOrder).map(
          (c) => c.code,
        ),
      );
      return cards
        .filter((c) => newer.has(c.code))
        .reduce((n, c) => n + c.quantity, 0);
    })(),
    adjustments: digimon.listDeckAdjustments(id),
    cards: cards.map((c) => {
      const t = tMap.get(c.code);
      return {
        id: c.id,
        code: c.code,
        name: t?.name ?? c.name,
        sets: splitSetNames(c.set_names),
        color: c.color,
        rarity: c.rarity,
        image_url: t?.image_url ?? c.image_url,
        quantity: c.quantity,
        purchased: c.purchased,
        price: c.price,
        manualPrice: c.manual_price,
        market:
          c.market_price != null
            ? {
                price_yen: c.market_price,
                source: c.market_source ?? "",
                item_code: c.market_item_code ?? null,
              }
            : null,
        // 0 is a real answer here — only a signed-out viewer gets nothing.
        collected: ownedCounts ? (ownedCounts.get(c.id) ?? 0) : undefined,
      };
    }),
    // Search-target parsing relies on the EN effect wording — always feed
    // it the raw EN rows; only the rendered target names/art get localized.
    searchTargets: (() => {
      const m = computeDeckSearchTargets(
        cards.map((c) => ({
          id: c.id,
          code: c.code,
          name: c.name,
          card_type: c.card_type,
          color: c.color,
          digi_types: c.digi_types,
          image_url: c.image_url,
          main_effect: c.main_effect,
          inherited_effect: c.inherited_effect,
          security_effect: c.security_effect,
        })),
      );
      if (tMap.size === 0) return m;
      for (const groups of m.values()) {
        for (const g of groups) {
          g.targets = g.targets.map((tg) => {
            const t = tMap.get(tg.code);
            return t
              ? {
                  ...tg,
                  name: t.name ?? tg.name,
                  image_url: t.image_url ?? tg.image_url,
                }
              : tg;
          });
        }
      }
      return m;
    })(),
    jogress,
    exportCards: cards.map((c) => ({
      code: c.code,
      name: c.name,
      card_type: c.card_type,
      quantity: c.quantity,
    })),
    statsPanels: buildDigimonStats(
      cards.map((c) => ({
        card_type: c.card_type,
        color: c.color,
        color2: c.color2,
        level: c.level,
        play_cost: c.play_cost,
        dp: c.dp,
        digi_types: c.digi_types,
        quantity: c.quantity,
      })),
    ),
    cover: coverCard
      ? (() => {
          // Japanese art: the covers picture the physical (JP) cards, and
          // it must not shift with each viewer's language setting — the deck
          // is shown to friends too. getCardImages falls back to English for
          // cards with no JP art probed yet.
          const arts = digimon
            .getCardImages(coverCard.code, "ja")
            .map((v) => ({ variant: v.variant, image_url: v.image_url }));
          // Resolve the SAME printing the deck list resolves, so the banner
          // here and the tile over there never disagree. Note the blank
          // variant is a real entry in `arts` (the base print) — looking it
          // up rather than falling straight through to coverCard.image_url
          // is what keeps the banner Japanese like everything else.
          const picked = arts.find(
            (a) => a.variant === (deck.cover_variant ?? ""),
          );
          return {
            image_url: picked?.image_url ?? coverCard.image_url,
            code: coverCard.code,
            name: coverCard.name,
            accent: coverCard.color ? colorHex(coverCard.color) : null,
            // Digimon `color2` may be empty string for single-color cards.
            accent2: coverCard.color2 ? colorHex(coverCard.color2) : null,
            arts,
          };
        })()
      : null,
    isDigimon: true,
  };

  // Ownership gate: only the deck's owner can use build / purchase modes.
  // Anyone else (friend viewing) is silently demoted to browse, and the
  // mode-switcher tabs hide the disallowed options.
  const mine = me !== null && loaded.deck.user_id === me.id;
  // A locked deck is your deck that you've closed: still yours (the lock
  // button, the export menu and the pool picker stay), but every editing
  // affordance goes away and build/purchase demote to browse — the same
  // demotion a friend's deck gets, for a different reason.
  const canEdit = mine && !loaded.deck.locked;
  const mode: "browse" | "build" | "purchase" = canEdit
    ? requestedMode
    : "browse";
  // Shared pools, for the toolbar select. Only the owner can change
  // membership, so someone else's view doesn't need the query at all.
  const pools = mine && me ? digimon.listGroups(me.id) : [];
  // Purchase mode defaults to "only still-missing cards" — that's the
  // shopping view you actually want when you open it. Showing every card
  // (including ones already bought) is opt-in via ?missing=0.
  const missingOnly = mode === "purchase" && sp.missing !== "0";

  // 卡组对比: which other deck this one is being held up against.
  //
  // It lives in the URL rather than in component state because the diff is
  // server-rendered — the picker is a set of links, so choosing a deck is one
  // navigation and the result comes back already computed. It also means a
  // comparison survives a reload and can be sent to someone.
  //
  // Any logged-in user may read any deck here (the app's decks are
  // friend-readable), which is the same set the picker lists.
  const otherDecks = me
    ? digimon.listDecks(me.id).filter((d) => d.id !== loaded.deck.id)
    : [];
  const compareDeck = sp.compare
    ? (otherDecks.find((d) => d.id === sp.compare) ?? null)
    : null;
  const compareCards = compareDeck
    ? digimon.overlayDisplay(
        digimon.getDeckCards(compareDeck.id),
        cardLangForPage,
      )
    : null;
  // Keep the current mode (and the purchase view's 全部/仅缺货 choice) when
  // switching comparison on and off — comparing is not a different page.
  const compareKeep = (() => {
    const p = new URLSearchParams();
    if (mode !== "browse") p.set("mode", mode);
    if (mode === "purchase" && !missingOnly) p.set("missing", "0");
    return p.toString();
  })();
  const compareBase = `/${game}/decks/${loaded.deck.id}`;
  const compareClearHref = compareKeep
    ? `${compareBase}?${compareKeep}`
    : compareBase;
  const compareHrefPrefix = compareKeep
    ? `${compareBase}?${compareKeep}&compare=`
    : `${compareBase}?compare=`;

  // Reported, never applied — see DeckRestrictionNotice.
  const restrictionIssues = digimon.deckRestrictionIssues(loaded.deck.id);
  const issueByCardId = new Map(restrictionIssues.map((i) => [i.card_id, i]));

  const total = loaded.cards.reduce((s, c) => s + c.quantity, 0);
  const eggs = loaded.isDigimon
    ? digimon
        .getDeckCards(loaded.deck.id)
        .filter((c) => c.card_type === "Digi-Egg")
        .reduce((s, c) => s + c.quantity, 0)
    : 0;
  const main = total - eggs;

  // Color distribution
  // Fed from the raw rows, not `loaded.cards`: DeckCardData has no `color2`,
  // and the same tally rendered from two different shapes is how these chips
  // and the 卡组分布 panel came to disagree in the first place.
  const colorBreakdown = tallyColors(cards);

  // Same rule the deck-list tile judges by — see lib/deck-legality.
  const target = DECK_TARGET;
  const mainOk = main === target.main;
  const eggOk = eggs <= target.egg;

  // Export strings
  const exportText = exportDeckText(loaded.exportCards);
  const exportUrl = exportDigimoncardIoUrl(loaded.exportCards);

  // Purchase stats
  const totalWanted = loaded.cards.reduce((s, c) => s + c.quantity, 0);
  const totalOwned = loaded.cards.reduce(
    (s, c) => s + Math.min(c.quantity, c.purchased),
    0,
  );
  const totalMissing = totalWanted - totalOwned;
  const completedCards = loaded.cards.filter(
    (c) => c.purchased >= c.quantity,
  ).length;
  const purchaseProgress =
    totalWanted === 0 ? 0 : Math.round((totalOwned / totalWanted) * 100);

  // Price totals. `price` is already the typed number or, failing that, the
  // cheaper shop quote — see getDeckCards.
  const pricedCards = loaded.cards.filter((c) => c.price != null);
  const totalPrice = pricedCards.reduce(
    (s, c) => s + (c.price ?? 0) * c.quantity,
    0,
  );
  // Still-needed cost in purchase mode (unbought copies × price).
  const remainingPrice = pricedCards.reduce(
    (s, c) => s + (c.price ?? 0) * Math.max(0, c.quantity - c.purchased),
    0,
  );
  // While you're inside a deck, the app wears the deck's colour: the mode
  // tabs, buttons and focus rings match the list you're reading instead of the
  // site. The <style> unmounts with the page, so leaving puts the app's own
  // accent back — no cleanup, no flash on the way out.
  const themeCss = deckThemeCss(
    loaded.deck.accent_color,
    loaded.deck.accent_color2,
  );

  return {
    cardLangForPage,
    loaded,
    mine,
    canEdit,
    mode,
    pools,
    missingOnly,
    otherDecks,
    compareDeck,
    compareCards,
    compareClearHref,
    compareHrefPrefix,
    restrictionIssues,
    issueByCardId,
    eggs,
    main,
    colorBreakdown,
    target,
    mainOk,
    eggOk,
    exportText,
    exportUrl,
    totalWanted,
    totalOwned,
    totalMissing,
    completedCards,
    purchaseProgress,
    totalPrice,
    remainingPrice,
    themeCss,
  };
}
