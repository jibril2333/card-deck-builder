import Link from "next/link";
import { Pagination } from "@/components/pagination";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { isGameId, type GameId } from "@/lib/games";
import { CARD_LANG_COOKIE, parseCardLang } from "@/lib/card-lang";
import {
  pickStr,
  pickList,
  pickNum,
  pickSort,
  countActiveFilters,
  type SearchParamsRecord,
} from "@/lib/search-params";
import { CardThumb, type CardLite } from "@/components/card-thumb";
import { FilterForm, type FilterField } from "@/components/filter-form";
import { FilterPanel } from "@/components/filter-panel";
import { ActiveFilters, type ChipSpec } from "@/components/active-filters";
import * as digimon from "@/lib/db/digimon";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

export default async function CardsPage({
  params,
  searchParams,
}: {
  params: Promise<{ game: string }>;
  searchParams: Promise<SearchParamsRecord>;
}) {
  const { game } = await params;
  if (!isGameId(game)) notFound();
  const cardLang = parseCardLang(
    (await cookies()).get(CARD_LANG_COOKIE)?.value,
  );
  const sp = await searchParams;
  const page = Math.max(1, pickNum(sp, "page") ?? 1);
  const offset = (page - 1) * PAGE_SIZE;
  const sort = pickSort(sp);

  let rows: CardLite[];
  let total: number;
  let fields: FilterField[];
  let sortOptions: { value: string; label: string }[];
  let chipSpecs: ChipSpec[];

  const colors = digimon.distinct("color");
  const types = digimon.distinct("card_type");
  // DB has mixed case ("SEC" + "sec" = same rarity from different sources).
  // Dedupe by uppercase so the UI shows one chip per actual rarity.
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
    {
      type: "search",
      key: "q",
      label: "关键词",
      placeholder: "名称 / 编号 · 空格分词",
      wideKey: "q_all",
      wideLabel: "同时搜索效果和特征",
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
    { type: "range", key: "level", label: "等级", options: levels },
    { type: "range", key: "play_cost", label: "费用", options: playCosts },
    {
      type: "range",
      key: "dp",
      label: "DP",
      options: dps.map((n) => ({ value: n, label: n.toLocaleString() })),
    },
    {
      type: "boolean",
      key: "has_inherited",
      label: "只看有继承效果的卡",
    },
    {
      type: "boolean",
      key: "has_security",
      label: "只看有安全区效果的卡",
    },
    {
      type: "boolean",
      key: "show_alt_arts",
      label: "异画各版本单独显示",
    },
    {
      type: "group",
      key: "more",
      label: "更多筛选",
      fields: [
        { type: "multi", key: "form", label: "Form", options: forms },
        { type: "multi", key: "stage", label: "Stage", options: stages },
        {
          type: "multi",
          key: "attribute",
          label: "属性",
          options: attributes,
        },
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
    { kind: "terms", key: "q", label: "关键词" },
    { kind: "list", key: "color", label: "颜色", colorChips: true },
    { kind: "list", key: "card_type", label: "类型" },
    { kind: "list", key: "rarity", label: "稀有度" },
    { kind: "range", minKey: "level_min", maxKey: "level_max", label: "等级" },
    {
      kind: "range",
      minKey: "play_cost_min",
      maxKey: "play_cost_max",
      label: "费用",
    },
    { kind: "range", minKey: "dp_min", maxKey: "dp_max", label: "DP" },
    { kind: "bool", key: "has_inherited", label: "有继承效果" },
    { kind: "bool", key: "has_security", label: "有安全区效果" },
    { kind: "bool", key: "show_alt_arts", label: "异画单列" },
    { kind: "list", key: "form", label: "Form" },
    { kind: "list", key: "stage", label: "Stage" },
    { kind: "list", key: "attribute", label: "属性" },
    { kind: "list", key: "set", label: "卡包" },
    {
      kind: "sort",
      key: "sort",
      labelMap: {
        code: "编号",
        name: "名称",
        level: "等级",
        play_cost: "费用",
        dp: "DP",
      },
    },
  ];

  const r = digimon.searchCards({
    q: pickStr(sp, "q"),
    // Names and codes by default, ranked by how well the NAME matches —
    // the same mode the add-a-card pickers use. Searching ドラゴン used to
    // return twelve cards not one of which was named that, because every
    // effect block was matched too. Ticking the box brings those back.
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
    show_alt_arts: pickStr(sp, "show_alt_arts") === "1",
    // Expand printings in the language being read. Without this the join
    // multiplies each card by however many languages we hold art for.
    art_lang: cardLang,
    sort_field: sort.field,
    sort_dir: sort.dir,
    limit: PAGE_SIZE,
    offset,
  });
  const encD = (s: string) =>
    s.split("/").map(encodeURIComponent).join("/");
  // Batch-load Cardrush prices for the entire visible page. variant ""
  // → "base" bucket, anything else → "parallel".
  const priceMap = digimon.getExternalPrices(r.rows.map((c) => c.id));
  const restrictionMap = digimon.getRestrictionMap(r.rows.map((c) => c.id));
  const tMap = digimon.getDisplayTranslations(
    r.rows.map((c) => c.code),
    cardLang,
  );
  rows = r.rows.map((c) => {
    const baseHref = `/${game}/card/${encD(c.code)}`;
    const href = c.variant
      ? `${baseHref}?v=${encodeURIComponent(c.variant)}`
      : baseHref;
    const priceKey = `${c.id}|${c.variant === "" ? "base" : "parallel"}`;
    const priceRow = priceMap.get(priceKey);
    const t = tMap.get(c.code);
    return {
      ...c,
      name: t?.name ?? c.name,
      // Alt-art tiles are pinned to their specific printing's art; only the
      // base tile swaps to the localized card image.
      image_url: c.variant
        ? c.display_image
        : (t?.image_url ?? c.display_image),
      variant_count: c.variant_count,
      href,
      market_price: priceRow?.price_yen ?? null,
      market_in_stock: priceRow?.in_stock ?? false,
      restriction: restrictionMap.get(c.id) ?? null,
    };
  });
  total = r.total;
  

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <main className="w-full px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        <aside>
          <FilterPanel activeCount={countActiveFilters(sp)}>
            <FilterForm
              basePath={`/${game}`}
              fields={fields}
              sortOptions={sortOptions}
            />
          </FilterPanel>
        </aside>

        <section className="min-w-0">
          <div className="flex items-baseline justify-between mb-3">
            <h1 className="text-lg font-semibold">
              卡牌检索{" "}
              <span className="text-[var(--color-muted-fg)] font-normal text-sm">
                {total.toLocaleString()} 张
              </span>
            </h1>
            <div className="text-xs text-[var(--color-muted-fg)]">
              第 {page} / {totalPages} 页
            </div>
          </div>

          <ActiveFilters basePath={`/${game}`} specs={chipSpecs} />

          {rows.length === 0 ? (
            <div className="text-sm text-[var(--color-muted-fg)] py-12 text-center border border-dashed border-[var(--color-border)] rounded-lg">
              没有符合条件的卡牌
            </div>
          ) : (
            <div className="card-grid">
              {rows.map((c) => (
                <CardThumb key={c.href ?? c.id} game={game} card={c} />
              ))}
            </div>
          )}

          <Pagination
            page={page}
            totalPages={totalPages}
            hrefFor={(p) => {
              // Every filter rides along; only `page` is replaced.
              const c = new URLSearchParams();
              for (const [k, v] of Object.entries(sp)) {
                if (k === "page" || v === undefined) continue;
                if (Array.isArray(v)) v.forEach((vv) => c.append(k, vv));
                else c.set(k, v);
              }
              if (p > 1) c.set("page", String(p));
              const qs = c.toString();
              return qs ? `/${game}?${qs}` : `/${game}`;
            }}
          />
        </section>
      </main>
    </>
  );
}
