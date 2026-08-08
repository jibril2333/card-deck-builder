import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { isGameId, type GameId, colorHex, GAMES } from "@/lib/games";
import { CARD_LANG_COOKIE, parseCardLang } from "@/lib/card-lang";
import { splitSetNames } from "@/lib/card-sets";
import { DeckCard, type DeckCardData } from "@/components/deck-card";
import { CardPoolDrawer, type PoolCard } from "@/components/card-pool-drawer";
import { DeckCardSearch } from "@/components/deck-card-search";
import { CardPreviewProvider } from "@/components/card-preview";
import { DeckHeader } from "@/components/deck-header";
import { DeckDeleteButton } from "@/components/deck-delete-button";
import { DeckPoolPicker } from "@/components/deck-pool-picker";
import { DeckExportMenu } from "@/components/deck-export-menu";
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
import * as ua from "@/lib/db/unionarena";

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

  let loaded: Loaded;
  if (game === "digimon") {
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
    loaded = {
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
  } else {
    // Heal legacy UA decks: ones built before the lock feature have cards
    // but NULL locks. If the viewer owns this deck and its cards all share
    // one series/color, infer + persist the lock now — so the deck shows
    // its locks and gets the quick-add pool like freshly-built decks. No-op
    // for non-owners, already-locked decks, empty decks, or mixed decks.
    if (me) ua.backfillLockFromCards(me.id, id);
    const deck = ua.getDeck(id);
    if (!deck) notFound();
    const cards = ua.getDeckCards(id);
    const coverCard = deck.cover_card_id
      ? cards.find((c) => c.id === deck.cover_card_id) ??
        ua.getCardById(deck.cover_card_id)
      : undefined;
    loaded = {
      deck: {
        id: deck.id,
        name: deck.name,
        notes: deck.notes,
        accent_color: deck.accent_color,
        accent_color2: deck.accent_color2,
        locked_series: deck.locked_series,
        locked_color: deck.locked_color,
        cover_card_id: deck.cover_card_id,
        cover_variant: deck.cover_variant ?? "",
        updated_at: deck.updated_at,
        user_id: deck.user_id,
      },
      adjustments: ua.listDeckAdjustments(id),
      cards: cards.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        color: c.color,
        rarity: c.rarity,
        image_url: c.image_url,
        quantity: c.quantity,
        purchased: c.purchased,
        price: c.price,
      })),
      // UA cards have no trait-search mechanic in our data — no badges.
      searchTargets: new Map(),
      exportCards: cards.map((c) => ({
        code: c.code,
        name: c.name,
        card_type: c.card_type,
        quantity: c.quantity,
      })),
      statsPanels: buildUAStats(
        cards.map((c) => ({
          card_type: c.card_type,
          color: c.color,
          energy_cost: c.energy_cost,
          ap_cost: c.ap_cost,
          bp: c.bp,
          series: c.series,
          quantity: c.quantity,
        })),
      ),
      cover: coverCard
        ? {
            image_url: coverCard.image_url,
            code: coverCard.code,
            name: coverCard.name,
            accent: coverCard.color ? colorHex(coverCard.color) : null,
            // UA cards have no color2 column — single-color only.
            accent2: null,
            // UA keeps each printing as its own card row, so "pick an alt art"
            // is just picking a different cover card — nothing to choose here.
            arts: [],
          }
        : null,
      isDigimon: false,
    };
  }

  // Ownership gate: only the deck's owner can use build / purchase modes.
  // Anyone else (friend viewing) is silently demoted to browse, and the
  // mode-switcher tabs hide the disallowed options.
  const mine = me !== null && loaded.deck.user_id === me.id;
  const mode: "browse" | "build" | "purchase" = mine
    ? requestedMode
    : "browse";
  // Shared pools, for the sidebar picker. Only the owner can change membership,
  // so someone else's view doesn't need the query at all.
  const pools =
    mine && me
      ? game === "digimon"
        ? digimon.listGroups(me.id)
        : ua.listGroups(me.id)
      : [];
  // Purchase mode defaults to "only still-missing cards" — that's the
  // shopping view you actually want when you open it. Showing every card
  // (including ones already bought) is opt-in via ?missing=0.
  const missingOnly = mode === "purchase" && sp.missing !== "0";

  // In-deck card pool (quick-add drawer). Only for a LOCKED UA deck the
  // owner is building — the pool is every card matching the deck's locked
  // 作品 + 颜色, which is small enough to browse inline. Digimon decks and
  // unlocked/empty UA decks get no pool (null) and keep using card search.
  let cardPool: PoolCard[] | null = null;
  if (
    !loaded.isDigimon &&
    mine &&
    mode === "build" &&
    loaded.deck.locked_series &&
    loaded.deck.locked_color
  ) {
    const qtyByCardId = new Map(
      loaded.cards.map((c) => [c.id, c.quantity] as const),
    );
    const { rows } = ua.searchCards({
      series_list: [loaded.deck.locked_series],
      colors: [loaded.deck.locked_color],
      sort_field: "energy_cost",
      sort_dir: "asc",
      limit: 1000,
    });
    cardPool = rows.map((r) => ({
      id: r.id,
      code: r.base_code,
      name: r.name,
      image_url: r.image_url,
      rarity: r.rarity,
      quantity: qtyByCardId.get(r.id) ?? 0,
    }));
  }

  const total = loaded.cards.reduce((s, c) => s + c.quantity, 0);
  const eggs = loaded.isDigimon
    ? digimon
        .getDeckCards(loaded.deck.id)
        .filter((c) => c.card_type === "Digi-Egg")
        .reduce((s, c) => s + c.quantity, 0)
    : 0;
  const main = total - eggs;

  // Color distribution
  const colorMap = new Map<string, number>();
  for (const c of loaded.cards) {
    const k = c.color ?? "Unknown";
    colorMap.set(k, (colorMap.get(k) ?? 0) + c.quantity);
  }
  const colorBreakdown = [...colorMap.entries()].sort((a, b) => b[1] - a[1]);

  // Targets per game
  const target = loaded.isDigimon
    ? { main: 50, egg: 5 }
    : { main: 50, egg: 0 };
  const mainOk = main === target.main;
  const eggOk = loaded.isDigimon ? eggs <= target.egg : true;

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

  // Expected price totals (only counts cards that have a price filled in).
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
  const fmtPrice = (n: number) =>
    "¥" + n.toLocaleString("zh-CN", { maximumFractionDigits: 2 });

  return (
    <>
      <main className="w-full px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        <section className="min-w-0">
          <BackLink
            fallback={`/${game}/decks`}
            className="text-sm text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] inline-flex items-center gap-1 mb-3"
          >
            ← 全部卡组
          </BackLink>
          <DeckHeader
            game={game}
            deck={loaded.deck}
            cover={loaded.cover}
            mine={mine}
          />

          {/* mode switcher — only show build/purchase tabs if this deck is mine */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
          <div className="flex items-center gap-1 p-0.5 border border-[var(--color-border)] rounded-lg bg-[var(--color-card)] w-fit">
            <Link
              href={`/${game}/decks/${loaded.deck.id}`}
              replace
              scroll={false}
              className={`px-3 h-8 rounded-md text-sm flex items-center gap-1.5 transition-colors ${
                mode === "browse"
                  ? "bg-[var(--color-muted)] text-[var(--color-fg)] font-medium"
                  : "text-[var(--color-muted-fg)] hover:text-[var(--color-fg)]"
              }`}
            >
              👁 浏览
            </Link>
            {mine ? (
              <>
                <Link
                  href={`/${game}/decks/${loaded.deck.id}?mode=build`}
                  replace
                  scroll={false}
                  className={`px-3 h-8 rounded-md text-sm flex items-center gap-1.5 transition-colors ${
                    mode === "build"
                      ? "bg-[var(--color-muted)] text-[var(--color-fg)] font-medium"
                      : "text-[var(--color-muted-fg)] hover:text-[var(--color-fg)]"
                  }`}
                >
                  🛠 组建
                </Link>
                <Link
                  href={`/${game}/decks/${loaded.deck.id}?mode=purchase`}
                  replace
                  scroll={false}
                  className={`px-3 h-8 rounded-md text-sm flex items-center gap-1.5 transition-colors ${
                    mode === "purchase"
                      ? "bg-[var(--color-muted)] text-[var(--color-fg)] font-medium"
                      : "text-[var(--color-muted-fg)] hover:text-[var(--color-fg)]"
                  }`}
                >
                  🛒 购买
                </Link>
              </>
            ) : null}
          </div>

          <Link
            href={`/${game}/decks/${loaded.deck.id}/playtest`}
            className="px-3 h-8 rounded-md text-sm border border-[var(--color-border)] bg-[var(--color-card)] hover:bg-[var(--color-muted)] flex items-center gap-1.5"
            title="起手模拟 + 抽到概率计算"
          >
            🎲 试玩
          </Link>
          <DeckExportMenu
            text={exportText}
            url={exportUrl}
            deckName={loaded.deck.name}
            accent={loaded.deck.accent_color}
            accent2={loaded.deck.accent_color2}
            gameLabel={GAMES[game as GameId].label}
            subtitle={
              loaded.isDigimon
                ? `主卡组 ${main} 张 · 蛋卡 ${eggs} 张`
                : `共 ${main} 张`
            }
            cards={loaded.cards.map((c) => ({
              code: c.code,
              name: c.name,
              image_url: c.image_url ?? null,
              quantity: c.quantity,
            }))}
          />
          {/* Build mode: find and add cards without leaving the deck. Shares
              the toolbar row, pushed to the right edge by ml-auto — it wraps
              onto its own line on narrow screens like the rest of the row. */}
          {mode === "build" ? (
            <DeckCardSearch
              game={game}
              deckId={loaded.deck.id}
              lang={cardLangForPage}
            />
          ) : null}
          </div>

          {cardPool ? (
            <div className="mt-3">
              <CardPoolDrawer
                game={game}
                deckId={loaded.deck.id}
                pool={cardPool}
              />
            </div>
          ) : null}

          {mode !== "purchase" ? (
            <>
              {/* Counts and colour split share one line: both answer "what is
                  in this deck right now", and on their own rows they pushed
                  the cards a whole line further down for no added meaning. */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-3">
                <div className="text-xs text-[var(--color-muted-fg)]">
                  主卡组 {main} / {target.main}
                  {loaded.isDigimon ? ` · 蛋卡 ${eggs} / ${target.egg}` : null}
                  {totalPrice > 0 ? (
                    <span className="ml-2">
                      · 预期总价{" "}
                      <b className="text-[var(--color-accent2)]">
                        {fmtPrice(totalPrice)}
                      </b>
                    </span>
                  ) : null}
                  {!mainOk ? (
                    <span className="ml-2 text-red-500">主卡组数量不达标</span>
                  ) : null}
                  {!eggOk ? (
                    <span className="ml-2 text-red-500">
                      蛋卡超过 {target.egg} 张
                    </span>
                  ) : null}
                </div>

                {colorBreakdown.length ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {colorBreakdown.map(([c, n]) => (
                      <span key={c} className="chip">
                        <span
                          className="chip-dot"
                          style={{ background: colorHex(c) }}
                        />
                        {c} · {n}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2">
              <div className="flex items-baseline justify-between gap-3">
                <div className="text-xs flex items-baseline gap-1.5 flex-wrap">
                  <span className="font-semibold text-sm tabular-nums">
                    {totalOwned}
                  </span>
                  <span className="text-[var(--color-muted-fg)]">
                    / {totalWanted} 已购
                  </span>
                  {totalMissing > 0 ? (
                    <span className="text-amber-600 dark:text-amber-400">
                      · 还差 <b>{totalMissing}</b>
                      {remainingPrice > 0 ? (
                        <span> · 约 {fmtPrice(remainingPrice)}</span>
                      ) : null}
                    </span>
                  ) : totalWanted > 0 ? (
                    <span className="text-green-600 dark:text-green-400">
                      · ✓ 凑齐
                    </span>
                  ) : null}
                </div>
                <div className="text-[10px] text-[var(--color-muted-fg)] tabular-nums whitespace-nowrap">
                  {completedCards} / {loaded.cards.length} 卡位齐全
                  {totalPrice > 0 ? ` · 总价 ${fmtPrice(totalPrice)}` : ""}
                </div>
              </div>
              <div className="h-1 rounded-full bg-[var(--color-muted)] overflow-hidden mt-1.5">
                <div
                  className={`h-full transition-all ${
                    purchaseProgress === 100 ? "bg-green-500" : "bg-amber-500"
                  }`}
                  style={{ width: `${purchaseProgress}%` }}
                />
              </div>
              <div className="flex items-center justify-between gap-3 mt-2">
                <div className="flex items-center gap-0.5 p-0.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]">
                  <Link
                    href={`/${game}/decks/${loaded.deck.id}?mode=purchase&missing=0`}
                    replace
                    scroll={false}
                    className={`px-2.5 h-6 rounded text-[11px] flex items-center transition-colors ${
                      !missingOnly
                        ? "bg-[var(--color-muted)] text-[var(--color-fg)] font-medium"
                        : "text-[var(--color-muted-fg)] hover:text-[var(--color-fg)]"
                    }`}
                  >
                    全部
                  </Link>
                  <Link
                    href={`/${game}/decks/${loaded.deck.id}?mode=purchase`}
                    replace
                    scroll={false}
                    className={`px-2.5 h-6 rounded text-[11px] flex items-center gap-1 transition-colors ${
                      missingOnly
                        ? "bg-[var(--color-muted)] text-[var(--color-fg)] font-medium"
                        : "text-[var(--color-muted-fg)] hover:text-[var(--color-fg)]"
                    }`}
                  >
                    仅缺货
                    {totalMissing > 0 ? (
                      <span className="inline-flex items-center justify-center min-w-[1rem] h-3.5 px-1 rounded-full bg-amber-500 text-white text-[9px] font-bold tabular-nums">
                        {totalMissing}
                      </span>
                    ) : null}
                  </Link>
                </div>
                <span className="text-[10px] text-[var(--color-muted-fg)] whitespace-nowrap">
                  绿=凑齐 · 橙=缺 · 灰=未买
                </span>
              </div>
            </div>
          )}

          {(() => {
            const visibleCards = missingOnly
              ? loaded.cards.filter((c) => c.purchased < c.quantity)
              : loaded.cards;
            if (loaded.cards.length === 0) {
              return (
                <div className="mt-6 p-12 text-sm text-center text-[var(--color-muted-fg)] border border-dashed border-[var(--color-border)] rounded-lg">
                  空卡组。
                  <Link
                    href={`/${game}`}
                    className="underline ml-1 hover:text-[var(--color-fg)]"
                  >
                    去检索卡牌 →
                  </Link>
                </div>
              );
            }
            if (visibleCards.length === 0) {
              return (
                <div className="mt-6 p-12 text-sm text-center text-[var(--color-muted-fg)] border border-dashed border-[var(--color-border)] rounded-lg">
                  🎉 全部凑齐了！
                  <Link
                    href={`/${game}/decks/${loaded.deck.id}?mode=purchase&missing=0`}
                    replace
                    className="underline ml-1 hover:text-[var(--color-fg)]"
                    scroll={false}
                  >
                    显示全部 →
                  </Link>
                </div>
              );
            }
            return (
              <CardPreviewProvider>
                <div className="mt-6 card-grid">
                  {visibleCards.map((c) => (
                    <DeckCard
                      key={c.id}
                      game={game}
                      deckId={loaded.deck.id}
                      card={c}
                      isCover={c.id === loaded.deck.cover_card_id}
                      mode={mode}
                      mine={mine}
                      searchTargets={loaded.searchTargets.get(c.id)}
                    />
                  ))}
                </div>
              </CardPreviewProvider>
            );
          })()}

          {/* Owner-only scratch list of swaps under consideration. Sits below
              the deck itself and feeds into nothing else. */}
          {mine ? (
            <DeckAdjustments
              game={game}
              deckId={loaded.deck.id}
              items={loaded.adjustments}
              lang={cardLangForPage}
            />
          ) : null}

        </section>

        <aside className="space-y-4">
          {/* Someone else's deck: say so once, here. Name and notes now live
              in the banner, so this panel would otherwise repeat them. */}
          {!mine ? (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4 text-xs text-[var(--color-muted-fg)]">
              这是别人的卡组,你只能浏览。
            </div>
          ) : null}

          {mine ? (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
              <DeckPoolPicker
                game={game}
                deckId={loaded.deck.id}
                pools={pools}
                memberOf={pools
                  .filter((p) => p.decks.some((d) => d.id === loaded.deck.id))
                  .map((p) => p.id)}
              />
            </div>
          ) : null}

          {loaded.cards.length > 0 ? (
            <DeckStats panels={loaded.statsPanels} />
          ) : null}

          {/* Last thing in the column, deliberately: the banner above is full
              of click-to-edit fields, and this is the one action there is no
              undo for. */}
          {mine ? (
            <DeckDeleteButton
              game={game}
              deckId={loaded.deck.id}
              deckName={loaded.deck.name}
            />
          ) : null}
        </aside>
      </main>
    </>
  );
}
