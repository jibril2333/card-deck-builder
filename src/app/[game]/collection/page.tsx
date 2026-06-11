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

import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { isGameId, type GameId } from "@/lib/games";
import { CARD_LANG_COOKIE, parseCardLang } from "@/lib/card-lang";
import {
  pickStr,
  pickList,
  pickNum,
  pickSort,
  type SearchParamsRecord,
} from "@/lib/search-params";
import { TopNav } from "@/components/top-nav";
import {
  CollectionTile,
  type CollectionTileCard,
} from "@/components/collection-tile";
import { FilterForm, type FilterField } from "@/components/filter-form";
import { ActiveFilters, type ChipSpec } from "@/components/active-filters";
import { requireUser } from "@/lib/auth/session";
import * as digimon from "@/lib/db/digimon";
import * as ua from "@/lib/db/unionarena";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

type TileRow = CollectionTileCard & {
  quantity: number;
  restriction:
    | { status: "banned" | "limited_1" | "limited_2"; max_count: number }
    | null;
};

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ game: string }>;
  searchParams: Promise<SearchParamsRecord>;
}) {
  const me = await requireUser();
  const { game } = await params;
  if (!isGameId(game)) notFound();
  const sp = await searchParams;
  const page = Math.max(1, pickNum(sp, "page") ?? 1);
  const offset = (page - 1) * PAGE_SIZE;
  const sort = pickSort(sp);

  let rows: TileRow[];
  let total: number;
  let fields: FilterField[];
  let sortOptions: { value: string; label: string }[];
  let chipSpecs: ChipSpec[];

  if (game === "digimon") {
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

    fields = [
      { type: "search", key: "q", label: "关键词", placeholder: "名称 / 编号 / 效果" },
      {
        type: "multi",
        key: "color",
        label: "颜色",
        options: colors,
        colorChips: true,
        maxSelect: 2,
      },
      { type: "multi", key: "card_type", label: "类型", options: types },
      { type: "multi", key: "rarity", label: "稀有度", options: rarities },
      { type: "range", key: "level", label: "等级", options: levels },
      { type: "range", key: "play_cost", label: "费用", options: playCosts },
      {
        type: "range",
        key: "dp",
        label: "DP",
        options: dps.map((n) => ({ value: n, label: n.toLocaleString() })),
      },
      {
        type: "group",
        key: "more",
        label: "更多筛选",
        fields: [
          { type: "multi", key: "form", label: "Form", options: forms },
          { type: "multi", key: "stage", label: "Stage", options: stages },
          { type: "multi", key: "attribute", label: "属性", options: attributes },
          {
            type: "multi-scroll",
            key: "set",
            label: "卡包 / Card Set",
            options: setNames,
          },
        ],
      },
    ];

    sortOptions = [
      { value: "code", label: "编号 ↑" },
      { value: "-code", label: "编号 ↓" },
      { value: "name", label: "名称 ↑" },
      { value: "-name", label: "名称 ↓" },
      { value: "level", label: "等级 ↑" },
      { value: "-level", label: "等级 ↓" },
      { value: "play_cost", label: "费用 ↑" },
      { value: "-play_cost", label: "费用 ↓" },
      { value: "dp", label: "DP ↑" },
      { value: "-dp", label: "DP ↓" },
    ];

    chipSpecs = [
      { kind: "list", key: "color", label: "颜色" },
      { kind: "list", key: "card_type", label: "类型" },
      { kind: "list", key: "rarity", label: "稀有度" },
      { kind: "list", key: "form", label: "Form" },
      { kind: "list", key: "stage", label: "Stage" },
      { kind: "list", key: "attribute", label: "属性" },
      { kind: "list", key: "set", label: "卡包" },
      {
        kind: "range",
        minKey: "level_min",
        maxKey: "level_max",
        label: "等级",
      },
      {
        kind: "range",
        minKey: "play_cost_min",
        maxKey: "play_cost_max",
        label: "费用",
      },
      { kind: "range", minKey: "dp_min", maxKey: "dp_max", label: "DP" },
    ];

    const r = digimon.searchCards({
      q: pickStr(sp, "q"),
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
      show_alt_arts: true, // ← collection page forces alt-art expansion
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
      parseCardLang((await cookies()).get(CARD_LANG_COOKIE)?.value),
    );
    rows = r.rows.map((c) => ({
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
    total = r.total;
  } else {
    const colors = ua.distinct("color");
    const types = ua.distinct("card_type");
    const rarities = ua
      .distinct("rarity")
      .filter((r) => !r.startsWith("Pc") && !r.includes("★"));
    const series = (() => {
      const list = ua.seriesList().map((s) => s.name);
      const isEva = (s: string) =>
        s.includes("ヴァンゲリヲン") || s.includes("エヴァ");
      const eva = list.filter(isEva);
      const rest = list.filter((s) => !isEva(s));
      return [...eva, ...rest];
    })();
    const energies = ua.distinctNumbers("energy_cost");
    const aps = ua.distinctNumbers("ap_cost");
    const bps = ua.distinctNumbers("bp").filter((n) => n > 0);
    const packs = ua.distinctPacks();

    fields = [
      { type: "search", key: "q", label: "关键词", placeholder: "名称 / 编号 / 效果" },
      {
        type: "select",
        key: "series",
        label: "作品",
        options: series,
        placeholder: "全部作品",
      },
      {
        type: "multi",
        key: "color",
        label: "颜色",
        options: colors,
        colorChips: true,
        maxSelect: 2,
      },
      { type: "multi", key: "card_type", label: "类型", options: types },
      { type: "multi", key: "rarity", label: "稀有度", options: rarities },
      { type: "range", key: "energy_cost", label: "必要能量", options: energies },
      { type: "range", key: "ap_cost", label: "消耗 AP", options: aps },
      {
        type: "range",
        key: "bp",
        label: "BP",
        options: bps.map((n) => ({ value: n, label: n.toLocaleString() })),
      },
      {
        type: "group",
        key: "more",
        label: "更多筛选",
        fields: [
          {
            type: "multi-scroll",
            key: "pack",
            label: "卡包前缀",
            options: packs,
          },
        ],
      },
    ];

    sortOptions = [
      { value: "code", label: "编号 ↑" },
      { value: "-code", label: "编号 ↓" },
      { value: "name", label: "名称 ↑" },
      { value: "-name", label: "名称 ↓" },
      { value: "energy_cost", label: "能量 ↑" },
      { value: "-energy_cost", label: "能量 ↓" },
      { value: "bp", label: "BP ↑" },
      { value: "-bp", label: "BP ↓" },
    ];

    chipSpecs = [
      { kind: "single", key: "series", label: "作品" },
      { kind: "list", key: "color", label: "颜色" },
      { kind: "list", key: "card_type", label: "类型" },
      { kind: "list", key: "rarity", label: "稀有度" },
      { kind: "list", key: "pack", label: "卡包" },
      {
        kind: "range",
        minKey: "energy_min",
        maxKey: "energy_max",
        label: "能量",
      },
      {
        kind: "range",
        minKey: "ap_min",
        maxKey: "ap_max",
        label: "AP",
      },
      { kind: "range", minKey: "bp_min", maxKey: "bp_max", label: "BP" },
    ];

    const r = ua.searchCards({
      q: pickStr(sp, "q"),
      series_list: pickList(sp, "series"),
      colors: pickList(sp, "color"),
      card_types: pickList(sp, "card_type"),
      rarities: pickList(sp, "rarity"),
      packs: pickList(sp, "pack"),
      energy_min: pickNum(sp, "energy_min"),
      energy_max: pickNum(sp, "energy_max"),
      ap_min: pickNum(sp, "ap_min"),
      ap_max: pickNum(sp, "ap_max"),
      bp_min: pickNum(sp, "bp_min"),
      bp_max: pickNum(sp, "bp_max"),
      show_alt_arts: true, // ← collection forces alt-art expansion
      sort_field: sort.field,
      sort_dir: sort.dir,
      limit: PAGE_SIZE,
      offset,
    });
    const collMap = ua.getCollectionMap(me.id);
    const uaRestrictionMap = ua.getRestrictionMap(r.rows.map((c) => c.id));
    rows = r.rows.map((c) => ({
      card_id: c.id,
      code: c.code,
      name: c.name,
      color: c.color,
      rarity: c.rarity,
      image_url: c.image_url,
      variant: "",
      quantity: collMap.get(`${c.id}|`) ?? 0,
      restriction: uaRestrictionMap.get(c.id) ?? null,
    }));
    total = r.total;
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Aggregate stats for the header — only counts owned cards in the user's
  // overall collection (not just the current filtered page).
  const ownedSummary =
    game === "digimon"
      ? sumMap(digimon.getCollectionMap(me.id))
      : sumMap(ua.getCollectionMap(me.id));

  return (
    <>
      <TopNav game={game as GameId} active="collection" />
      <main className="w-full mx-auto max-w-7xl px-4 py-6 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        <aside>
          <FilterForm
            basePath={`/${game}/collection`}
            fields={fields}
            sortOptions={sortOptions}
          />
        </aside>

        <section className="min-w-0">
          <div className="flex items-baseline justify-between mb-3">
            <h1 className="text-lg font-semibold">
              已收集{" "}
              <span className="text-[var(--color-muted-fg)] font-normal text-sm">
                {ownedSummary.cards} 种 · 共 {ownedSummary.copies} 张
              </span>
            </h1>
            <div className="text-xs text-[var(--color-muted-fg)]">
              第 {page} / {totalPages} 页 · 共 {total.toLocaleString()} 张
            </div>
          </div>

          <ActiveFilters
            basePath={`/${game}/collection`}
            specs={chipSpecs}
          />

          {rows.length === 0 ? (
            <div className="text-sm text-[var(--color-muted-fg)] py-12 text-center border border-dashed border-[var(--color-border)] rounded-lg">
              没有符合条件的卡牌
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
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

          {totalPages > 1 ? (
            <Pagination
              basePath={`/${game}/collection`}
              page={page}
              totalPages={totalPages}
              sp={sp}
            />
          ) : null}
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

// ────────────────────────────────────────────────────────────────────────
// Pagination — same shape the search page uses. Duplicated here on purpose
// to avoid coupling collection routing to the search page's internals.
// ────────────────────────────────────────────────────────────────────────

function Pagination({
  basePath,
  page,
  totalPages,
  sp,
}: {
  basePath: string;
  page: number;
  totalPages: number;
  sp: SearchParamsRecord;
}) {
  function hrefFor(n: number): string {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (k === "page") continue;
      if (Array.isArray(v)) {
        for (const it of v) params.append(k, it);
      } else if (typeof v === "string") {
        params.set(k, v);
      }
    }
    if (n > 1) params.set("page", String(n));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }
  const prev = page > 1 ? hrefFor(page - 1) : null;
  const next = page < totalPages ? hrefFor(page + 1) : null;
  return (
    <nav className="mt-6 flex items-center justify-between gap-2">
      {prev ? (
        <Link
          href={prev}
          className="px-3 h-9 rounded-md border border-[var(--color-border)] text-sm hover:bg-[var(--color-muted)] inline-flex items-center"
        >
          ← 上一页
        </Link>
      ) : (
        <span className="px-3 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-muted-fg)] opacity-50 inline-flex items-center cursor-not-allowed">
          ← 上一页
        </span>
      )}
      <span className="text-xs text-[var(--color-muted-fg)]">
        第 {page} / {totalPages} 页
      </span>
      {next ? (
        <Link
          href={next}
          className="px-3 h-9 rounded-md border border-[var(--color-border)] text-sm hover:bg-[var(--color-muted)] inline-flex items-center"
        >
          下一页 →
        </Link>
      ) : (
        <span className="px-3 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-muted-fg)] opacity-50 inline-flex items-center cursor-not-allowed">
          下一页 →
        </span>
      )}
    </nav>
  );
}
