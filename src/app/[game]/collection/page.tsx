/**
 * Collection page — same structure as the cards search page (filter rail +
 * grid + pagination) but every tile is a `CollectionTile` with quantity
 * controls. Two semantic differences from the search page:
 *
 *   1. `show_alt_arts` is forced to `true`. The user explicitly wants every
 *      printing on its own row so a base + each parallel can be counted
 *      independently. We don't expose the toggle in the filter list.
 *   2. No `×` removal button on a tile. The − button alone is enough; when
 *      qty hits zero the tile stays visible (this page is browsing all
 *      cards, not just owned ones) so you can re-add.
 *
 * The grid renders ALL matching cards, not just owned ones — so the page
 * doubles as a "browse-and-record" tool: filter by set, scroll, tap + on
 * the ones you have.
 */

import { Pagination } from "@/components/pagination";
import { notFound } from "next/navigation";
import { isGameId } from "@/lib/games";
import type { CardLang } from "@/lib/card-lang";

/**
 * The collection is a record of physical cards, and those are Japanese
 * printings — so this page pins itself to Japanese names and Japanese art
 * rather than following the site's language toggle (which is about what you
 * want to READ, not what you own).
 */
const COLLECTION_LANG: CardLang = "ja";
import {
  pickStr,
  pickList,
  pickNum,
  pickSort,
  type SearchParamsRecord,
  countActiveFilters,
} from "@/lib/search-params";
import {
  CollectionTile,
  type CollectionTileCard,
} from "@/components/collection-tile";
import { FilterForm, type FilterField } from "@/components/filter-form";
import { FilterPanel } from "@/components/filter-panel";
import { ActiveFilters, type ChipSpec } from "@/components/active-filters";
import { requireUser } from "@/lib/auth/session";
import * as digimon from "@/lib/db/digimon";
import { getMessages } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

