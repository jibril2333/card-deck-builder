import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { isGameId, type GameId, colorHex, GAMES } from "@/lib/games";
import { CARD_LANG_COOKIE, parseCardLang } from "@/lib/card-lang";
import { splitSetNames } from "@/lib/card-sets";
import { DeckCard, type DeckCardData } from "@/components/deck-card";
import { CardPoolDrawer, type PoolCard } from "@/components/card-pool-drawer";
import { DeckCardSearch } from "@/components/deck-card-search";
import { CardPreviewProvider } from "@/components/card-preview";
import { DeckMetaForm } from "@/components/deck-meta-form";
import { CoverVariantPicker } from "@/components/cover-variant-picker";
import { DeckImageExport } from "@/components/deck-image-export";
import {
  computeDeckSearchTargets,
  type SearchGroup,
} from "@/lib/deck-search";
import { DeckStats, type StatPanel } from "@/components/deck-stats";
import {
  DeckAdjustments,
  type Adjustment,
} from "@/components/deck-adjustments";
import { colorHex as colorHexFn } from "@/lib/games";
import {
  exportDeckText,
  exportDigimoncardIoUrl,
  type DeckCardForExport,
} from "@/lib/deck-formats";
import { getCurrentUser } from "@/lib/auth/session";
import * as digimon from "@/lib/db/digimon";

type RawDeckCard = {
  card_type: string;
  color?: string | null;
  level?: number | null;
  play_cost?: number | null;
  dp?: number | null;
  digi_types?: string | null;
  energy_cost?: number | null;
  ap_cost?: number | null;
  bp?: number | null;
  series?: string | null;
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
    { title: "卡片类型", bars: tally(cards, (c) => c.card_type, { sort: "count" }) },
    {
      title: "等级",
      bars: tally(cards, (c) => (c.level != null ? `Lv.${c.level}` : null), {
        sort: "label-num",
      }),
    },
    {
      title: "颜色",
      bars: tally(cards, (c) => c.color, {
        sort: "count",
        color: (l) => colorHexFn(l),
      }),
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
      bars: tally(traitCards, (c) => c.digi_types, { sort: "count", limit: 10 }),
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

function buildUAStats(cards: RawDeckCard[]): StatPanel[] {
  return [
    { title: "类型", bars: tally(cards, (c) => c.card_type, { sort: "count" }) },
    {
      title: "颜色",
      bars: tally(cards, (c) => c.color, {
        sort: "count",
        color: (l) => colorHexFn(l),
      }),
    },
    {
      title: "Energy",
      bars: tally(
        cards,
        (c) => (c.energy_cost != null ? `${c.energy_cost}` : null),
        { sort: "label-num" },
      ),
    },
    {
      title: "AP",
      bars: tally(cards, (c) => (c.ap_cost != null ? `${c.ap_cost}` : null), {
        sort: "label-num",
      }),
    },
    {
      title: "BP",
      bars: tally(
        cards,
        (c) => (c.bp != null && c.bp > 0 ? c.bp.toLocaleString() : null),
        { sort: "label-num" },
      ),
    },
    {
      title: "作品 (Series)",
      bars: tally(cards, (c) => c.series, { sort: "count", limit: 8 }),
    },
  ];
}

export const dynamic = "force-dynamic";

type Loaded = {
  deck: {
    id: string;
    name: string;
    notes: string | null;
    accent_color: string;
    accent_color2: string | null;
    /** UA only — null for Digimon (no column). */
    locked_series: string | null;
    /** UA only — null for Digimon (no column). */
    locked_color: string | null;
    cover_card_id: string | null;
    /** Which printing of the cover card to show ('' = base art). */
    cover_variant: string;
    updated_at: string;
    user_id: string | null;
  };
  cards: DeckCardData[];
  /** Considered swaps — display only; excluded from every other computation. */
  adjustments: Adjustment[];
  exportCards: DeckCardForExport[];
  statsPanels: StatPanel[];
  /** Digimon only: cardId → per-slot groups of deck cards its search can fetch. */
  searchTargets: Map<string, SearchGroup[]>;
  cover: {
    image_url: string | null;
    code: string;
    name: string;
    /** Cover card's `color`, mapped to hex. Used by the meta form's
     *  "应用封面卡颜色" button to populate the accent picker. */
    accent: string | null;
    /** Cover card's `color2`, mapped to hex. Null for single-color covers
     *  and always null on UA (UA cards have no color2 column). */
    accent2: string | null;
    /** Every printing of the cover card (base + alt arts), so the owner can
     *  choose which one the deck shows. Digimon only — on UA each printing is
     *  its own card, so picking one is just picking a different cover card. */
    arts: { variant: string; image_url: string }[];
  } | null;
  isDigimon: boolean;
};

export default async function DeckEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ game: string; id: string }>;
  searchParams: Promise<{ mode?: string; missing?: string }>;
}) {
  const me = await getCurrentUser();
  const { game, id } = await params;
  const sp = await searchParams;
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
  const cardLang = cardLangForPage;
  const tMap = digimon.getDisplayTranslations(
    cards.map((c) => c.code),
    cardLang,
  );
  const coverCard = deck.cover_card_id
    ? cards.find((c) => c.id === deck.cover_card_id) ??
      digimon.getCardById(deck.cover_card_id)
    : undefined;
  const loaded: Loaded = {
    deck: {
      id: deck.id,
      name: deck.name,
      notes: deck.notes,
      accent_color: deck.accent_color,
      accent_color2: deck.accent_color2,
      // Digimon's user.decks has no locked_series/locked_color columns.
      locked_series: null,
      locked_color: null,
      cover_card_id: deck.cover_card_id,
      cover_variant: deck.cover_variant ?? "",
      updated_at: deck.updated_at,
      user_id: deck.user_id,
    },
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
}