type TileRow = CollectionTileCard & {
  quantity: number;
  restriction: {
    status: "banned" | "limited_1" | "limited_2";
    max_count: number;
  } | null;
};

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ game: string }>;
  searchParams: Promise<SearchParamsRecord>;
}) {
  const m = await getMessages();
  const me = await requireUser();
  const { game } = await params;
  if (!isGameId(game)) notFound();
  const sp = await searchParams;
  const page = Math.max(1, pickNum(sp, "page") ?? 1);
  const offset = (page - 1) * PAGE_SIZE;
  const sort = pickSort(sp);
  // "1" own it, "0" don't, absent means the whole card pool.
  const ownedRaw = pickStr(sp, "owned");
  const ownedParam =
    ownedRaw === "1"
      ? ("yes" as const)
      : ownedRaw === "0"
        ? ("no" as const)
        : undefined;

  const colors = digimon.distinct("color");
  const types = digimon.distinct("card_type");
  const rarities = [
    ...new Set(digimon.distinct("rarity").map((r) => r.toUpperCase())),
  ].sort();
  const forms = digimon.distinct("form");
  const stages = digimon.distinct("stage");
  const attributes = digimon.distinct("attribute");
  const levels = digimon.distinctNumbers("level");
  const playCosts = digimon.distinctNumbers("play_cost");
  const dps = digimon.distinctNumbers("dp");
  const setNames = digimon.distinctSetNames();

  const fields: FilterField[] = [
    {
      type: "search",
      key: "q",
      label: m.filters.keyword,
      placeholder: m.filters.keywordPlaceholder,
      wideKey: "q_all",
      wideLabel: m.filters.searchEffectsAndTraits,
    },
    {
      // The page lists every card so you can tick off what arrives; this is
      // what turns it back into a view of the shelf, or of the holes in it.
      type: "select",
      key: "owned",
      label: m.filters.owned,
      options: [
        { value: "1", label: m.filters.ownedYes },
        { value: "0", label: m.filters.ownedNo },
      ],
    },
    {
      type: "multi",
      key: "color",
      label: m.filters.color,
      options: colors,
      colorChips: true,
      maxSelect: 2,
    },
    { type: "multi", key: "card_type", label: m.filters.type, options: types },
    { type: "multi", key: "rarity", label: m.filters.rarity, options: rarities },
    { type: "range", key: "level", label: m.filters.level, options: levels },
    { type: "range", key: "play_cost", label: m.filters.cost, options: playCosts },
    {
      type: "range",
      key: "dp",
      label: "DP",
      options: dps.map((n) => ({ value: n, label: n.toLocaleString() })),
    },
    {
      type: "group",
      key: "more",
      label: m.filters.moreFilters,
      fields: [
        { type: "multi", key: "form", label: "Form", options: forms },
        { type: "multi", key: "stage", label: "Stage", options: stages },
        { type: "multi", key: "attribute", label: m.filters.attribute, options: attributes },
        {
          type: "multi-scroll",
          key: "set",
          label: m.filters.cardSetLong,
          options: setNames,
        },
      ],
    },
  ];

  const sortOptions: { value: string; label: string }[] = [
    { value: "code", label: `${m.filters.code} ↑` },
    { value: "-code", label: `${m.filters.code} ↓` },
    { value: "name", label: `${m.filters.name} ↑` },
    { value: "-name", label: `${m.filters.name} ↓` },
    { value: "level", label: `${m.filters.level} ↑` },
    { value: "-level", label: `${m.filters.level} ↓` },
    { value: "play_cost", label: `${m.filters.cost} ↑` },
    { value: "-play_cost", label: `${m.filters.cost} ↓` },
    { value: "dp", label: "DP ↑" },
    { value: "-dp", label: "DP ↓" },
  ];

  const chipSpecs: ChipSpec[] = [
    { kind: "terms", key: "q", label: m.filters.keyword },
    {
      kind: "single",
      key: "owned",
      label: m.filters.owned,
      labelMap: { "1": m.filters.ownedYes, "0": m.filters.ownedNo },
    },
    { kind: "list", key: "color", label: m.filters.color },
    { kind: "list", key: "card_type", label: m.filters.type },
    { kind: "list", key: "rarity", label: m.filters.rarity },
    { kind: "list", key: "form", label: "Form" },
    { kind: "list", key: "stage", label: "Stage" },
    { kind: "list", key: "attribute", label: m.filters.attribute },
    { kind: "list", key: "set", label: m.filters.cardSet },
    {
      kind: "range",
      minKey: "level_min",
      maxKey: "level_max",
      label: m.filters.level,
    },
    {
      kind: "range",
      minKey: "play_cost_min",
      maxKey: "play_cost_max",
      label: m.filters.cost,
    },
    { kind: "range", minKey: "dp_min", maxKey: "dp_max", label: "DP" },
  ];

  const r = digimon.searchCards({
    q: pickStr(sp, "q"),
    // Same default as the card browser: names and codes, ranked by how well
    // the name matches, with effect text behind the checkbox.
    q_mode: pickStr(sp, "q_all") === "1" ? "all" : "name",
    colors: pickList(sp, "color"),
    card_types: pickList(sp, "card_type"),
    rarities: pickList(sp, "rarity"),
    forms: pickList(sp, "form"),
    stages: pickList(sp, "stage"),
    attributes: pickList(sp, "attribute"),
    sets: pickList(sp, "set"),
    level_min: pickNum(sp, "level_min"),
    level_max: pickNum(sp, "level_max"),
    play_cost_min: pickNum(sp, "play_cost_min"),
    play_cost_max: pickNum(sp, "play_cost_max"),
    dp_min: pickNum(sp, "dp_min"),
    dp_max: pickNum(sp, "dp_max"),
    has_inherited: pickStr(sp, "has_inherited") === "1",
    has_security: pickStr(sp, "has_security") === "1",
    owned: ownedParam,
    owned_by: me.id,
    show_alt_arts: true, // ← collection page forces alt-art expansion
    // The physical cards on the shelf are the Japanese printings, so this
    // page always shows those — independent of the site language toggle,
    // which only decides what language you want to READ cards in.
    art_lang: COLLECTION_LANG,
    sort_field: sort.field,
    sort_dir: sort.dir,
    limit: PAGE_SIZE,
    offset,
  });
  const collMap = digimon.getCollectionMap(me.id);
  const restrictionMap = digimon.getRestrictionMap(r.rows.map((c) => c.id));
  // Tiles here are per-PRINTING (alt arts expanded), so keep each tile's
  // own art and only localize the name.
  const tMap = digimon.getDisplayTranslations(
    r.rows.map((c) => c.code),
    COLLECTION_LANG,
  );
  const rows: TileRow[] = r.rows.map((c) => ({
    card_id: c.id,
    code: c.code,
    name: tMap.get(c.code)?.name ?? c.name,
    color: c.color,
    rarity: c.rarity,
    image_url: c.display_image,
    variant: c.variant,
    quantity: collMap.get(`${c.id}|${c.variant}`) ?? 0,
    restriction: restrictionMap.get(c.id) ?? null,
  }));
  const total: number = r.total;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Aggregate stats for the header — only counts owned cards in the user's
  // overall collection (not just the current filtered page).
  const ownedSummary = sumMap(digimon.getCollectionMap(me.id));

  return (
    <>
      <main className="w-full px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        <aside>
          {/* Same sheet as the card browser — the filters here are the same
              wall of controls, and on a phone they were pushing the whole
              collection below the fold. */}
          <FilterPanel activeCount={countActiveFilters(sp)}>
            <FilterForm
              basePath={`/${game}/collection`}
              fields={fields}
              sortOptions={sortOptions}
            />
          </FilterPanel>
        </aside>

        <section className="min-w-0">
          <div className="flex items-baseline justify-between mb-3">
            <h1 className="text-lg font-semibold">
              {m.search.collectionTitle}{" "}
              <span className="text-[var(--color-muted-fg)] font-normal text-sm">
                {m.search.ownedSummary(ownedSummary.cards, ownedSummary.copies)}
              </span>
            </h1>
            <div className="text-xs text-[var(--color-muted-fg)]">
              {m.search.pageOfTotal(page, totalPages, total)}
            </div>
          </div>

          <ActiveFilters basePath={`/${game}/collection`} specs={chipSpecs} />

          {rows.length === 0 ? (
            <div className="text-sm text-[var(--color-muted-fg)] py-12 text-center border border-dashed border-[var(--color-border)] rounded-lg">
              {m.search.noResults}
            </div>
          ) : (
            <div className="card-grid">
              {rows.map((row) => (
                <CollectionTile
                  key={`${row.card_id}|${row.variant}`}
                  game={game}
                  card={{
                    card_id: row.card_id,
                    code: row.code,
                    name: row.name,
                    color: row.color,
                    rarity: row.rarity,
                    image_url: row.image_url,
                    variant: row.variant,
                  }}
                  quantity={row.quantity}
                  restriction={row.restriction}
                />
              ))}
            </div>
          )}

          <Pagination
            page={page}
            totalPages={totalPages}
            hrefFor={(n) => {
              const params = new URLSearchParams();
              for (const [k, v] of Object.entries(sp)) {
                if (k === "page") continue;
                if (Array.isArray(v)) for (const it of v) params.append(k, it);
                else if (typeof v === "string") params.set(k, v);
              }
              if (n > 1) params.set("page", String(n));
              const qs = params.toString();
              return qs ? `/${game}/collection?${qs}` : `/${game}/collection`;
            }}
          />
        </section>
      </main>
    </>
  );
}

function sumMap(m: Map<string, number>): { cards: number; copies: number } {
  let copies = 0;
  for (const v of m.values()) copies += v;
  return { cards: m.size, copies };
}
